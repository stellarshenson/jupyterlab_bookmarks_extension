import { expect, IJupyterLabPageFixture } from '@jupyterlab/galata';
import {
  contextMenu,
  mockBookmarks,
  openPanel,
  PLUGIN_ID,
  row,
  tabMark,
  test,
  tokenColour
} from './helpers';

test.use({ mockSettings: mockBookmarks() });

const basename = (path: string) => path.split('/').pop()!;

const tab = (page: IJupyterLabPageFixture, path: string) =>
  page.activity.getTabLocator(basename(path));

/** Opens the file from the file browser; its tab becomes the current tab. */
async function openFile(
  page: IJupyterLabPageFixture,
  path: string
): Promise<void> {
  // The file browser lists the file only while its side-bar tab is open.
  await page.sidebar.openTab('filebrowser');
  await page.filebrowser.open(path);
  await expect(tab(page, path)).toBeVisible();
}

/** The marker colour of each option, set through the registry the Settings Editor saves through. */
async function setMarkColour(
  page: IJupyterLabPageFixture,
  value: 'brand' | 'red'
): Promise<void> {
  await page.evaluate(
    async ({ plugin, value }) => {
      const registry = await (window as any).galata.getPlugin(
        '@jupyterlab/apputils-extension:settings'
      );
      await registry.set(plugin, 'markColour', value);
    },
    { plugin: PLUGIN_ID, value }
  );
}

test('a bookmarked file tab carries the ribbon', async ({ page, tmpPath }) => {
  const path = `${tmpPath}/note.txt`;
  await page.contents.uploadContent('note', 'text', path);
  await openFile(page, path);
  const element = tab(page, path);
  expect((await tabMark(element)).content).toBe('none');

  await contextMenu(page, element, 'Add Tab to Bookmarks');
  await expect(element).toHaveAttribute('data-bookmark', 'brand');
  const mark = await tabMark(element);
  expect(mark.content).not.toBe('none');
  expect(mark.width).toBe('7px');
  expect(mark.height).toBe('11px');
  expect(mark.colour).toBe(await tokenColour(element, '--jp-brand-color1'));

  // The colourful-tab extension paints the tab and every element in it; the ribbon must stay.
  // The tab is current, so the extension paints its active shade.
  await element.evaluate(el => el.classList.add('jp-colourful-tab-mint'));
  await expect(element).toHaveCSS(
    'background-color',
    await tokenColour(element, '--jp-colourful-tab-mint-active')
  );
  expect((await tabMark(element)).colour).toBe(
    await tokenColour(element, '--jp-brand-color1')
  );

  await contextMenu(page, element, 'Remove Tab from Bookmarks');
  await expect(element).not.toHaveAttribute('data-bookmark');
  await expect.poll(async () => (await tabMark(element)).content).toBe('none');
});

test('a bookmarked web tab carries the ribbon', async ({ page, tmpPath }) => {
  await page.contents.uploadContent(
    '<html><head><title>Page</title></head><body>Page</body></html>',
    'text',
    `${tmpPath}/page.html`
  );
  await page.evaluate(async url => {
    await (window as any).jupyterapp.commands.execute('help:open', {
      url,
      text: 'Marked page'
    });
  }, `${tmpPath}/page.html`);
  const element = page.activity.getTabLocator('Marked page');
  await expect(element).toBeVisible();

  await contextMenu(page, element, 'Add Tab to Bookmarks');
  await expect(element).toHaveAttribute('data-bookmark', 'brand');
  await expect
    .poll(async () => (await tabMark(element)).content)
    .not.toBe('none');

  await contextMenu(page, element, 'Remove Tab from Bookmarks');
  await expect(element).not.toHaveAttribute('data-bookmark');
  await expect.poll(async () => (await tabMark(element)).content).toBe('none');
});

test('a bookmarked tab in the down area carries the ribbon and the row dot', async ({
  page,
  tmpPath
}) => {
  const path = `${tmpPath}/down.txt`;
  await page.contents.uploadContent('down', 'text', path);
  await openFile(page, path);
  const id = (await tab(page, path).getAttribute('data-id'))!;
  await page.evaluate(async widgetId => {
    await (window as any).jupyterapp.commands.execute(
      'application:move-widget',
      { area: 'down', id: widgetId }
    );
  }, id);

  const down = page.locator(`#jp-down-stack .lm-TabBar-tab[data-id="${id}"]`);
  await expect(down).toBeVisible();
  await contextMenu(page, down, 'Add Tab to Bookmarks');
  await expect(down).toHaveAttribute('data-bookmark', 'brand');
  expect((await tabMark(down)).width).toBe('7px');

  await openPanel(page);
  await expect(
    row(page, 'down.txt').locator('.jp-BookmarksPanel-rowMark')
  ).toBeVisible();
});

