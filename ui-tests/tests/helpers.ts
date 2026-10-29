import {
  galata,
  IJupyterLabPageFixture,
  test as galataTest
} from '@jupyterlab/galata';
import { Locator } from '@playwright/test';

/**
 * Galata's test for the mocked-settings specs. The page goes offline before galata's teardown
 * removes the settings mock, so a write still running when the test ends fails instead of
 * reaching the test server that every worker shares.
 */
export const test = galataTest.extend({
  page: async ({ page }, use) => {
    await use(page);
    await page.context().setOffline(true);
  }
});

export const PLUGIN_ID = 'jupyterlab_bookmarks_manager_extension:plugin';
export const PANEL_ID = 'jupyterlab_bookmarks_manager_extension-panel';

/** A section of the panel. `recent` is fed by `server-proxy:open`, never by the bookmarks setting. */
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
 * Waits for the next workspace save. JupyterLab saves the layout 500 ms after its last change,
 * so a reload sooner after closing a tab can restore the tab; await this between close and reload.
 */
export async function layoutSaved(page: IJupyterLabPageFixture): Promise<void> {
  await page.waitForResponse(
    response =>
      response.request().method() === 'PUT' &&
      galata.Routes.workspaces.test(response.url())
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
