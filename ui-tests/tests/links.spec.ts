import { expect, IJupyterLabPageFixture } from '@jupyterlab/galata';
import * as http from 'http';
import { AddressInfo } from 'net';
import {
  contextMenu,
  layoutSaved,
  mockBookmarks,
  openPanel,
  row,
  section,
  sectionLabel,
  test
} from './helpers';

test.use({ mockSettings: mockBookmarks() });

// Two 1x1 PNGs, red and blue, so a test can tell which page's icon a row shows.
const RED_PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC';
const BLUE_PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGNgYPgPAAEDAQAIicLsAAAAAElFTkSuQmCC';
const RED_ICON = `data:image/png;base64,${RED_PNG}`;
const BLUE_ICON = `data:image/png;base64,${BLUE_PNG}`;

const html = (title: string, icon?: string) =>
  `<html><head><title>${title}</title>${
    icon ? `<link rel="icon" href="${icon}">` : ''
  }</head><body>${title}</body></html>`;

const TOGGLE_ITEM =
  '.lm-Menu-item[data-command="jupyterlab_bookmarks_extension:toggle-tab"]';

/** The iframes of the main area: the web tab's, or the one a row click opened. */
const frames = (page: IJupyterLabPageFixture) =>
  page.locator('#jp-main-dock-panel iframe');

const rowImage = (page: IJupyterLabPageFixture, name: string) =>
  row(page, name).locator('img.jp-BookmarksPanel-rowIcon');

// ServerConnection appends a cache-busting query to every request, so requests match on the path.
const path = (url: string) => new URL(url).pathname;

test.beforeEach(async ({ page, tmpPath }) => {
  // page.html shows red.png, other.html blue.png, plain.html has no icon and no favicon.ico beside it.
  await page.contents.uploadContent(
    html('Page', 'red.png'),
    'text',
    `${tmpPath}/page.html`
  );
  await page.contents.uploadContent(
    html('Other', 'blue.png'),
    'text',
    `${tmpPath}/other.html`
  );
  await page.contents.uploadContent(
    html('Plain'),
    'text',
    `${tmpPath}/plain.html`
  );
  await page.contents.uploadContent(RED_PNG, 'base64', `${tmpPath}/red.png`);
  await page.contents.uploadContent(BLUE_PNG, 'base64', `${tmpPath}/blue.png`);
});

/** Opens `url` in a `help:open` tab titled `title`. */
async function openWebTab(
  page: IJupyterLabPageFixture,
  url: string,
  title: string
): Promise<void> {
  await page.evaluate(
    async ({ url, title }) => {
      await (window as any).jupyterapp.commands.execute('help:open', {
        url,
        text: title
      });
    },
    { url, title }
  );
  await expect(page.activity.getTabLocator(title)).toBeVisible();
}

/** Opens the page in a web tab, adds it through the tab menu and opens the panel. */
async function addWebTab(
  page: IJupyterLabPageFixture,
  url: string,
  title: string
): Promise<void> {
  await openWebTab(page, url, title);
  await contextMenu(
    page,
    page.activity.getTabLocator(title),
    'Add Tab to Bookmarks'
  );
  await openPanel(page);
  await expect(row(page, title)).toBeVisible();
}

async function closeTab(
  page: IJupyterLabPageFixture,
  title: string
): Promise<void> {
  await page.activity
    .getTabLocator(title)
    .locator('.lm-TabBar-tabCloseIcon')
    .click();
  await expect(page.activity.getTabLocator(title)).toHaveCount(0);
}

/** Edit Bookmark... on the row, a new URL, Save. */
async function editUrl(
  page: IJupyterLabPageFixture,
  name: string,
  url: string
): Promise<void> {
  await contextMenu(page, row(page, name), 'Edit Bookmark...');
  const dialog = page.locator('.jp-Dialog');
  await dialog.getByLabel('URL').fill(url);
  await dialog.locator('.jp-mod-accept').click();
  await expect(dialog).toHaveCount(0);
}

