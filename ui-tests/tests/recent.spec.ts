import { expect, IJupyterLabPageFixture } from '@jupyterlab/galata';
import { Page } from '@playwright/test';
import WebSocket from 'ws';
import {
  BACKEND_PORT,
  backendPath,
  closedTabSaved,
  contextMenu,
  holdRequest,
  holdSettingsWrite,
  mockBookmarks,
  openPanel,
  PANEL_ID,
  PLUGIN_ID,
  plusMenu,
  section,
  sectionCount,
  sectionLabel,
  test,
  tokenColour,
  workspaceSaved
} from './helpers';

test.use({ mockSettings: mockBookmarks() });

/** The state key of the Proxy section's list, and of the newest open the list has taken. */
const LIST_KEY = 'jupyterlab_bookmarks_manager_extension:recent-proxy';
const TAKEN_KEY = `${LIST_KEY}-taken`;

/** The Proxy section's list in a saved workspace. */
const savedRows = (data: Record<string, any>): { title: string }[] =>
  data[LIST_KEY] ?? [];

/** The rows of the Proxy section, newest first. */
const recentRows = (page: IJupyterLabPageFixture) =>
  section(page, 'recent').locator('.jp-BookmarksPanel-row');

/** The Proxy section row whose shown title is `name`. */
const recentRow = (page: IJupyterLabPageFixture, name: string) =>
  recentRows(page).filter({ hasText: name });

/** Takes away the limit of a title read, so that a held read stays held until the test releases it. */
const liftReadLimit = (page: IJupyterLabPageFixture) =>
  page.evaluate(() => {
    AbortSignal.timeout = () => new AbortController().signal;
  });

/**
 * Opens the real service's page titled `title` through the command the launcher and
 * notification buttons run, as a lab tab with a widget id of the command's own,
 * and waits for its image and fetch.
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

/**
 * Opens a WebSocket on the path of the real service through the proxy, from this process, and awaits
 * its echo. Of the headers the proxy tap reads, a browser's socket sends none, and neither does this
 * client; Origin is the lab's, as in a page of the lab.
 */
async function echoThroughProxy(baseURL: string, path: string): Promise<void> {
  const socket = new WebSocket(`${baseURL.replace('http', 'ws')}/${path}echo`, {
    origin: baseURL
  });
  const echoed = await new Promise<string>((resolve, reject) => {
    socket.once('open', () => socket.send('ping'));
    socket.once('message', data => resolve(String(data)));
    socket.once('error', reject);
  });
  socket.close();
  expect(echoed).toBe('ping');
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
  await expect(sectionLabel(page, 'recent')).toHaveText('Proxy');
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
  await expect(sectionLabel(page, 'recent')).toHaveText('Proxy');
  await section(page, 'recent')
    .locator('.jp-BookmarksPanel-sectionToggle')
    .click();
  await expect(recentRow(page, 'Proxy page')).toBeVisible();

  await workspaceSaved(page, data =>
    savedRows(data).some(entry => entry.title === 'Proxy page')
  );
  await reloadLab(page);
  await openPanel(page);
  await expect(sectionLabel(page, 'recent')).toHaveText('Proxy');
  await expect(recentRow(page, 'Proxy page')).toBeVisible();

  // A page a link bookmarks stays listed: the Proxy section lists every open.
  await plusMenu(page, 'Links', 'New Bookmark...');
  const dialog = page.locator('.jp-Dialog');
  await dialog.getByLabel('Name').fill('Proxy page');
  await dialog
    .getByLabel('URL')
    .fill(`${baseURL}/${backendPath('Proxy page')}`);
  await dialog.locator('.jp-mod-accept').click();
  await expect(dialog).toHaveCount(0);
  await expect(sectionLabel(page, 'links')).toHaveText('LINKS');
  await expect(sectionCount(page, 'links')).toHaveText('(1)');
  await expect(
    section(page, 'links').locator('.jp-BookmarksPanel-rowText')
  ).toHaveText(['Proxy page']);
  await expect(recentRow(page, 'Proxy page')).toBeVisible();
  await expect(sectionCount(page, 'recent')).toHaveText('(1)');
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

  // Add to Bookmarks adds a Links row; the Proxy row stays.
  await contextMenu(page, recentRow(page, 'Reopen page'), 'Add to Bookmarks');
  await expect(sectionLabel(page, 'links')).toHaveText('LINKS');
  await expect(sectionCount(page, 'links')).toHaveText('(1)');
  await expect(
    section(page, 'links').locator('.jp-BookmarksPanel-rowText')
  ).toHaveText(['Reopen page']);
  await expect(recentRow(page, 'Reopen page')).toBeVisible();
  await expect(sectionCount(page, 'recent')).toHaveText('(1)');

  // Remove from Proxy drops the entry. It is destructive: its own group at the end, below a separator.
  await openProxy(page, baseURL, 'Remove page');
  await expect(sectionCount(page, 'recent')).toHaveText('(2)');
  await recentRow(page, 'Remove page').click({ button: 'right' });
  const addToBookmarks = page.getByRole('menuitem', {
    name: 'Add to Bookmarks'
  });
  const removeFromProxy = page.getByRole('menuitem', {
    name: 'Remove from Proxy'
  });
  // Every entry carries its command's icon; the eraser paints its ink with stroke, in the danger colour.
  await expect(addToBookmarks.locator('.lm-Menu-itemIcon svg')).toHaveCount(1);
  await expect(removeFromProxy.locator('.lm-Menu-itemIcon svg')).toHaveCount(1);
  await expect(removeFromProxy.locator('.jp-icon3[stroke]').first()).toHaveCSS(
    'stroke',
    await tokenColour(removeFromProxy, '--jp-error-color1')
  );
  await expect(removeFromProxy).toHaveClass(/jp-BookmarksContextMenu-danger/);
  await expect(removeFromProxy).toHaveCSS(
    'color',
    await tokenColour(removeFromProxy, '--jp-error-color1')
  );
  // JupyterLab core appends its own disabled "Shift+Right Click for Browser Menu" item after these three; the stylesheet hides it.
  const hint = page.locator(
    '.lm-Menu-item[data-command="__internal:context-menu-info"]'
  );
  await expect(hint).toHaveCount(1);
  await expect(hint).toBeHidden();
  const menuItems = page.locator('.lm-Menu-content > .lm-Menu-item');
  await expect(menuItems.nth(0)).toHaveAttribute(
    'data-command',
    'jupyterlab_bookmarks_manager_extension:add-recent'
  );
  await expect(menuItems.nth(1)).toHaveAttribute('data-type', 'separator');
  await expect(menuItems.nth(2)).toHaveAttribute(
    'data-command',
    'jupyterlab_bookmarks_manager_extension:remove-recent'
  );
  await removeFromProxy.click();
  await expect(recentRow(page, 'Remove page')).toHaveCount(0);
  await expect(sectionCount(page, 'recent')).toHaveText('(1)');

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
  await expect(sectionLabel(page, 'recent')).toHaveText('Proxy');
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
  await expect(sectionLabel(page, 'recent')).toHaveText('Proxy');
  await expect(recentRows(page)).toHaveCount(0);
  await expect(
    section(page, 'recent').locator('.jp-BookmarksPanel-empty')
  ).toHaveText('No proxy pages.');
});

