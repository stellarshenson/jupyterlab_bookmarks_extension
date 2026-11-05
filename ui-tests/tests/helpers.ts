import {
  expect,
  galata,
  IJupyterLabPageFixture,
  test as galataTest
} from '@jupyterlab/galata';
import { Locator, Request } from '@playwright/test';

/**
 * Galata's test for the mocked-settings specs. The page goes offline before galata's teardown
 * removes the settings mock, so a write still running when the test ends fails instead of
 * reaching the test server that every worker shares. The server holds the proxy's opens across
 * tests, so the state starts with a watermark of now, and a lab page takes only this test's opens;
 * Galata's `?reset` would clear that state, and the mocked state of each test is fresh anyway.
 */
export const test = galataTest.extend({
  resetWorkspace: false,
  mockState: async ({}, use) => {
    await use({
      'jupyterlab_bookmarks_manager_extension:recent-proxy-taken': Date.now()
    });
  },
  page: async ({ page, mockSettings }, use) => {
    if (mockSettings) {
      await mockWriteRoute(page);
    }
    await use(page);
    await page.context().setOffline(true);
  }
});

/** The extension's route that saves the settings text, with the query ServerConnection appends. */
export const WRITE_ROUTE =
  '**/jupyterlab-bookmarks-manager-extension/settings-write*';

/**
 * Galata mocks /lab/api/settings only, so the mocked specs need the write route over that mock:
 * the page's own requests read and save it, and a changed base is refused as the server does.
 */
async function mockWriteRoute(page: IJupyterLabPageFixture): Promise<void> {
  await page.route(WRITE_ROUTE, async route => {
    const status = await page
      .evaluate(
        async ({ url, base, raw }) => {
          const current = await (await fetch(url)).json();
          if (current.raw !== base) {
            return 409;
          }
          await fetch(url, { method: 'PUT', body: JSON.stringify({ raw }) });
          return 204;
        },
        {
          url: `/lab/api/settings/${PLUGIN_ID}`,
          ...route.request().postDataJSON()
        }
      )
      // The page can close with a write still running when the test ends.
      .catch(() => undefined);
    await (status ? route.fulfill({ status }) : route.abort()).catch(
      () => undefined
    );
  });
}

/** Holds the first request to `url` that `isHeld` takes, at the browser, until `release` runs. */
export async function holdRequest(
  page: IJupyterLabPageFixture,
  url: string | RegExp,
  isHeld: (request: Request) => boolean = () => true
): Promise<{ held: Promise<void>; release: () => void }> {
  let arrived!: () => void;
  let release!: () => void;
  const held = new Promise<void>(resolve => (arrived = resolve));
  const released = new Promise<void>(resolve => (release = resolve));
  let holding = true;
  await page.route(url, async route => {
    if (holding && isHeld(route.request())) {
      holding = false;
      arrived();
      await released;
    }
    await route.fallback();
  });
  return { held, release };
}

/** Holds the page's next save of the settings, through the write route or through a plain PUT. */
export function holdSettingsWrite(
  page: IJupyterLabPageFixture
): Promise<{ held: Promise<void>; release: () => void }> {
  return holdRequest(
    page,
    /\/settings-write|\/lab\/api\/settings\/@stellarshenson/,
    request => request.method() !== 'GET'
  );
}

export const PLUGIN_ID =
  '@stellarshenson/jupyterlab-bookmarks-manager-extension:plugin';
export const PANEL_ID = 'jupyterlab_bookmarks_manager_extension-panel';

/** A section of the panel. `recent` is fed by the server's proxy tap, never by the bookmarks setting. */
type Section = 'links' | 'files' | 'sessions' | 'recent';

/** The value of the `bookmarks` setting, with empty sections by default. */
export function bookmarks(
  value: Partial<Record<Section, unknown[]>> = {}
): Record<string, unknown> {
  return { version: 1, links: [], files: [], sessions: [], ...value };
}

/** Galata's default mocked settings plus the given bookmarks. */
export function mockBookmarks(
  value: Partial<Record<Section, unknown[]>> = {}
): Record<string, unknown> {
  return {
    ...galata.DEFAULT_SETTINGS,
    [PLUGIN_ID]: { bookmarks: bookmarks(value) }
  };
}