test('tab menu adds a web tab', async ({ page, baseURL, tmpPath }) => {
  await openWebTab(page, `${baseURL}/files/${tmpPath}/page.html`, 'Page');
  await openPanel(page);
  await expect(sectionLabel(page, 'links')).toHaveText('LINKS (0)');

  await contextMenu(
    page,
    page.activity.getTabLocator('Page'),
    'Add Tab to Bookmarks'
  );
  await expect(sectionLabel(page, 'links')).toHaveText('LINKS (1)');
  await expect(
    section(page, 'links').locator('.jp-BookmarksPanel-rowText')
  ).toHaveText(['Page']);
});

test('added link records the page URL', async ({ page, baseURL, tmpPath }) => {
  const url = `${baseURL}/files/${tmpPath}/page.html`;
  await addWebTab(page, url, 'Page');
  const shown = await frames(page).evaluate(
    frame => (frame as HTMLIFrameElement).src
  );
  expect(shown).toBe(url);
  await expect(row(page, 'Page')).toHaveAttribute('title', shown);
});

test('bookmarked web tab offers remove', async ({ page, baseURL, tmpPath }) => {
  await openWebTab(page, `${baseURL}/files/${tmpPath}/page.html`, 'Page');
  const tab = page.activity.getTabLocator('Page');
  const item = page.locator(`${TOGGLE_ITEM} .lm-Menu-itemLabel`);
  await tab.click({ button: 'right' });
  await expect(item).toHaveText('Add Tab to Bookmarks');
  await item.click();

  await openPanel(page);
  await expect(sectionLabel(page, 'links')).toHaveText('LINKS (1)');
  await tab.click({ button: 'right' });
  await expect(item).toBeVisible();
  await expect(item).toHaveText('Remove Tab from Bookmarks');
  await page.keyboard.press('Escape');
});

test('tab menu removes a link', async ({ page, baseURL, tmpPath }) => {
  await addWebTab(page, `${baseURL}/files/${tmpPath}/page.html`, 'Page');
  await expect(sectionLabel(page, 'links')).toHaveText('LINKS (1)');

  await contextMenu(
    page,
    page.activity.getTabLocator('Page'),
    'Remove Tab from Bookmarks'
  );
  await expect(sectionLabel(page, 'links')).toHaveText('LINKS (0)');
  await expect(row(page, 'Page')).toHaveCount(0);
});