test('Add to Bookmarks adds one link while its save still runs', async ({
  page,
  baseURL
}) => {
  await openPanel(page);
  await openProxy(page, baseURL, 'Twice page');
  await expect(recentRow(page, 'Twice page')).toHaveCount(1);
  const write = await holdSettingsWrite(page);

  await contextMenu(page, recentRow(page, 'Twice page'), 'Add to Bookmarks');
  await write.held;
  // The row stays listed until the save ends, so the user can add it again.
  await contextMenu(page, recentRow(page, 'Twice page'), 'Add to Bookmarks');
  write.release();

  // Writes run in order, so the folder shows once both adds have landed.
  await plusMenu(page, 'Links', 'New Folder');
  await page.locator('.jp-Dialog input').fill('Done');
  await page.locator('.jp-Dialog .jp-mod-accept').click();
  await expect(
    section(page, 'links').locator('.jp-BookmarksPanel-rowText')
  ).toHaveText(['Twice page', 'Done']);
});

test('the section is named Proxy in every visible name', async ({
  page,
  baseURL
}) => {
  await openPanel(page);
  await expect(sectionLabel(page, 'recent')).toHaveText('Proxy');
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

test('the Clear control empties the list after the confirmation', async ({
  page,
  baseURL
}) => {
  const beforeOpen = Date.now();
  await openProxy(page, baseURL, 'Clear one');
  await openProxy(page, baseURL, 'Clear two');
  await openPanel(page);
  const clear = page.getByRole('button', { name: 'Clear Proxy' });
  await expect(clear).toBeEnabled();
  await expect(sectionCount(page, 'recent')).toHaveText('(2)');

  // Cancel changes nothing.
  await clear.click();
  let dialog = page.locator('.jp-Dialog');
  await expect(dialog).toContainText('Clear Proxy');
  await expect(dialog).toContainText('Remove every page from Proxy?');
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(recentRows(page)).toHaveCount(2);

  // Clear removes every row, and the control turns disabled.
  await clear.click();
  dialog = page.locator('.jp-Dialog');
  await dialog.getByRole('button', { name: 'Clear', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(recentRows(page)).toHaveCount(0);
  await expect(sectionCount(page, 'recent')).toHaveText('(0)');
  await expect(clear).toBeDisabled();
  await expect(
    section(page, 'recent').locator('.jp-BookmarksPanel-empty')
  ).toHaveText('No proxy pages.');

  // The empty list is saved with the watermark past these opens, so a reload takes none of them
  // again. The tabs close first: a restored proxy tab requests its page again, and an open lists it again.
  await closeTab(page, 'Clear one');
  await closeTab(page, 'Clear two');
  await closedTabSaved(page, 'Clear one');
  await closedTabSaved(page, 'Clear two');
  await workspaceSaved(
    page,
    data => data[TAKEN_KEY] >= beforeOpen && savedRows(data).length === 0
  );
  await reloadLab(page);
  await openPanel(page);
  await expect(recentRows(page)).toHaveCount(0);
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

    await echoThroughProxy(baseURL, backendPath('By socket'));
    // The row of the page after the socket shows that the server has handled the socket's request.
    const tab = await openByUrl(page, baseURL, backendPath('By URL'));
    await tab.close();
    await expect(rowTitles(page)).toHaveText([
      'By URL',
      'By launcher',
      'By command'
    ]);
    await expect(sectionLabel(page, 'recent')).toHaveText('Proxy');
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
    const beforeOpen = Date.now();
    let tab = await openByUrl(page, baseURL, path);
    await tab.close();
    await expect(rowTitles(page)).toHaveText(['Removed page']);
    await contextMenu(
      page,
      recentRow(page, 'Removed page'),
      'Remove from Proxy'
    );
    await expect(sectionLabel(page, 'recent')).toHaveText('Proxy');

    // The saved list has no row only after the taken mark passes the open, or a reload takes it again.
    await workspaceSaved(
      page,
      data =>
        data[TAKEN_KEY] >= beforeOpen &&
        !savedRows(data).some(entry => entry.title === 'Removed page')
    );
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

  test('a row removed during a read of the server list stays removed', async ({
    page,
    baseURL
  }) => {
    await openPanel(page);
    await liftReadLimit(page);
    const removed = backendPath('Removed-during-read');
    const slow = backendPath('Slow-title');
    let tab = await openByUrl(page, baseURL, removed);
    await tab.close();
    await expect(rowTitles(page)).toHaveText(['Removed-during-read']);

    // One read of the server's list holds a new open of the row and of a page whose title it reads.
    const list = await holdRequest(page, '**/proxy-opens*');
    const title = await holdRequest(page, `**/${slow}*`);
    tab = await openByUrl(page, baseURL, removed);
    await tab.close();
    await list.held;
    tab = await openByUrl(page, baseURL, slow);
    await tab.close();
    list.release();
    await title.held;

    await contextMenu(
      page,
      recentRow(page, 'Removed-during-read'),
      'Remove from Proxy'
    );
    await expect(rowTitles(page)).toHaveCount(0);
    title.release();

    await expect(rowTitles(page)).toHaveText(['Slow-title']);
  });

  test('a row removed while the server list is held stays removed until an open after its read', async ({
    page,
    baseURL
  }) => {
    await openPanel(page);
    const removed = backendPath('Removed-in-GET');
    let tab = await openByUrl(page, baseURL, removed);
    await tab.close();
    await expect(rowTitles(page)).toHaveText(['Removed-in-GET']);

    // The held read's answer holds the reopen, and the removal comes before that answer.
    const list = await holdRequest(page, '**/proxy-opens*');
    tab = await openByUrl(page, baseURL, removed);
    await tab.close();
    await list.held;
    await contextMenu(
      page,
      recentRow(page, 'Removed-in-GET'),
      'Remove from Proxy'
    );
    await expect(rowTitles(page)).toHaveCount(0);
    list.release();

    // A later page's row comes from a read after the held one and after the removal's own.
    tab = await openByUrl(page, baseURL, backendPath('Later-A'));
    await tab.close();
    await expect(rowTitles(page)).toHaveText(['Later-A']);

    tab = await openByUrl(page, baseURL, removed);
    await tab.close();
    await expect(rowTitles(page)).toHaveText(['Removed-in-GET', 'Later-A']);
  });

  test('a row removed while an earlier read waits for a title stays removed, with its reopen in the next read', async ({
    page,
    baseURL
  }) => {
    await openPanel(page);
    await liftReadLimit(page);
    const removed = backendPath('Removed-in-queue');
    const slow = backendPath('Slow-read');
    let tab = await openByUrl(page, baseURL, removed);
    await tab.close();
    await expect(rowTitles(page)).toHaveText(['Removed-in-queue']);

    const title = await holdRequest(page, `**/${slow}*`);
    tab = await openByUrl(page, baseURL, slow);
    await tab.close();
    await title.held;
    tab = await openByUrl(page, baseURL, removed);
    await tab.close();
    await contextMenu(
      page,
      recentRow(page, 'Removed-in-queue'),
      'Remove from Proxy'
    );
    await expect(rowTitles(page)).toHaveCount(0);
    title.release();

    tab = await openByUrl(page, baseURL, backendPath('Later-B'));
    await tab.close();
    await expect(rowTitles(page)).toHaveText(['Later-B', 'Slow-read']);
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
      const tab = await openByUrl(page, baseURL, backendPath('While closed'));
      await tab.close();
      // The age leaves `now` after a minute; it reads the page's Date.now, and the lab's timers keep running.
      await page.clock.setFixedTime(Date.now() + 61 * 1000);
      await page.goto();
      await openPanel(page);
      await expect(
        recentRow(page, 'While closed').locator('.jp-BookmarksPanel-rowTime')
      ).toHaveText('1m ago');
    });
  });
});
