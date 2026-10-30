import { expect, test } from '@jupyterlab/galata';
import { APIRequestContext } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { bookmarks, openPanel, PLUGIN_ID, row, sectionLabel } from './helpers';

// The real settings folder of the test server, not galata's in-browser mock: the server reads the
// old file and the registry saves the new one. Each test starts with neither file.
test.use({ mockSettings: false, autoGoto: false });

const SETTINGS_DIR = process.env.JUPYTERLAB_SETTINGS_DIR!;
const FILE = 'plugin.jupyterlab-settings';
const OLD_FOLDER = path.join(
  SETTINGS_DIR,
  'jupyterlab_bookmarks_manager_extension'
);
const OLD_FILE = path.join(OLD_FOLDER, FILE);
const NEW_FILE = path.join(SETTINGS_DIR, PLUGIN_ID.split(':')[0], FILE);

const link = (id: string, name: string) => ({
  kind: 'link',
  id,
  name,
  url: `https://example.com/${id}/`
});

const SAVED = bookmarks({
  links: [
    link('docs', 'Old link'),
    {
      kind: 'folder',
      id: 'folder',
      name: 'Old folder',
      children: [link('inside', 'Old link in a folder')]
    }
  ],
  files: [{ kind: 'file', id: 'note', name: 'Old file', path: 'note.txt' }],
  sessions: [
    {
      kind: 'session',
      id: 'shell',
      name: 'Old session',
      cwd: '/tmp',
      command: 'sleep 300',
      env: { K: 'v' }
    }
  ]
});

const OLD_ROWS = [
  'Old link',
  'Old folder',
  'Old link in a folder',
  'Old file',
  'Old session'
];

/** Text as JupyterLab writes it, with comment lines. A rejected key comes first, so later keys need the reload. */
const OLD_TEXT = `{
    // Bookmarks
    // Marker colour
    "markColour": "no-such-colour",
    // Dropped from the schema long ago
    "droppedLongAgo": true,
    // Bookmarks of links, files and terminal sessions, in folders.
    "bookmarks": ${JSON.stringify(SAVED)},
    // Proxy days
    "recentProxyTtlDays": 9
}
`;

function writeOldFile(text: string): void {
  fs.mkdirSync(OLD_FOLDER, { recursive: true });
  fs.writeFileSync(OLD_FILE, text);
}

function removeBothFiles(): void {
  fs.rmSync(OLD_FOLDER, { recursive: true, force: true });
  fs.rmSync(NEW_FILE, { force: true });
}

/** What the server holds for the plugin: the parsed settings and the raw text. */
async function serverSetting(
  request: APIRequestContext
): Promise<{ raw: string; settings: Record<string, unknown> }> {
  const response = await request.get(`/lab/api/settings/${PLUGIN_ID}`);
  expect(response.ok()).toBe(true);
  return response.json();
}

test.beforeEach(removeBothFiles);
test.afterEach(removeBothFiles);

test('a lab upgraded from the old name shows its bookmarks and keeps them on a reload', async ({
  page,
  request
}) => {
  writeOldFile(OLD_TEXT);
  await page.goto();
  await openPanel(page);

  for (const name of OLD_ROWS) {
    await expect(row(page, name)).toHaveCount(1);
  }
  const { raw, settings } = await serverSetting(request);
  expect(settings.bookmarks).toEqual(SAVED);
  expect(settings.recentProxyTtlDays).toBe(9);
  expect(raw).not.toContain('droppedLongAgo');
  expect(raw).not.toContain('no-such-colour');
  expect(fs.readFileSync(OLD_FILE, 'utf8')).toBe(OLD_TEXT);

  await page.reload();
  await openPanel(page);
  for (const name of OLD_ROWS) {
    await expect(row(page, name)).toHaveCount(1);
  }
  expect((await serverSetting(request)).settings.bookmarks).toEqual(SAVED);
});

test('a file already at the new path stays, and only its missing keys are carried', async ({
  page,
  request
}) => {
  // Where the server extension of stellars_jupyterlab_extensions leaves a copy at server start.
  const kept = bookmarks({ links: [link('kept', 'Kept link')] });
  fs.mkdirSync(path.dirname(NEW_FILE), { recursive: true });
  fs.writeFileSync(NEW_FILE, JSON.stringify({ bookmarks: kept }));
  writeOldFile(OLD_TEXT);

  await page.goto();
  await openPanel(page);

  await expect(row(page, 'Kept link')).toHaveCount(1);
  await expect(row(page, 'Old link')).toHaveCount(0);
  const { settings } = await serverSetting(request);
  expect(settings.bookmarks).toEqual(kept);
  expect(settings.recentProxyTtlDays).toBe(9);
});

test('a broken old file leaves the panel working and writes nothing', async ({
  page
}) => {
  writeOldFile('{ not settings');
  await page.goto();
  await openPanel(page);

  await expect(sectionLabel(page, 'links')).toHaveText('LINKS (0)');
  expect(fs.existsSync(NEW_FILE)).toBe(false);
});

test('a lab with no old file writes nothing', async ({ page }) => {
  await page.goto();
  await openPanel(page);

  await expect(sectionLabel(page, 'links')).toHaveText('LINKS (0)');
  expect(fs.existsSync(NEW_FILE)).toBe(false);
});