/** Sets the marker colour through the registry the Settings Editor saves through; the panel renders on it. */
export async function setMarkColour(
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

/** The port of the real service `proxy_backend.py`, started by playwright.config.js. */
export const BACKEND_PORT = process.env.JUPYTER_TEST_BACKEND_PORT!;

/** The path under the lab of the real service's page titled `title`. */
export function backendPath(title: string): string {
  return `proxy/${BACKEND_PORT}/${encodeURIComponent(title)}/`;
}

/** Opens the Bookmarks panel from its side-bar tab. */
export async function openPanel(page: IJupyterLabPageFixture): Promise<void> {
  // The layout restore sets the side bar's current tab after `started`; Lumino
  // reads a click on the current tab as a deselect, which collapses the side bar.
  // Wait for the restore before clicking, or the click can land on the tab it
  // just made current (DEF-SUITE-18-RELOAD-ACTIVATE).
  await page.evaluate(async () => {
    await (window as any).jupyterapp.restored;
  });
  await page.sidebar.openTab(PANEL_ID);
}

export function section(page: IJupyterLabPageFixture, key: Section): Locator {
  return page.locator(`.jp-BookmarksPanel-section[data-section="${key}"]`);
}

export function sectionLabel(
  page: IJupyterLabPageFixture,
  key: Section
): Locator {
  return section(page, key).locator('.jp-BookmarksPanel-sectionLabel');
}

/** The count of the rows a section shows, after the filter. */
export function sectionCount(
  page: IJupyterLabPageFixture,
  key: Section
): Locator {
  return section(page, key).locator('.jp-BookmarksPanel-sectionCount');
}

/** The tree row, folder or bookmark, whose shown name is `name`. */
export function row(page: IJupyterLabPageFixture, name: string): Locator {
  return page.locator('.jp-BookmarksPanel-row').filter({
    has: page.locator('.jp-BookmarksPanel-rowText').getByText(name, {
      exact: true
    })
  });
}

/** Right-clicks `target` and runs the context-menu item `label`. */
export async function contextMenu(
  page: IJupyterLabPageFixture,
  target: Locator,
  label: string
): Promise<void> {
  await target.click({ button: 'right' });
  await page.getByRole('menuitem', { name: label }).click();
}

/** The + button of the section header named `title`, for example `Links`. */
export function plusButton(
  page: IJupyterLabPageFixture,
  title: string
): Locator {
  return page.getByRole('button', {
    name: `New Bookmark or Folder in ${title}`
  });
}

/** Opens the + menu of the section named `title` and runs its item `label`. */
export async function plusMenu(
  page: IJupyterLabPageFixture,
  title: string,
  label: 'New Bookmark...' | 'New Folder'
): Promise<void> {
  await plusButton(page, title).click();
  await page.getByRole('menuitem', { name: label }).click();
}

/**
 * Drags a main-area tab onto `target` with the pointer, which is how Lumino
 * moves a tab; `hold` runs while the pointer rests on the target, before the
 * release.
 */
export async function dragTab(
  page: IJupyterLabPageFixture,
  tab: Locator,
  target: Locator,
  hold?: () => Promise<void>
): Promise<void> {
  const from = (await tab.boundingBox())!;
  const to = (await target.boundingBox())!;
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, {
    steps: 10
  });
  await hold?.();
  await page.mouse.up();
}

/**
 * Waits until the saved workspace's data holds what `holds` tests. JupyterLab saves the workspace 500 ms
 * after its last change, so a reload sooner can restore the state before that change. The test reads the
 * saved value, so the result is the same whether the save ends before or after this wait starts.
 */
export async function workspaceSaved(
  page: IJupyterLabPageFixture,
  holds: (data: Record<string, any>) => boolean
): Promise<void> {
  await expect
    .poll(async () => {
      // Through the page: galata's mock of the workspace is a route, which page.request does not pass.
      const saved = await page.evaluate(async () =>
        (await fetch('/lab/api/workspaces/default')).json()
      );
      return holds(saved.data);
    })
    .toBe(true);
}

/** Waits until the saved layout no longer names `text`, the path or URL of a closed tab, so a reload does not restore the tab. */
export function closedTabSaved(
  page: IJupyterLabPageFixture,
  text: string
): Promise<void> {
  return workspaceSaved(
    page,
    data => !JSON.stringify(data['layout-restorer:data'] ?? {}).includes(text)
  );
}

/** The tab's mark ribbon, the label's `::after`: its content, size and colour. */
export function tabMark(
  tab: Locator
): Promise<{ content: string; width: string; height: string; colour: string }> {
  return tab.evaluate(element => {
    const label = element.querySelector('.lm-TabBar-tabLabel');
    const style = label ? getComputedStyle(label, '::after') : undefined;
    return {
      content: style ? style.content : '',
      width: style ? style.width : '',
      height: style ? style.height : '',
      colour: style ? style.backgroundColor : ''
    };
  });
}

/** The computed colour of a `--jp-*` token, read through a probe element in the page. */
export function tokenColour(target: Locator, token: string): Promise<string> {
  return target.evaluate((element, token) => {
    const probe = document.createElement('div');
    probe.style.color = `var(${token})`;
    document.body.appendChild(probe);
    const colour = getComputedStyle(probe).color;
    probe.remove();
    return colour;
  }, token);
}

/** The computed font-family of `target`, beside that of a probe at `--jp-code-font-family`, so a test compares against the theme. */
export function codeFont(
  target: Locator
): Promise<{ field: string; code: string }> {
  return target.evaluate(element => {
    const probe = document.createElement('span');
    probe.style.fontFamily = 'var(--jp-code-font-family)';
    document.body.appendChild(probe);
    const code = getComputedStyle(probe).fontFamily;
    probe.remove();
    return { field: getComputedStyle(element).fontFamily, code };
  });
}