test('row shows the page favicon', async ({ page, baseURL, tmpPath }) => {
  await addWebTab(page, `${baseURL}/files/${tmpPath}/page.html`, 'Page');
  await expect(rowImage(page, 'Page')).toHaveAttribute('src', /^data:image\//);
  await expect(rowImage(page, 'Page')).toHaveAttribute('src', RED_ICON);
});

test('favicon shows after reload without a fetch', async ({
  page,
  baseURL,
  tmpPath
}) => {
  await addWebTab(page, `${baseURL}/files/${tmpPath}/page.html`, 'Page');
  await expect(rowImage(page, 'Page')).toHaveAttribute('src', RED_ICON);
  // A restored help:open tab would request its page again, so it closes first.
  await closeTab(page, 'Page');
  await layoutSaved(page);

  const requested: string[] = [];
  page.on('request', request => requested.push(request.url()));
  await page.reload();
  await openPanel(page);
  await expect(rowImage(page, 'Page')).toHaveAttribute('src', RED_ICON);
  expect(requested.length).toBeGreaterThan(0);
  expect(
    requested.filter(url => /\/(page\.html|red\.png)$/.test(path(url)))
  ).toEqual([]);
});

test('URL edit refetches the favicon', async ({ page, baseURL, tmpPath }) => {
  await addWebTab(page, `${baseURL}/files/${tmpPath}/page.html`, 'Page');
  await expect(rowImage(page, 'Page')).toHaveAttribute('src', RED_ICON);

  await editUrl(page, 'Page', `${baseURL}/files/${tmpPath}/other.html`);
  await expect(rowImage(page, 'Page')).toHaveAttribute('src', BLUE_ICON);
});

test('link without favicon shows the generic icon', async ({
  page,
  baseURL,
  tmpPath
}) => {
  // The page has no icon link, so the lookup ends at favicon.ico beside it, which answers 404.
  const lookup = page.waitForResponse(response =>
    path(response.url()).endsWith(`/files/${tmpPath}/favicon.ico`)
  );
  await addWebTab(page, `${baseURL}/files/${tmpPath}/plain.html`, 'Plain');
  expect((await lookup).status()).toBe(404);

  await expect(rowImage(page, 'Plain')).toHaveCount(0);
  await expect(
    row(page, 'Plain').locator('.jp-BookmarksPanel-rowIcon svg')
  ).toBeVisible();
});

test('edit changes the link name', async ({ page, baseURL, tmpPath }) => {
  await addWebTab(page, `${baseURL}/files/${tmpPath}/page.html`, 'Page');

  await contextMenu(page, row(page, 'Page'), 'Edit Bookmark...');
  const dialog = page.locator('.jp-Dialog');
  await expect(dialog.getByLabel('Name')).toHaveValue('Page');
  await dialog.getByLabel('Name').fill('Start page');
  await dialog.locator('.jp-mod-accept').click();

  await expect(row(page, 'Start page')).toBeVisible();
  await expect(row(page, 'Page')).toHaveCount(0);
  await expect(sectionLabel(page, 'links')).toHaveText('LINKS (1)');
});

test('edit changes the link URL', async ({ page, baseURL, tmpPath }) => {
  const other = `${baseURL}/files/${tmpPath}/other.html`;
  await addWebTab(page, `${baseURL}/files/${tmpPath}/page.html`, 'Page');
  await closeTab(page, 'Page');

  await editUrl(page, 'Page', other);
  await expect(row(page, 'Page')).toHaveAttribute('title', other);
  await row(page, 'Page').click();
  await expect(frames(page)).toHaveAttribute('src', other);
});

test('empty URL disables Save', async ({ page, baseURL, tmpPath }) => {
  await addWebTab(page, `${baseURL}/files/${tmpPath}/page.html`, 'Page');

  await contextMenu(page, row(page, 'Page'), 'Edit Bookmark...');
  const dialog = page.locator('.jp-Dialog');
  const save = dialog.locator('.jp-mod-accept');
  await expect(save).toBeEnabled();
  await dialog.getByLabel('URL').fill('');
  await expect(save).toBeDisabled();
  await dialog.getByLabel('URL').fill(`${baseURL}/files/${tmpPath}/other.html`);
  await expect(save).toBeEnabled();
  await dialog.locator('.jp-mod-reject').click();
  await expect(dialog).toHaveCount(0);
});

test('click opens a lab link in a tab', async ({ page, baseURL, tmpPath }) => {
  const url = `${baseURL}/files/${tmpPath}/page.html`;
  await addWebTab(page, url, 'Page');
  await closeTab(page, 'Page');
  await expect(frames(page)).toHaveCount(0);

  await row(page, 'Page').click();
  await expect(page.activity.getTabLocator('Page')).toHaveClass(
    /jp-mod-current/
  );
  await expect(frames(page)).toHaveAttribute('src', url);
});

test('second click activates the open tab', async ({
  page,
  baseURL,
  tmpPath
}) => {
  await addWebTab(page, `${baseURL}/files/${tmpPath}/page.html`, 'Page');
  await closeTab(page, 'Page');
  const tab = page.activity.getTabLocator('Page');

  await row(page, 'Page').click();
  await expect(tab).toHaveClass(/jp-mod-current/);
  await page.activity.activateTab('Launcher');
  await expect(tab).not.toHaveClass(/jp-mod-current/);

  await row(page, 'Page').click();
  await expect(tab).toHaveClass(/jp-mod-current/);
  await expect(tab).toHaveCount(1);
  await expect(frames(page)).toHaveCount(1);
});

test('a link tab moved out of the main area is reused', async ({
  page,
  baseURL,
  tmpPath
}) => {
  await addWebTab(page, `${baseURL}/files/${tmpPath}/page.html`, 'Page');
  await closeTab(page, 'Page');
  await row(page, 'Page').click();
  const open = page.activity.getTabLocator('Page');
  await expect(open).toHaveClass(/jp-mod-current/);
  const id = (await open.getAttribute('data-id'))!;

  // The three areas the tab menu's Move Widget To submenu offers.
  for (const area of ['down', 'left', 'right']) {
    await page.evaluate(
      async ({ area, id }) => {
        await (window as any).jupyterapp.commands.execute(
          'application:move-widget',
          { area, id }
        );
      },
      { area, id }
    );
    const moved = page.locator(
      area === 'down'
        ? `#jp-down-stack .lm-TabBar-tab[data-id="${id}"]`
        : `.jp-SideBar.jp-mod-${area} .lm-TabBar-tab[data-id="${id}"]`
    );
    await expect(moved).toBeVisible();

    await openPanel(page);
    await row(page, 'Page').click();

    await expect(
      page.locator(`#jp-main-dock-panel .lm-TabBar-tab[data-id="${id}"]`)
    ).toHaveCount(0);
    await expect(moved).toHaveClass(/lm-mod-current/);
    const widgets = await page.evaluate(widgetId => {
      const shell = (window as any).jupyterapp.shell;
      let count = 0;
      for (const name of ['main', 'left', 'right', 'down']) {
        for (const widget of Array.from(shell.widgets(name) as any[])) {
          if ((widget as any).id === widgetId) {
            count += 1;
          }
        }
      }
      return count;
    }, id);
    expect(widgets).toBe(1);
  }
});

test.describe('other origin', () => {
  // A page with blue.png as its icon, on a port other than the lab's, so on another origin.
  let remote: http.Server;
  let pageUrl: string;

  test.beforeAll(async () => {
    remote = http.createServer((request, response) => {
      if (request.url === '/page.html') {
        response.writeHead(200, { 'Content-Type': 'text/html' });
        response.end(html('Remote', 'blue.png'));
      } else if (request.url === '/blue.png') {
        response.writeHead(200, { 'Content-Type': 'image/png' });
        response.end(Buffer.from(BLUE_PNG, 'base64'));
      } else {
        response.writeHead(404);
        response.end();
      }
    });
    await new Promise<void>(resolve =>
      remote.listen(0, '127.0.0.1', () => resolve())
    );
    pageUrl = `http://127.0.0.1:${(remote.address() as AddressInfo).port}/page.html`;
  });

  test.afterAll(async () => {
    await new Promise(resolve => remote.close(resolve));
  });

  test('cross-origin link gets its favicon', async ({
    page,
    baseURL,
    tmpPath
  }) => {
    await addWebTab(page, `${baseURL}/files/${tmpPath}/plain.html`, 'Plain');
    await expect(rowImage(page, 'Plain')).toHaveCount(0);

    const route = page.waitForRequest(
      request =>
        request.method() === 'POST' &&
        path(request.url()).endsWith('/jupyterlab-bookmarks-extension/favicon')
    );
    await editUrl(page, 'Plain', pageUrl);
    expect((await route).postDataJSON()).toEqual({ url: pageUrl });
    await expect(rowImage(page, 'Plain')).toHaveAttribute(
      'src',
      /^data:image\//
    );
    await expect(rowImage(page, 'Plain')).toHaveAttribute('src', BLUE_ICON);
  });

  test('click opens a remote link in a browser tab', async ({
    page,
    baseURL,
    tmpPath
  }) => {
    await addWebTab(page, `${baseURL}/files/${tmpPath}/plain.html`, 'Plain');
    await closeTab(page, 'Plain');
    await editUrl(page, 'Plain', pageUrl);

    const popup = page.waitForEvent('popup');
    await row(page, 'Plain').click();
    const opened = await popup;
    await expect(opened).toHaveURL(pageUrl);
    await expect(frames(page)).toHaveCount(0);
    await opened.close();
  });
});