test('the panel marks open bookmarks and tints the current row', async ({
  page,
  tmpPath
}) => {
  const a = `${tmpPath}/open-a.txt`;
  const b = `${tmpPath}/open-b.txt`;
  await page.contents.uploadContent('a', 'text', a);
  await page.contents.uploadContent('b', 'text', b);
  await openFile(page, a);
  await contextMenu(page, tab(page, a), 'Add Tab to Bookmarks');
  await openFile(page, b);
  await contextMenu(page, tab(page, b), 'Add Tab to Bookmarks');
  await openPanel(page);

  const rowA = row(page, 'open-a.txt');
  const rowB = row(page, 'open-b.txt');
  await expect(rowA.locator('.jp-BookmarksPanel-rowMark')).toBeVisible();
  await expect(rowB.locator('.jp-BookmarksPanel-rowMark')).toBeVisible();
  await expect(rowA).toHaveAttribute('aria-label', 'open-a.txt, open');
  // The second file is the current tab, so its row carries the tint and the first does not.
  const tint = await rowA.evaluate(() => {
    const probe = document.createElement('div');
    probe.style.backgroundColor =
      'color-mix(in srgb, var(--jp-brand-color1) 14%, var(--jp-layout-color1))';
    document.body.appendChild(probe);
    const colour = getComputedStyle(probe).backgroundColor;
    probe.remove();
    return colour;
  });
  await expect(rowB).toHaveCSS('background-color', tint);
  await expect(rowA).not.toHaveCSS('background-color', tint);
  await expect(rowB).toHaveClass(/jp-mod-current/);
  await expect(rowA).not.toHaveClass(/jp-mod-current/);

  await page.activity.activateTab('open-a.txt');
  await expect(rowA).toHaveClass(/jp-mod-current/);
  await expect(rowA).toHaveCSS('background-color', tint);
  await expect(rowB).not.toHaveClass(/jp-mod-current/);

  // Closing the second tab takes its dot away; the first keeps the current tint and its dot.
  await tab(page, b).locator('.lm-TabBar-tabCloseIcon').click();
  await expect(rowB.locator('.jp-BookmarksPanel-rowMark')).toHaveCount(0);
  await expect(rowB).toHaveAttribute('aria-label', 'open-b.txt');
  await expect(rowA.locator('.jp-BookmarksPanel-rowMark')).toBeVisible();
  await expect(rowA).toHaveClass(/jp-mod-current/);
});

test('the marker colour follows the setting without a page reload', async ({
  page,
  tmpPath
}) => {
  const path = `${tmpPath}/colour.txt`;
  await page.contents.uploadContent('colour', 'text', path);
  await openFile(page, path);
  await contextMenu(page, tab(page, path), 'Add Tab to Bookmarks');
  await openPanel(page);

  const element = tab(page, path);
  const dot = row(page, 'colour.txt').locator('.jp-BookmarksPanel-rowMark');
  await expect(element).toHaveAttribute('data-bookmark', 'brand');
  await expect(dot).toBeVisible();
  expect((await tabMark(element)).colour).toBe(
    await tokenColour(element, '--jp-brand-color1')
  );
  await expect(dot).toHaveCSS(
    'background-color',
    await tokenColour(dot, '--jp-brand-color1')
  );

  await setMarkColour(page, 'red');
  await expect(element).toHaveAttribute('data-bookmark', 'red');
  expect((await tabMark(element)).colour).toBe(
    await tokenColour(element, '--jp-error-color1')
  );
  await expect(dot).toHaveCSS(
    'background-color',
    await tokenColour(dot, '--jp-error-color1')
  );

  await setMarkColour(page, 'brand');
  await expect(element).toHaveAttribute('data-bookmark', 'brand');
  expect((await tabMark(element)).colour).toBe(
    await tokenColour(element, '--jp-brand-color1')
  );
});
