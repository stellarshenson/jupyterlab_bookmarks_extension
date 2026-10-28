import { expect, test } from '@jupyterlab/galata';
import { APIRequestContext } from '@playwright/test';
import {
  bookmarks,
  contextMenu,
  openPanel,
  PLUGIN_ID,
  plusMenu,
  row,
  section,
  sectionLabel
} from './helpers';

// The real settings registry of the test server, not galata's in-browser mock. The tests of
// this file run one after another in one worker (fullyParallel is off) and each one first
// writes the value it starts from.
test.use({ mockSettings: false, autoGoto: false });

const SETTING = `/lab/api/settings/${PLUGIN_ID}`;

async function writeBookmarks(
  request: APIRequestContext,
  value: Record<string, unknown>
): Promise<void> {
  const response = await request.put(SETTING, {
    data: { raw: JSON.stringify({ bookmarks: value }) }
  });
  expect(response.ok()).toBe(true);
}

async function readBookmarks(request: APIRequestContext): Promise<unknown> {
  const response = await request.get(SETTING);
  expect(response.ok()).toBe(true);
  return (await response.json()).settings.bookmarks;
}

const SECTIONS = [
  ['links', 'Links'],
  ['files', 'Files'],
  ['sessions', 'Sessions']
] as const;

test('bookmarks survive a reload', async ({ page, request }) => {
  await writeBookmarks(
    request,
    bookmarks({
      links: [
        {
          kind: 'link',
          id: 'docs',
          name: 'Docs',
          url: 'https://example.com/docs/'
        }
      ],
      files: [{ kind: 'file', id: 'b', name: 'b.txt', path: 'b.txt' }],
      sessions: [
        {
          kind: 'session',
          id: 'shell',
          name: 'shell - tmp',
          cwd: '/tmp',
          command: '',
          env: {}
        }
      ]
    })
  );
  await page.goto();
  await openPanel(page);
  for (const [, title] of SECTIONS) {
    await plusMenu(page, title, 'New Folder');
    await page.locator('.jp-Dialog input').fill(`${title} folder`);
    await page.locator('.jp-Dialog .jp-mod-accept').click();
    await expect(row(page, `${title} folder`)).toBeVisible();
  }
  const expected = {
    links: ['Docs', 'Links folder'],
    files: ['b.txt', 'Files folder'],
    sessions: ['shell - tmp', 'Sessions folder']
  };
  const names = (key: keyof typeof expected) =>
    section(page, key).locator('.jp-BookmarksPanel-rowText');
  for (const [key] of SECTIONS) {
    await expect(names(key)).toHaveText(expected[key]);
  }

  await page.reload();
  await openPanel(page);
  for (const [key] of SECTIONS) {
    await expect(names(key)).toHaveText(expected[key]);
    await expect(
      section(page, key).locator('.jp-BookmarksPanel-folder')
    ).toHaveCount(1);
  }
});

test('bookmarks are in the plugin setting', async ({
  page,
  request,
  tmpPath,
  baseURL
}) => {
  await writeBookmarks(request, bookmarks());
  await page.contents.uploadContent('note', 'text', `${tmpPath}/note.txt`);
  await page.contents.uploadContent(
    '<html><head><title>Page</title></head><body>page</body></html>',
    'text',
    `${tmpPath}/page.html`
  );
  await page.goto();

  // A file and a link through the tab menu; a session bookmark needs the terminal branch of
  // the tab menu (run sessions), so the Sessions entry is a folder.
  await page.filebrowser.open(`${tmpPath}/note.txt`);
  await contextMenu(
    page,
    page.activity.getTabLocator('note.txt'),
    'Add Tab to Bookmarks'
  );
  await page.evaluate(async url => {
    await (window as any).jupyterapp.commands.execute('help:open', {
      url,
      text: 'Page'
    });
  }, `${baseURL}/files/${tmpPath}/page.html`);
  await contextMenu(
    page,
    page.activity.getTabLocator('Page'),
    'Add Tab to Bookmarks'
  );
  await openPanel(page);
  await plusMenu(page, 'Sessions', 'New Folder');
  await page.locator('.jp-Dialog input').fill('Shells');
  await page.locator('.jp-Dialog .jp-mod-accept').click();
  await expect(sectionLabel(page, 'links')).toHaveText('LINKS (1)');
  await expect(sectionLabel(page, 'files')).toHaveText('FILES (1)');
  await expect(row(page, 'Shells')).toBeVisible();

  await expect
    .poll(() => readBookmarks(request))
    .toEqual({
      version: 1,
      links: [
        {
          kind: 'link',
          id: expect.any(String),
          name: 'Page',
          url: `files/${tmpPath}/page.html`
        }
      ],
      files: [
        {
          kind: 'file',
          id: expect.any(String),
          name: 'note.txt',
          path: `${tmpPath}/note.txt`
        }
      ],
      sessions: [
        { kind: 'folder', id: expect.any(String), name: 'Shells', children: [] }
      ]
    });
});

test('setting accepts a folder inside a folder', async ({ page, request }) => {
  await writeBookmarks(request, bookmarks());
  await page.goto();
  await openPanel(page);
  const value = bookmarks({
    links: [
      {
        kind: 'folder',
        id: 'outer',
        name: 'Outer',
        children: [
          {
            kind: 'folder',
            id: 'inner',
            name: 'Inner',
            children: [{ kind: 'link', id: 'deep', name: 'Deep', url: 'deep/' }]
          }
        ]
      }
    ]
  });

  // set() validates against the schema in the browser and on the server, and rejects on an error.
  await page.evaluate(
    async ({ id, value }) => {
      const registry = await (window as any).galata.getPlugin(
        '@jupyterlab/apputils-extension:settings'
      );
      await registry.set(id, 'bookmarks', value);
    },
    { id: PLUGIN_ID, value }
  );
  expect(await readBookmarks(request)).toEqual(value);
  await expect(row(page, 'Deep')).toHaveAttribute('aria-level', '3');
});
