import { expect, IJupyterLabPageFixture } from '@jupyterlab/galata';
import { Page } from '@playwright/test';
import {
  BACKEND_PORT,
  backendPath,
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

/** The rows of the Proxy section, newest first. */
const recentRows = (page: IJupyterLabPageFixture) =>
  section(page, 'recent').locator('.jp-BookmarksPanel-row');

/** The Proxy section row whose shown title is `name`. */
const recentRow = (page: IJupyterLabPageFixture, name: string) =>
  recentRows(page).filter({ hasText: name });

/**
 * Opens the real service's page titled `title` through the command the launcher and
 * notification buttons run, as a lab tab with a widget id of the command's own,
 * and waits for its image, fetch and WebSocket.
 */
async function openProxy(
  page: IJupyterLabPageFixture,
  baseURL: string,
  title: string
): Promise<void> {
  const path = backendPath(title);
  await page.evaluate(
    async ({ url, title }) => {
      await (window as any).jupyterapp.commands.execute('server-proxy:open', {
        url,
        title,
        newBrowserTab: false,
        id: `server-proxy:${title}`
      });
    },
    { url: `${baseURL}/${path}`, title }
  );
  await expect(page.activity.getTabLocator(title)).toBeVisible();
  await expect(
    page.frameLocator(`iframe[src$="${path}"]`).locator('body')
  ).toHaveAttribute('data-done', 'yes');
}

/** Opens the path under the lab in a browser tab, as a typed URL does, and waits for its requests. */
async function openByUrl(
  page: IJupyterLabPageFixture,
  baseURL: string,
  path: string
): Promise<Page> {
  const tab = await page.context().newPage();
  await tab.goto(`${baseURL}/${path}`);
  await expect(tab.locator('body')).toHaveAttribute('data-done', 'yes');
  return tab;
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
  await openProxy(page, baseURL, 'Proxy page');
  await openPanel(page);
  await expect(sectionLabel(page, 'recent')).toHaveText('PROXY (1)');
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
  await expect(sectionLabel(page, 'recent')).toHaveText('PROXY (1)');
  await section(page, 'recent')
    .locator('.jp-BookmarksPanel-sectionToggle')
    .click();
  await expect(recentRow(page, 'Proxy page')).toBeVisible();

  await layoutSaved(page);
  await reloadLab(page);
  await openPanel(page);
  await expect(sectionLabel(page, 'recent')).toHaveText('PROXY (1)');
  await expect(recentRow(page, 'Proxy page')).toBeVisible();

  // A page a link bookmarks leaves the list: the link names the same URL.
  await plusMenu(page, 'Links', 'New Bookmark...');
  const dialog = page.locator('.jp-Dialog');
  await dialog.getByLabel('Name').fill('Proxy page');
  await dialog
    .getByLabel('URL')
    .fill(`${baseURL}/${backendPath('Proxy page')}`);
  await dialog.locator('.jp-mod-accept').click();
  await expect(dialog).toHaveCount(0);
  await expect(sectionLabel(page, 'links')).toHaveText('LINKS (1)');
  await expect(
    section(page, 'links').locator('.jp-BookmarksPanel-rowText')
  ).toHaveText(['Proxy page']);
  await expect(recentRow(page, 'Proxy page')).toHaveCount(0);
  await expect(sectionLabel(page, 'recent')).toHaveText('PROXY (0)');
});

test('a row reopens its page, moves to the top and offers its menu', async ({
  page,
  baseURL
}) => {
  await openProxy(page, baseURL, 'Reopen page');
  await openPanel(page);
  await expect(recentRow(page, 'Reopen page')).toBeVisible();
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

  // Remove from Proxy drops the entry.
  await openProxy(page, baseURL, 'Remove page');
  await expect(sectionLabel(page, 'recent')).toHaveText('PROXY (1)');
  await contextMenu(page, recentRow(page, 'Remove page'), 'Remove from Proxy');
  await expect(recentRow(page, 'Remove page')).toHaveCount(0);
  await expect(sectionLabel(page, 'recent')).toHaveText('PROXY (0)');

  // The newest page is first; a click moves the older one to the top.
  await openProxy(page, baseURL, 'First page');
  await openProxy(page, baseURL, 'Second page');
  const rows = section(page, 'recent').locator('.jp-BookmarksPanel-rowText');
  await expect(rows.nth(0)).toHaveText('Second page');
  await expect(rows.nth(1)).toHaveText('First page');
  // Its tab is open, so the click sends no request and the proxy sees nothing.
  await recentRow(page, 'First page').click();
  await expect(rows.nth(0)).toHaveText('First page');
  await expect(rows.nth(1)).toHaveText('Second page');
});

