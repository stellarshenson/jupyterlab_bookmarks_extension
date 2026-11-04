import { expect, IJupyterLabPageFixture, test } from '@jupyterlab/galata';
import { APIRequestContext } from '@playwright/test';
import {
  bookmarks,
  contextMenu,
  holdSettingsWrite,
  openPanel,
  PLUGIN_ID,
  plusMenu,
  row,
  section,
  sectionLabel,
  WRITE_ROUTE
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
  await expect(sectionLabel(page, 'links')).toHaveText('LINKS');
  await expect(sectionLabel(page, 'files')).toHaveText('FILES');
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
          url: `files/${tmpPath}/page.html`,
          icon: expect.any(String)
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

const OUTSIDE = {
  kind: 'link',
  id: 'outside',
  name: 'Outside',
  url: 'https://example.com/outside/'
};

/** New Folder in Links, named `name`. */
async function newFolder(
  page: IJupyterLabPageFixture,
  name: string
): Promise<void> {
  await plusMenu(page, 'Links', 'New Folder');
  await page.locator('.jp-Dialog input').fill(name);
  await page.locator('.jp-Dialog .jp-mod-accept').click();
}

/** What the JSON Settings Editor's Save runs: settings.save(text) reaches registry.upload. */
function uploadSettings(
  page: IJupyterLabPageFixture,
  text: string
): Promise<void> {
  return page.evaluate(
    async ({ id, text }) => {
      const registry = await (window as any).galata.getPlugin(
        '@jupyterlab/apputils-extension:settings'
      );
      await registry.upload(id, text);
    },
    { id: PLUGIN_ID, text }
  );
}

test('a held page save loses to an outside write and keeps both', async ({
  page,
  request
}) => {
  await writeBookmarks(request, bookmarks());
  await page.goto();
  await openPanel(page);
  const write = await holdSettingsWrite(page);

  await newFolder(page, 'Mine');
  await write.held;
  // Another writer saves between this page's read and its write.
  await writeBookmarks(request, bookmarks({ links: [OUTSIDE] }));
  write.release();

  await expect(row(page, 'Mine')).toBeVisible();
  await expect(row(page, 'Outside')).toBeVisible();
  expect(await readBookmarks(request)).toEqual(
    bookmarks({
      links: [
        OUTSIDE,
        { kind: 'folder', id: expect.any(String), name: 'Mine', children: [] }
      ]
    })
  );
});

test('a server without the write route says to restart and writes nothing', async ({
  page,
  request
}) => {
  await writeBookmarks(request, bookmarks());
  await page.route(WRITE_ROUTE, route => route.fulfill({ status: 404 }));
  await page.goto();
  await openPanel(page);

  await newFolder(page, 'Lost');

  await expect(
    page.getByText(
      'Bookmarks: restart the Jupyter server and reload this page before you add a bookmark.'
    )
  ).toBeVisible();
  expect(await readBookmarks(request)).toEqual(bookmarks());
});

test('the form keeps an outside write', async ({ page, request }) => {
  // Every kind of node, because the form hands back its own copy of the value.
  const first = bookmarks({
    links: [
      { kind: 'link', id: 'docs', name: 'Docs', url: 'https://example.com/' },
      {
        kind: 'folder',
        id: 'folder',
        name: 'Folder',
        children: [
          { kind: 'link', id: 'in', name: 'In', url: 'https://example.com/in/' }
        ]
      }
    ],
    files: [{ kind: 'file', id: 'b', name: 'b.txt', path: 'b.txt' }],
    sessions: [
      {
        kind: 'session',
        id: 'shell',
        name: 'shell',
        cwd: '/tmp',
        command: 'sleep 300',
        env: { K: 'v' }
      }
    ]
  });
  await writeBookmarks(request, first);
  await page.goto();
  await page.evaluate(async () => {
    await (window as any).jupyterapp.commands.execute('settingeditor:open', {
      query: 'Bookmarks'
    });
  });
  await page.locator(`.jp-PluginList-entry[data-id="${PLUGIN_ID}"]`).click();
  const colour = page.locator('.jp-SettingsForm select[id$="_markColour"]');
  await expect(colour).toBeVisible();

  // This page holds the older value, and nothing tells it about the write.
  const links = [...(first.links as unknown[]), OUTSIDE];
  await writeBookmarks(request, { ...first, links });
  await colour.selectOption({ label: 'Red' });

  await expect
    .poll(
      async () =>
        (await (await request.get(SETTING)).json()).settings.markColour
    )
    .toBe('red');
  expect(await readBookmarks(request)).toEqual({ ...first, links });
  await openPanel(page);
  await expect(row(page, 'Outside')).toBeVisible();
});

test('a registry.upload of a text older than twenty adds keeps all twenty', async ({
  page,
  request
}) => {
  await writeBookmarks(request, bookmarks());
  await page.goto();
  await openPanel(page);
  const text = (await (await request.get(SETTING)).json()).raw;

  const names = Array.from({ length: 20 }, (_, add) => `Added ${add}`);
  for (const name of names) {
    await newFolder(page, name);
    await expect(row(page, name)).toBeVisible();
  }
  const savedNames = async () =>
    ((await readBookmarks(request)) as { links: { name: string }[] }).links.map(
      node => node.name
    );
  await expect.poll(savedNames).toEqual(names);

  await uploadSettings(page, text);

  expect(await savedNames()).toEqual(names);
  for (const name of names) {
    await expect(row(page, name)).toBeVisible();
  }
});

test('a hand edit in the JSON view on an old read is refused and the file stays', async ({
  page,
  request
}) => {
  const first = bookmarks({ links: [OUTSIDE] });
  await writeBookmarks(request, first);
  await page.goto();
  await page.evaluate(async () => {
    await (window as any).jupyterapp.commands.execute(
      'settingeditor:open-json'
    );
  });
  await page.locator(`.jp-PluginList-entry[data-id="${PLUGIN_ID}"]`).click();
  const editor = page.locator('.jp-SettingsRawEditor-user .cm-content');
  await expect(editor).toContainText('Outside');

  // This page holds the older value, and nothing tells it about the write.
  const later = { ...OUTSIDE, id: 'later', name: 'Later' };
  await writeBookmarks(request, { ...first, links: [OUTSIDE, later] });
  const saved = (await (await request.get(SETTING)).json()).raw;
  await editor.click();
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.insertText(
    JSON.stringify({
      bookmarks: bookmarks({ links: [{ ...OUTSIDE, name: 'Typed' }] })
    })
  );
  await expect(editor).toContainText('Typed');
  await page.evaluate(async () => {
    await (window as any).jupyterapp.commands.execute('settingeditor:save');
  });

  const dialog = page.locator('.jp-Dialog');
  await expect(dialog).toContainText('Your changes were not saved.');
  await expect(dialog).toContainText('changed outside this page');
  expect((await (await request.get(SETTING)).json()).raw).toBe(saved);
});

test('a hand edit of bookmarks in the JSON Settings Editor still saves', async ({
  page,
  request
}) => {
  await writeBookmarks(request, bookmarks({ links: [OUTSIDE] }));
  await page.goto();
  await openPanel(page);
  const edited = bookmarks({ links: [{ ...OUTSIDE, name: 'Edited by hand' }] });
  const text = `// Typed in the JSON Settings Editor\n${JSON.stringify({
    bookmarks: edited
  })}`;

  await uploadSettings(page, text);

  expect((await (await request.get(SETTING)).json()).raw).toBe(text);
  await expect(row(page, 'Edited by hand')).toBeVisible();
  await expect(row(page, 'Outside')).toHaveCount(0);
});
