import { expect, IJupyterLabPageFixture } from '@jupyterlab/galata';
import {
  contextMenu,
  layoutSaved,
  mockBookmarks,
  openPanel,
  PANEL_ID,
  PLUGIN_ID,
  plusMenu,
  section,
  sectionLabel,
  test
} from './helpers';

test.use({ mockSettings: mockBookmarks() });

/** The rows of the Recent Proxy section, newest first. */
const recentRows = (page: IJupyterLabPageFixture) =>
  section(page, 'recent').locator('.jp-BookmarksPanel-row');

/** The Recent Proxy row whose shown title is `name`. */
const recentRow = (page: IJupyterLabPageFixture, name: string) =>
  recentRows(page).filter({ hasText: name });

/**
 * Opens `path` through the command the launcher and notification buttons run,
 * as a lab tab titled `title`, so the extension records it.
 */
async function openProxy(
  page: IJupyterLabPageFixture,
  baseURL: string,
  title: string,
  path: string
): Promise<void> {
  await page.evaluate(
    async ({ url, title }) => {
      await (window as any).jupyterapp.commands.execute('server-proxy:open', {
        url,
        title,
        newBrowserTab: false,
        id: `server-proxy:${title}`
      });
    },
    { url: `${baseURL}/proxy/5555/${path}/`, title }
  );
  await expect(page.activity.getTabLocator(title)).toBeVisible();
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

/**
 * Reloads the lab and waits for it to start. Galata's `page.reload` polls for
 * `jupyterapp.started` once; a navigation the lab runs after load can destroy
 * that poll, so this waits on the new document instead, retrying across it.
 */
async function reloadLab(page: IJupyterLabPageFixture): Promise<void> {
  const loaded = page.waitForEvent('domcontentloaded');
  await page.evaluate(() => location.reload()).catch(() => undefined);
  await loaded;
  await page.waitForFunction(async () => {
    const app = (window as any).jupyterapp;
    if (typeof app !== 'object') {
      return false;
    }
    await app.started;
    return true;
  });
  // The layout restore runs after the start and re-attaches the side bars, so the
  // panel's tab appears a moment later.
  await page.locator(`.jp-SideBar [data-id="${PANEL_ID}"]`).first().waitFor();
}

test('a proxy page is listed with its title and survives a reload', async ({
  page,
  baseURL
}) => {
  await openProxy(page, baseURL, 'Proxy page', 'page');
  await openPanel(page);
  await expect(sectionLabel(page, 'recent')).toHaveText('RECENT PROXY (1)');
  await expect(
    section(page, 'recent').locator('.jp-BookmarksPanel-rowText')
  ).toHaveText(['Proxy page']);
  // The row says when the page was last opened.
  await expect(
    section(page, 'recent').locator('.jp-BookmarksPanel-rowTime')
  ).toHaveText('now');

  // It folds like the other sections, and the count stays visible.
  await section(page, 'recent')
    .locator('.jp-BookmarksPanel-sectionToggle')
    .click();
  await expect(recentRow(page, 'Proxy page')).toBeHidden();
  await expect(sectionLabel(page, 'recent')).toHaveText('RECENT PROXY (1)');
  await section(page, 'recent')
    .locator('.jp-BookmarksPanel-sectionToggle')
    .click();
  await expect(recentRow(page, 'Proxy page')).toBeVisible();

  await layoutSaved(page);
  await reloadLab(page);
  await openPanel(page);
  await expect(sectionLabel(page, 'recent')).toHaveText('RECENT PROXY (1)');
  await expect(recentRow(page, 'Proxy page')).toBeVisible();

  // A page a link bookmarks leaves the list: the link names the same URL.
  await plusMenu(page, 'Links', 'New Bookmark...');
  const dialog = page.locator('.jp-Dialog');
  await dialog.getByLabel('Name').fill('Proxy page');
  await dialog.getByLabel('URL').fill(`${baseURL}/proxy/5555/page/`);
  await dialog.locator('.jp-mod-accept').click();
  await expect(dialog).toHaveCount(0);
  await expect(sectionLabel(page, 'links')).toHaveText('LINKS (1)');
  await expect(
    section(page, 'links').locator('.jp-BookmarksPanel-rowText')
  ).toHaveText(['Proxy page']);
  await expect(recentRow(page, 'Proxy page')).toHaveCount(0);
  await expect(sectionLabel(page, 'recent')).toHaveText('RECENT PROXY (0)');
});

test('a row reopens its page, moves to the top and offers its menu', async ({
  page,
  baseURL
}) => {
  await openProxy(page, baseURL, 'Reopen page', 'reopen');
  await openPanel(page);
  await closeTab(page, 'Reopen page');

  // The click opens the page the way it was first opened: a lab tab.
  await recentRow(page, 'Reopen page').click();
  await expect(page.activity.getTabLocator('Reopen page')).toHaveClass(
    /jp-mod-current/
  );
  // A second click reuses that tab.
  await page.activity.activateTab('Launcher');
  await recentRow(page, 'Reopen page').click();
  await expect(page.activity.getTabLocator('Reopen page')).toHaveClass(
    /jp-mod-current/
  );
  await expect(page.activity.getTabLocator('Reopen page')).toHaveCount(1);

  // Add to Bookmarks moves the page to Links.
  await contextMenu(page, recentRow(page, 'Reopen page'), 'Add to Bookmarks');
  await expect(sectionLabel(page, 'links')).toHaveText('LINKS (1)');
  await expect(
    section(page, 'links').locator('.jp-BookmarksPanel-rowText')
  ).toHaveText(['Reopen page']);
  await expect(recentRow(page, 'Reopen page')).toHaveCount(0);

  // Remove from Recent drops the entry.
  await openProxy(page, baseURL, 'Remove page', 'remove');
  await expect(sectionLabel(page, 'recent')).toHaveText('RECENT PROXY (1)');
  await contextMenu(page, recentRow(page, 'Remove page'), 'Remove from Recent');
  await expect(recentRow(page, 'Remove page')).toHaveCount(0);
  await expect(sectionLabel(page, 'recent')).toHaveText('RECENT PROXY (0)');

  // The newest page is first; a click moves the older one to the top.
  await openProxy(page, baseURL, 'First page', 'first');
  await openProxy(page, baseURL, 'Second page', 'second');
  const rows = section(page, 'recent').locator('.jp-BookmarksPanel-rowText');
  await expect(rows.nth(0)).toHaveText('Second page');
  await expect(rows.nth(1)).toHaveText('First page');
  await recentRow(page, 'First page').click();
  await expect(rows.nth(0)).toHaveText('First page');
  await expect(rows.nth(1)).toHaveText('Second page');
});

test('an entry expires with the setting, without a page reload', async ({
  page,
  baseURL
}) => {
  await openProxy(page, baseURL, 'Expiring page', 'expiring');
  await openPanel(page);
  await expect(sectionLabel(page, 'recent')).toHaveText('RECENT PROXY (1)');
  await expect(
    section(page, 'recent').locator('.jp-BookmarksPanel-rowTime')
  ).toHaveText('now');

  // The setting shows in the Settings Editor.
  await page.evaluate(async () => {
    await (window as any).jupyterapp.commands.execute('settingeditor:open', {
      query: 'Bookmarks'
    });
  });
  await page.locator(`.jp-PluginList-entry[data-id="${PLUGIN_ID}"]`).click();
  await expect(
    page.locator('.jp-SettingsForm').getByText('Recent proxy days', {
      exact: true
    })
  ).toBeVisible();

  // Zero days applies at once, through the registry the Settings Editor saves through.
  await page.evaluate(async plugin => {
    const registry = await (window as any).galata.getPlugin(
      '@jupyterlab/apputils-extension:settings'
    );
    await registry.set(plugin, 'recentProxyTtlDays', 0);
  }, PLUGIN_ID);
  await expect(sectionLabel(page, 'recent')).toHaveText('RECENT PROXY (0)');
  await expect(recentRows(page)).toHaveCount(0);
  await expect(
    section(page, 'recent').locator('.jp-BookmarksPanel-empty')
  ).toHaveText('No recent proxy pages.');
});