test('an entry expires with the setting, without a page reload', async ({
  page,
  baseURL
}) => {
  await openProxy(page, baseURL, 'Expiring page');
  await openPanel(page);
  await expect(sectionLabel(page, 'recent')).toHaveText('PROXY (1)');
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
    page.locator('.jp-SettingsForm').getByText('Proxy days', {
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
  await expect(sectionLabel(page, 'recent')).toHaveText('PROXY (0)');
  await expect(recentRows(page)).toHaveCount(0);
  await expect(
    section(page, 'recent').locator('.jp-BookmarksPanel-empty')
  ).toHaveText('No proxy pages.');
});

test('the section is named Proxy in every visible name', async ({
  page,
  baseURL
}) => {
  await openPanel(page);
  await expect(sectionLabel(page, 'recent')).toHaveText('PROXY (0)');
  await expect(
    section(page, 'recent').locator('.jp-BookmarksPanel-sectionBody')
  ).toHaveAttribute('aria-label', 'Proxy');
  await expect(
    section(page, 'recent').locator('.jp-BookmarksPanel-empty')
  ).toHaveText('No proxy pages.');

  await openProxy(page, baseURL, 'Named page');
  await recentRow(page, 'Named page').click({ button: 'right' });
  await expect(
    page.getByRole('menuitem', { name: 'Remove from Proxy' })
  ).toBeVisible();
  await page.keyboard.press('Escape');

  await page.evaluate(async () => {
    await (window as any).jupyterapp.commands.execute('settingeditor:open', {
      query: 'Bookmarks'
    });
  });
  await page.locator(`.jp-PluginList-entry[data-id="${PLUGIN_ID}"]`).click();
  await expect(
    page.locator('.jp-SettingsForm').getByText('Proxy days', { exact: true })
  ).toBeVisible();
});

test.describe('beside a Links bookmark', () => {
  test.use({
    mockSettings: mockBookmarks({
      links: [
        { kind: 'link', id: 'docs', name: 'Docs', url: 'https://example.com/' }
      ]
    })
  });

  test('the icon of a Proxy row has the left edge of a Links row icon', async ({
    page,
    baseURL
  }) => {
    await openProxy(page, baseURL, 'Aligned page');
    await openPanel(page);
    const icon = '.jp-BookmarksPanel-rowIcon';
    const link = await section(page, 'links').locator(icon).boundingBox();
    const proxy = await recentRow(page, 'Aligned page')
      .locator(icon)
      .boundingBox();
    expect(proxy!.x).toBe(link!.x);
  });
});

test.describe('a page the proxy saw', () => {
  const rowTitles = (page: IJupyterLabPageFixture) =>
    section(page, 'recent').locator('.jp-BookmarksPanel-rowText');

  test('any route lists a page once, and its image, fetch and WebSocket add no row', async ({
    page,
    baseURL
  }) => {
    await openPanel(page);
    await openProxy(page, baseURL, 'By command');
    await expect(rowTitles(page)).toHaveText(['By command']);

    // The subject here is proxy-launcher:open, the command of the launcher's Proxy tile, which
    // jupyterlab_proxy_launcher_command_extension provides; it opens pages with no server-proxy:open.
    await page.evaluate(() => {
      void (window as any).jupyterapp.commands.execute(
        'proxy-launcher:open',
        {}
      );
    });
    const launcher = page.locator('.jp-ProxyLauncher-dialog');
    await launcher.locator('input[type="number"]').fill(BACKEND_PORT);
    await launcher.locator('input[type="text"]').fill('By%20launcher/');
    await page.locator('.jp-Dialog .jp-mod-accept').click();
    await expect(
      page
        .frameLocator(`iframe[src$="${backendPath('By launcher')}"]`)
        .locator('body')
    ).toHaveAttribute('data-done', 'yes');
    await expect(rowTitles(page)).toHaveText(['By launcher', 'By command']);

    const tab = await openByUrl(page, baseURL, backendPath('By URL'));
    await tab.close();
    await expect(rowTitles(page)).toHaveText([
      'By URL',
      'By launcher',
      'By command'
    ]);
    await expect(sectionLabel(page, 'recent')).toHaveText('PROXY (3)');
  });

  test('the lab through the proxy on its own port is not listed', async ({
    page,
    baseURL
  }) => {
    await openPanel(page);
    const labPort = new URL(baseURL).port;
    const tab = await page.context().newPage();
    for (const host of [labPort, `localhost:${labPort}`]) {
      const response = await tab.goto(`${baseURL}/proxy/${host}/lab`, {
        waitUntil: 'commit'
      });
      expect(response.status()).toBe(200);
    }
    await tab.close();
    // A later page's row shows that the server has handled the requests before it.
    const later = await openByUrl(page, baseURL, backendPath('Later page'));
    await later.close();
    await expect(rowTitles(page)).toHaveText(['Later page']);
  });

  test('a secret in the query is left out of the row and of the server list', async ({
    page,
    baseURL
  }) => {
    await openPanel(page);
    const tab = await openByUrl(
      page,
      baseURL,
      `${backendPath('Secret page')}?token=FAKE&keep=1`
    );
    await tab.close();
    await expect(rowTitles(page)).toHaveText(['Secret page']);
    await expect(section(page, 'recent').locator('[data-id]')).toHaveAttribute(
      'data-id',
      `${baseURL}/${backendPath('Secret page')}?keep=1`
    );
    const held = await page.evaluate(async () => {
      const response = await fetch(
        '/jupyterlab-bookmarks-manager-extension/proxy-opens'
      );
      return response.text();
    });
    expect(held).toContain('keep=1');
    expect(held).not.toContain('FAKE');
  });

  test('a page is named by its title, else by its port and path', async ({
    page,
    baseURL
  }) => {
    await openPanel(page);
    for (const path of [
      backendPath('Titled page'),
      `proxy/${BACKEND_PORT}/untitled`
    ]) {
      const tab = await openByUrl(page, baseURL, path);
      await tab.close();
    }
    await expect(rowTitles(page)).toHaveText([
      `Proxy :${BACKEND_PORT}/untitled`,
      'Titled page'
    ]);
  });

  test('a removed row stays removed after a reload, and a new open brings it back', async ({
    page,
    baseURL
  }) => {
    await openPanel(page);
    const path = backendPath('Removed page');
    let tab = await openByUrl(page, baseURL, path);
    await tab.close();
    await expect(rowTitles(page)).toHaveText(['Removed page']);
    await contextMenu(
      page,
      recentRow(page, 'Removed page'),
      'Remove from Proxy'
    );
    await expect(sectionLabel(page, 'recent')).toHaveText('PROXY (0)');

    await layoutSaved(page);
    await reloadLab(page);
    await openPanel(page);
    // A later page's row shows that the list has been read.
    tab = await openByUrl(page, baseURL, backendPath('Later page'));
    await tab.close();
    await expect(rowTitles(page)).toHaveText(['Later page']);

    tab = await openByUrl(page, baseURL, path);
    await tab.close();
    await expect(rowTitles(page)).toHaveText(['Removed page', 'Later page']);
  });

  test('a page reopens the way it was seen', async ({ page, baseURL }) => {
    await openPanel(page);
    const tab = await openByUrl(page, baseURL, backendPath('Browser page'));
    await tab.close();
    const opened = page.context().waitForEvent('page');
    await recentRow(page, 'Browser page').click();
    const again = await opened;
    await again.waitForURL(url =>
      url.pathname.endsWith(backendPath('Browser page'))
    );
    await again.close();
    await expect(page.activity.getTabLocator('Browser page')).toHaveCount(0);

    // The command ran with a widget id of its own, so the row finds the tab by its address.
    await openProxy(page, baseURL, 'Lab page');
    await recentRow(page, 'Lab page').click();
    await page.activity.activateTab('Launcher');
    await recentRow(page, 'Lab page').click();
    await expect(page.activity.getTabLocator('Lab page')).toHaveClass(
      /jp-mod-current/
    );
    await expect(page.activity.getTabLocator('Lab page')).toHaveCount(1);
    await expect(page.locator('.jp-ServerProxy iframe')).toHaveCount(1);

    // The page moves inside its tab: the row still finds that tab, by the address it opened at.
    await page
      .locator('.jp-ServerProxy iframe')
      .evaluate((frame: HTMLIFrameElement) =>
        frame.contentWindow!.history.pushState(null, '', 'moved-on')
      );
    await page.activity.activateTab('Launcher');
    await recentRow(page, 'Lab page').click();
    await expect(page.activity.getTabLocator('Lab page')).toHaveClass(
      /jp-mod-current/
    );
    await expect(page.activity.getTabLocator('Lab page')).toHaveCount(1);
    await expect(page.locator('.jp-ServerProxy iframe')).toHaveCount(1);
  });

  test('two lab pages each list one open once', async ({ page, baseURL }) => {
    await openPanel(page);
    const second = await page.context().newPage();
    await second.goto(`${baseURL}/lab/workspaces/second`);
    const secondTab = second.locator(`.jp-SideBar [data-id="${PANEL_ID}"]`);
    await second.waitForFunction(async () => {
      const app = (window as any).jupyterapp;
      await app?.restored;
      return !!app;
    });
    await secondTab.first().click();

    const path = backendPath('Twice received');
    const tab = await openByUrl(page, baseURL, path);
    await tab.close();
    await expect(rowTitles(page)).toHaveText(['Twice received']);
    await expect(
      second.locator(
        `.jp-BookmarksPanel-recent[data-id="${baseURL}/${path}"] .jp-BookmarksPanel-rowText`
      )
    ).toHaveText(['Twice received']);
    await second.close();
  });

  test.describe('while no lab page is open', () => {
    test.use({ autoGoto: false });

    test('a page gets its row later, with the age of the open', async ({
      page,
      baseURL
    }) => {
      // The age leaves `now` after a minute.
      test.setTimeout(120 * 1000);
      const tab = await openByUrl(page, baseURL, backendPath('While closed'));
      await tab.close();
      await page.waitForTimeout(61 * 1000);
      await page.goto();
      await openPanel(page);
      await expect(
        recentRow(page, 'While closed').locator('.jp-BookmarksPanel-rowTime')
      ).toHaveText('1m ago');
    });
  });
});
