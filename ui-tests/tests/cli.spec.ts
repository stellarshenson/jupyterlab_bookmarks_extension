import { expect } from '@jupyterlab/galata';
import { execFileSync } from 'child_process';
import { mkdtempSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import * as path from 'path';
import { bookmarks, openPanel, PLUGIN_ID, row, test } from './helpers';

// The real settings file of the test server, not galata's in-browser mock: the CLI writes it.
// storage.spec.ts shares that file, so playwright.config.js runs the suite in one worker.
test.use({ mockSettings: false });

// The variables that name a lab or carry a token. A JupyterLab terminal exports them, and a
// run from one would send the CLI into the developer's lab instead of the test lab.
const DISCOVERY = [
  'JUPYTERHUB_API_TOKEN',
  'JPY_API_TOKEN',
  'JUPYTER_TOKEN',
  'JUPYTER_PORT',
  'JUPYTER_SERVER_URL',
  'JUPYTER_SERVER_ROOT',
  'JUPYTERHUB_SERVICE_PREFIX',
  'JUPYTERHUB_SERVICE_URL'
];

/** The test lab's port alone names it; it carries no token, so no variable supplies one. */
function cliEnv(baseURL: string) {
  const env = { ...process.env };
  for (const name of DISCOVERY) {
    delete env[name];
  }
  env.JUPYTER_PORT = new URL(baseURL).port;
  return env;
}

/** Runs the installed console script and returns the id it printed; a non-zero exit fails the test. */
function add(
  env: { [name: string]: string | undefined },
  ...args: string[]
): string {
  const id = execFileSync('jupyterlab-bookmarks', args, { env })
    .toString()
    .trim();
  expect(id).toMatch(
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
  );
  return id;
}

test('the command line adds a link, a file and a session the panel shows', async ({
  page,
  baseURL,
  tmpPath
}) => {
  const env = cliEnv(baseURL);
  await page.contents.uploadContent('note', 'text', `${tmpPath}/cli-note.txt`);
  add(env, 'add', 'link', 'https://example.com/bookmarks-cli');
  add(env, 'add', 'file', `${tmpPath}/cli-note.txt`);
  add(env, 'add', 'session', 'sleep 300', '--cwd', '/tmp', '--env', 'K=v');

  // The panel reads the setting at page load; nothing watches the settings file.
  await page.reload();
  await openPanel(page);

  await expect(row(page, 'https://example.com/bookmarks-cli')).toBeVisible();
  await expect(row(page, 'cli-note.txt')).toBeVisible();
  await expect(row(page, 'sleep 300')).toBeVisible();
});

test('with no lab found the command line adds to the file the registry saved', async ({
  page,
  baseURL
}) => {
  const value = bookmarks({
    links: [
      { kind: 'link', id: 'saved', name: 'Saved', url: 'https://example.com/' }
    ]
  });
  await page.evaluate(
    async ({ id, value }) => {
      const registry = await (window as any).galata.getPlugin(
        '@jupyterlab/apputils-extension:settings'
      );
      await registry.set(id, 'bookmarks', value);
    },
    { id: PLUGIN_ID, value }
  );

  // No record of a running server and no variable that names one, so the CLI takes the file.
  const env = cliEnv(baseURL);
  delete env.JUPYTER_PORT;
  env.JUPYTER_RUNTIME_DIR = mkdtempSync(path.join(tmpdir(), 'no-lab-'));
  add(env, 'add', 'link', 'https://example.com/added', '--name', 'Added');

  const file = path.join(
    process.env.JUPYTERLAB_SETTINGS_DIR!,
    PLUGIN_ID.split(':')[0],
    'plugin.jupyterlab-settings'
  );
  const saved = JSON.parse(readFileSync(file, 'utf8'));
  expect(
    saved.bookmarks.links.map((node: { name: string }) => node.name)
  ).toEqual(['Saved', 'Added']);

  await page.reload();
  await openPanel(page);
  await expect(row(page, 'Saved')).toBeVisible();
  await expect(row(page, 'Added')).toBeVisible();
});
