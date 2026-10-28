import { expect } from '@jupyterlab/galata';
import { execFileSync } from 'child_process';
import { openPanel, row, test } from './helpers';

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
