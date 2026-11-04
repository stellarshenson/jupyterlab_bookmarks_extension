import { expect, test } from '@jupyterlab/galata';
import { APIRequestContext } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import {
  bookmarks,
  holdRequest,
  openPanel,
  PANEL_ID,
  PLUGIN_ID,
  row,
  sectionLabel,
  WRITE_ROUTE
} from './helpers';

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
const MARKER = path.join(OLD_FOLDER, 'carried');
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
  const warnings: string[] = [];
  page.on('console', message => {
    if (message.type() === 'warning') {
      warnings.push(message.text());
    }
  });
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
  // The schema refuses an undeclared key in any case, so only its silence shows that it was skipped.
  expect(warnings.filter(text => text.includes('droppedLongAgo'))).toEqual([]);
  expect(
    warnings.filter(text => text.includes('markColour was not carried over'))
  ).toHaveLength(1);

  await page.reload();
  await openPanel(page);
  for (const name of OLD_ROWS) {
    await expect(row(page, name)).toHaveCount(1);
  }
  expect((await serverSetting(request)).settings.bookmarks).toEqual(SAVED);
});

test('Restore to Defaults after a carry does not bring the old rows back', async ({
  page,
  request
}) => {
  writeOldFile(OLD_TEXT);
  await page.goto();
  await openPanel(page);
  await expect(row(page, 'Old link')).toHaveCount(1);

  // Restore to Defaults removes every key, which leaves a file with none.
  const restored = await request.put(`/lab/api/settings/${PLUGIN_ID}`, {
    data: { raw: '{}' }
  });
  expect(restored.ok()).toBe(true);
  await page.reload();
  await openPanel(page);

  await expect(sectionLabel(page, 'links')).toHaveText('LINKS');
  for (const name of OLD_ROWS) {
    await expect(row(page, name)).toHaveCount(0);
  }
  expect((await serverSetting(request)).raw).toBe('{}');
  expect(fs.existsSync(MARKER)).toBe(true);
  expect(fs.readFileSync(OLD_FILE, 'utf8')).toBe(OLD_TEXT);
});

test('a server without the route shows the restart warning and the panel loads', async ({
  page
}) => {
  writeOldFile(OLD_TEXT);
  // The trailing star takes the query with which ServerConnection stops the browser's cache.
  await page.route('**/old-settings*', route => route.fulfill({ status: 404 }));
  await page.goto();
  await openPanel(page);

  await expect(
    page.getByText(
      'Bookmarks: restart the Jupyter server and reload this page before you add a bookmark.'
    )
  ).toBeVisible();
  await expect(sectionLabel(page, 'links')).toHaveText('LINKS');
  expect(fs.existsSync(MARKER)).toBe(false);
});

test('a save that answers 500 writes no marker and the next load carries', async ({
  page
}) => {
  writeOldFile(OLD_TEXT);
  let failed = false;
  await page.route(WRITE_ROUTE, route => {
    if (failed) {
      return route.fallback();
    }
    failed = true;
    return route.fulfill({ status: 500 });
  });
  await page.goto();
  await openPanel(page);

  expect(failed).toBe(true);
  expect(fs.existsSync(MARKER)).toBe(false);

  await page.reload();
  await openPanel(page);
  for (const name of OLD_ROWS) {
    await expect(row(page, name)).toHaveCount(1);
  }
});

test('the panel is added only after the carry has finished', async ({
  page
}) => {
  writeOldFile(OLD_TEXT);
  const read = await holdRequest(page, '**/old-settings*');
  const marker = await holdRequest(
    page,
    '**/old-settings*',
    request => request.method() === 'POST'
  );
  await page.addInitScript(() => {
    const counts = new Set<string>();
    (window as any).linksCounts = counts;
    new MutationObserver(() => {
      const count = document.querySelector(
        '.jp-BookmarksPanel-section[data-section="links"] .jp-BookmarksPanel-sectionCount'
      );
      if (count?.textContent) {
        counts.add(count.textContent);
      }
    }).observe(document, {
      subtree: true,
      childList: true,
      characterData: true
    });
  });
  // The plugin adds the panel in the task after its await of the carry, so a panel that did not wait
  // is in the side bar when the carry's request leaves the page.
  const panelAdded = () =>
    page.evaluate(
      id =>
        [...(window as any).jupyterapp.shell.widgets('left')].some(
          widget => widget.id === id
        ),
      PANEL_ID
    );
  const loaded = page.goto();
  await read.held;
  expect(await panelAdded()).toBe(false);
  read.release();
  await marker.held;
  expect(await panelAdded()).toBe(false);
  marker.release();
  await loaded;
  await openPanel(page);

  await expect(sectionLabel(page, 'links')).toHaveText('LINKS');
  expect(
    await page.evaluate(() => Array.from((window as any).linksCounts))
  ).toEqual(['(2)']);
});

test('a page that read the settings before another page carried shows the bookmarks', async ({
  page,
  request
}) => {
  writeOldFile(OLD_TEXT);
  const route = await holdRequest(page, '**/old-settings*');
  // The plugin's activation awaits the route, and page.goto awaits the activation.
  const loaded = page.goto();
  await route.held;
  // This page has read the settings. The other page now saves and posts its marker.
  const saved = await request.put(`/lab/api/settings/${PLUGIN_ID}`, {
    data: { raw: JSON.stringify({ bookmarks: SAVED }) }
  });
  expect(saved.ok()).toBe(true);
  const posted = await request.post(
    '/jupyterlab-bookmarks-manager-extension/old-settings'
  );
  expect(posted.status()).toBe(204);
  route.release();
  await loaded;
  await openPanel(page);

  for (const name of OLD_ROWS) {
    await expect(row(page, name)).toHaveCount(1);
  }
});

test('a load with nothing to carry sends no extra settings request', async ({
  page
}) => {
  const reads: string[] = [];
  page.on('request', request => {
    if (
      request.method() === 'GET' &&
      decodeURIComponent(request.url()).includes(
        `/lab/api/settings/${PLUGIN_ID}`
      )
    ) {
      reads.push(request.url());
    }
  });
  await page.goto();
  await openPanel(page);

  await expect(sectionLabel(page, 'links')).toHaveText('LINKS');
  expect(reads).toEqual([]);
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

  await expect(sectionLabel(page, 'links')).toHaveText('LINKS');
  expect(fs.existsSync(NEW_FILE)).toBe(false);
});

test('a lab with no old file writes nothing', async ({ page }) => {
  await page.goto();
  await openPanel(page);

  await expect(sectionLabel(page, 'links')).toHaveText('LINKS');
  expect(fs.existsSync(NEW_FILE)).toBe(false);
});
