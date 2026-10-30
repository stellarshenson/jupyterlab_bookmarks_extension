import { expect, IJupyterLabPageFixture } from '@jupyterlab/galata';
import { Locator } from '@playwright/test';
import {
  BACKEND_PORT,
  backendPath,
  mockBookmarks,
  openPanel,
  plusMenu,
  section,
  sectionLabel,
  test,
  tokenColour
} from './helpers';

test.use({ mockSettings: mockBookmarks() });

const OPEN_PAGE = 'Open Proxy Page';
const SERVER_PROXY_PLUGIN =
  '@jupyterhub/jupyter-server-proxy:add-launcher-entries';

/** The URL of a page at port 5555. */
const pageUrl = (path: string) => new RegExp(`/proxy/5555${path}$`);

/** Answers the page at port 5555 and `path` with a page titled `title`. */
const servePage = (
  page: IJupyterLabPageFixture,
  path: string,
  title = 'My Service'
) =>
  page.route(pageUrl(path), route =>
    route.fulfill({
      contentType: 'text/html',
      body: `<title>${title}</title>`
    })
  );

const rowTitles = (page: IJupyterLabPageFixture) =>
  section(page, 'recent').locator('.jp-BookmarksPanel-rowText');

const openButton = (dialog: Locator) =>
  dialog.getByRole('button', { name: 'Open', exact: true });

async function openPopup(page: IJupyterLabPageFixture): Promise<Locator> {
  await page.getByRole('button', { name: OPEN_PAGE }).click();
  const dialog = page.locator('.jp-Dialog');
  await expect(dialog.locator('.jp-Dialog-header')).toHaveText(OPEN_PAGE);
  return dialog;
}

/** Enters port 5555 and `path`; a `fill` sends its `change` event on the blur. */
async function enterPage(dialog: Locator, path: string): Promise<void> {
  await dialog.getByLabel('Port').fill('5555');
  await dialog.getByLabel('Path').fill(path);
  await dialog.getByLabel('Path').blur();
}

test('the + button opens the popup, and Cancel opens nothing', async ({
  page
}, testInfo) => {
  await openPanel(page);
  const dialog = await openPopup(page);
  await expect(dialog.getByLabel('Port')).toBeFocused();
  await expect(dialog.getByLabel('Port')).toHaveAttribute(
    'placeholder',
    '8501'
  );
  await expect(dialog.getByLabel('Path')).toHaveAttribute(
    'placeholder',
    '/api/docs'
  );
  await expect(dialog.getByLabel('Name')).toHaveValue('');
  await expect(dialog.getByLabel('New browser tab')).not.toBeChecked();
  await expect(dialog.locator('th')).toHaveText([
    'Port',
    'Path',
    'Name',
    'New browser tab'
  ]);
  await expect(
    dialog.getByRole('button', { name: 'Reset Name' })
  ).toBeVisible();
  await expect(dialog.locator('.jp-Dialog-footer button')).toHaveText([
    'Cancel',
    'Open'
  ]);
  await dialog.screenshot({ path: testInfo.outputPath('popup-light.png') });

  await dialog.getByLabel('Port').fill('5555');
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('main').getByRole('tab')).toHaveText([
    'Launcher'
  ]);
  await expect(sectionLabel(page, 'recent')).toHaveText('PROXY (0)');

  // The surface follows the theme, so the dialog holds no literal colour.
  const surface = (target: Locator) =>
    target
      .locator('.jp-Dialog-content')
      .evaluate(element => getComputedStyle(element).backgroundColor);
  const light = await surface(await openPopup(page));
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await page.theme.setDarkTheme();
  const dark = await openPopup(page);
  expect(await surface(dark)).not.toBe(light);
  await dark.screenshot({ path: testInfo.outputPath('popup-dark.png') });
});

test('a click on a label ticks the box or focuses the field, in the popup and an edit dialog', async ({
  page
}) => {
  await openPanel(page);
  const dialog = await openPopup(page);
  const label = (text: string) => dialog.locator('th label', { hasText: text });
  await label('New browser tab').click();
  await expect(dialog.getByLabel('New browser tab')).toBeChecked();
  await label('New browser tab').click();
  await expect(dialog.getByLabel('New browser tab')).not.toBeChecked();
  // Port has the focus on open, so the focus moves away first.
  await label('Path').click();
  await expect(dialog.getByLabel('Path')).toBeFocused();
  await label('Port').click();
  await expect(dialog.getByLabel('Port')).toBeFocused();
  await dialog.getByRole('button', { name: 'Cancel' }).click();

  await plusMenu(page, 'Files', 'New Bookmark...');
  await label('Location').click();
  await expect(dialog.getByLabel('Location')).toBeFocused();
  await label('Folder').click();
  await expect(dialog.getByLabel('Folder')).toBeFocused();
});

test('the checkbox is drawn to the design system in both themes', async ({
  page
}) => {
  await openPanel(page);
  for (const setTheme of [
    () => page.theme.setLightTheme(),
    () => page.theme.setDarkTheme()
  ]) {
    await setTheme();
    const dialog = await openPopup(page);
    const box = dialog.getByLabel('New browser tab');
    const style = (name: string, pseudo?: string) =>
      box.evaluate(
        (element, [name, pseudo]) =>
          getComputedStyle(element, pseudo).getPropertyValue(name),
        [name, pseudo]
      );
    // Open is filled with the brand colour.
    const brand = await openButton(dialog).evaluate(
      element => getComputedStyle(element).backgroundColor
    );
    expect(await box.boundingBox()).toMatchObject({ width: 15, height: 15 });
    expect(await style('border-radius')).toBe('2px');
    expect(await style('background-color')).not.toBe(brand);
    expect(await style('content', '::before')).toBe('none');

    // The ring is for the keyboard.
    await dialog.getByRole('button', { name: 'Reset Name' }).focus();
    await page.keyboard.press('Tab');
    await expect(box).toBeFocused();
    expect(await style('outline-style')).toBe('solid');
    expect(await style('outline-width')).toBe('1px');
    expect(await style('outline-offset')).toBe('1px');
    expect(await style('outline-color')).toBe(brand);

    await page.keyboard.press('Space');
    await expect(box).toBeChecked();
    expect(await style('background-color')).toBe(brand);
    expect(await style('border-top-color')).toBe(brand);
    expect(await style('content', '::before')).toBe('""');
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog).toHaveCount(0);
  }
});

test('Port has no spin buttons', async ({ page }) => {
  await openPanel(page);
  const dialog = await openPopup(page);
  const port = dialog.getByLabel('Port');
  await port.fill('8501');
  // A computed style does not reach the buttons, so the test clicks where the up arrow stands.
  const { width } = (await port.boundingBox())!;
  await port.click({ position: { x: width - 15, y: 9 } });
  await expect(port).toHaveValue('8501');
});

test('Open opens the page in a lab tab or a browser tab, and lists it', async ({
  page
}) => {
  await page
    .context()
    .route(/\/proxy\/5555\//, route =>
      route.fulfill({ status: 502, body: '' })
    );
  await openPanel(page);

  let dialog = await openPopup(page);
  await enterPage(dialog, '/x');
  await openButton(dialog).click();
  const tab = page.activity.getTabLocator('Proxy :5555/x');
  await expect(tab).toBeVisible();
  await expect(page.locator('.jp-ServerProxy iframe')).toHaveAttribute(
    'src',
    /\/proxy\/5555\/x$/
  );
  await expect(rowTitles(page)).toHaveText(['Proxy :5555/x']);

  // The same page again reuses its tab.
  await page.activity.activateTab('Launcher');
  dialog = await openPopup(page);
  await enterPage(dialog, '/x');
  await openButton(dialog).click();
  await expect(tab).toHaveClass(/jp-mod-current/);
  await expect(tab).toHaveCount(1);
  await expect(rowTitles(page)).toHaveText(['Proxy :5555/x']);

  dialog = await openPopup(page);
  await enterPage(dialog, '/y');
  await dialog.getByLabel('New browser tab').check();
  const opened = page.context().waitForEvent('page');
  await openButton(dialog).click();
  const browserTab = await opened;
  await browserTab.waitForURL(/\/proxy\/5555\/y$/);
  await browserTab.close();
  await expect(rowTitles(page)).toHaveText(['Proxy :5555/y', 'Proxy :5555/x']);
  await expect(page.activity.getTabLocator('Proxy :5555/y')).toHaveCount(0);
});

test('Open stays disabled and Enter opens nothing while Port is invalid', async ({
  page
}) => {
  await openPanel(page);
  const dialog = await openPopup(page);
  const port = dialog.getByLabel('Port');
  for (const value of ['', '0', '65536', '80.5']) {
    await port.fill(value);
    await expect(openButton(dialog)).toBeDisabled();
    await port.press('Enter');
    await expect(dialog).toBeVisible();
  }
  await expect(sectionLabel(page, 'recent')).toHaveText('PROXY (0)');
  await port.fill('8501');
  await expect(openButton(dialog)).toBeEnabled();
});

test('Port is red for a wrong value under the caret, and not while empty and untouched', async ({
  page
}) => {
  await openPanel(page);
  const dialog = await openPopup(page);
  const port = dialog.getByLabel('Port');
  const error = await tokenColour(port, '--jp-error-color1');
  const brand = await tokenColour(port, '--jp-brand-color1');
  const border = 'border-top-color';

  await expect(port).toBeFocused();
  await expect(port).toHaveCSS(border, brand);
  await port.press('Tab');
  await expect(port).not.toBeFocused();
  await expect(port).not.toHaveCSS(border, error);

  await port.fill('70000');
  await expect(port).toBeFocused();
  await expect(port).toHaveCSS(border, error);
  await port.fill('8501');
  await expect(port).toHaveCSS(border, brand);
  await dialog.getByRole('button', { name: 'Cancel' }).click();

  // An edit dialog's empty required field has no placeholder and keeps the ring under the caret.
  await plusMenu(page, 'Links', 'New Bookmark...');
  const required = page.locator('.jp-Dialog').getByLabel('Name');
  await required.focus();
  await expect(required).toHaveValue('');
  await expect(required).toHaveCSS(border, brand);
});

test.describe('with the server proxy plugin disabled in the page config', () => {
  test.use({ autoGoto: false });

  test('the + button is disabled, until the command is registered', async ({
    page
  }) => {
    await page.route(/\/lab\/?(\?.*)?$/, async route => {
      const response = await route.fetch();
      const body = (await response.text()).replace(
        /(<script id="jupyter-config-data"[^>]*>)([^<]*)/,
        (_, tag: string, json: string) => {
          const config = JSON.parse(json);
          config.disabledExtensions = [
            ...(config.disabledExtensions ?? []),
            SERVER_PROXY_PLUGIN
          ];
          return tag + JSON.stringify(config);
        }
      );
      await route.fulfill({ response, body });
    });
    await page.goto();
    await openPanel(page);
    expect(
      await page.evaluate(() =>
        (window as any).jupyterapp.commands.hasCommand('server-proxy:open')
      )
    ).toBe(false);
    await expect(sectionLabel(page, 'recent')).toHaveText('PROXY (0)');
    const plus = page.getByRole('button', { name: OPEN_PAGE });
    await expect(plus).toBeDisabled();
    await expect(plus).toHaveAttribute(
      'title',
      'Open Proxy Page needs jupyter-server-proxy'
    );
    await plus.locator('span').first().click({ force: true });
    await page.waitForTimeout(200);
    await expect(page.locator('.jp-Dialog')).toHaveCount(0);

    await page.evaluate(() =>
      (window as any).jupyterapp.commands.addCommand('server-proxy:open', {
        execute: () => undefined
      })
    );
    await expect(plus).toBeEnabled();
    await expect(plus).toHaveAttribute('title', OPEN_PAGE);
  });
});

test('the Name field follows the service name, the read sends no lab header, a script of the page never runs', async ({
  page
}) => {
  await page.route(pageUrl('/x'), route =>
    route.fulfill({
      contentType: 'text/html',
      body: '<title> My\n Service </title><script>window.scriptRan = true</script>'
    })
  );
  await page.route(pageUrl('/'), route =>
    route.fulfill({ status: 502, body: '' })
  );
  await openPanel(page);
  const dialog = await openPopup(page);
  const name = dialog.getByLabel('Name');
  // A change of Port alone is enough.
  await dialog.getByLabel('Port').fill('5555');
  await dialog.getByLabel('Port').blur();
  await expect(name).toHaveValue('Proxy :5555');
  // The HTTP cache holds a second read of one URL until the first ends. A route turns that
  // cache off, so the wait cannot show here, and the test reads the option that skips it.
  await page.evaluate(() => {
    const read = window.fetch;
    window.fetch = (input, init) => {
      if (String(input).includes('/proxy/5555')) {
        (window as any).readCache = init?.cache;
      }
      return read(input, init);
    };
  });
  const read = page.waitForRequest(pageUrl('/x'));
  await enterPage(dialog, '/x');
  await expect(name).toHaveValue('My Service');
  expect(await page.evaluate(() => (window as any).scriptRan)).toBeUndefined();
  // The proxy passes these headers to whatever listens on the entered port.
  const headers = await (await read).allHeaders();
  expect(headers).not.toHaveProperty('authorization');
  expect(headers).not.toHaveProperty('x-xsrftoken');
  expect(await page.evaluate(() => (window as any).readCache)).toBe('no-store');

  await openButton(dialog).click();
  await expect(page.activity.getTabLocator('My Service')).toBeVisible();
  await expect(rowTitles(page)).toHaveText(['My Service']);
});

test('a page without a service name gets the fallback', async ({ page }) => {
  await page.route(pageUrl('/bad'), route =>
    route.fulfill({
      status: 502,
      contentType: 'text/html',
      body: '<title>Bad Gateway</title>'
    })
  );
  await page.route(pageUrl('/data'), route =>
    route.fulfill({
      contentType: 'application/json',
      body: '<title>Not a page</title>'
    })
  );
  await page.route(pageUrl('/untitled'), route =>
    route.fulfill({ contentType: 'text/html', body: '<h1>Untitled</h1>' })
  );
  // An answer that never comes: the read stops after a few seconds.
  await page.route(pageUrl('/slow'), () => undefined);
  await openPanel(page);

  // The tab opens when the read ends, so its title shows what the read gave.
  for (const path of ['/bad', '/data', '/untitled', '/slow']) {
    const dialog = await openPopup(page);
    await enterPage(dialog, path);
    await expect(dialog.getByLabel('Name')).toHaveValue(`Proxy :5555${path}`);
    await openButton(dialog).click();
    await expect(page.activity.getTabLocator(`Proxy :5555${path}`)).toBeVisible(
      { timeout: 10000 }
    );
  }
  await expect(rowTitles(page)).toHaveText([
    'Proxy :5555/slow',
    'Proxy :5555/untitled',
    'Proxy :5555/data',
    'Proxy :5555/bad'
  ]);
});

test('Enter before a change event still titles the tab with the service name', async ({
  page
}) => {
  await servePage(page, '/x');
  await openPanel(page);
  const dialog = await openPopup(page);
  await dialog.getByLabel('Port').fill('5555');
  await dialog.getByLabel('Path').fill('/x');
  await dialog.getByLabel('Path').press('Enter');
  await expect(page.activity.getTabLocator('My Service')).toBeVisible();
  await expect(rowTitles(page)).toHaveText(['My Service']);
});

test('Open with a known service name reads nothing more, and a path with no answer is read', async ({
  page
}) => {
  // Only the popup reads with `fetch`; the tab's iframe loads the page as a document.
  let reads = 0;
  page.on('request', request => {
    if (
      request.resourceType() === 'fetch' &&
      pageUrl('/x').test(request.url())
    ) {
      reads++;
    }
  });
  await servePage(page, '/x');
  await servePage(page, '/y', 'Other Service');
  await openPanel(page);
  let dialog = await openPopup(page);
  await enterPage(dialog, '/x');
  await expect(dialog.getByLabel('Name')).toHaveValue('My Service');
  expect(reads).toBe(1);
  await openButton(dialog).click();
  await expect(page.activity.getTabLocator('My Service')).toBeVisible();
  expect(reads).toBe(1);

  // The answer belongs to /x; Enter after a new path comes before its `change` event.
  dialog = await openPopup(page);
  await enterPage(dialog, '/x');
  await expect(dialog.getByLabel('Name')).toHaveValue('My Service');
  await dialog.getByLabel('Path').fill('/y');
  await dialog.getByLabel('Path').press('Enter');
  await expect(page.activity.getTabLocator('Other Service')).toBeVisible();
  await expect(rowTitles(page)).toHaveText(['Other Service', 'My Service']);
});

test('an answer for a path since changed is dropped', async ({ page }) => {
  let answer = (): void => undefined;
  const asked = new Promise<void>(resolve => {
    page.route(pageUrl('/late'), route => {
      answer = () =>
        void route.fulfill({
          contentType: 'text/html',
          body: '<title>Late Service</title>'
        });
      resolve();
    });
  });
  await servePage(page, '/x');
  await openPanel(page);
  const dialog = await openPopup(page);
  const name = dialog.getByLabel('Name');
  await enterPage(dialog, '/late');
  await asked;
  await dialog.getByLabel('Path').fill('/x');
  await dialog.getByLabel('Path').blur();
  await expect(name).toHaveValue('My Service');

  const late = page.waitForResponse(pageUrl('/late'));
  answer();
  await late;
  // The answer's handler runs after the response event.
  await page.waitForTimeout(200);
  await expect(name).toHaveValue('My Service');
});

test('a typed name stays and titles the page; Reset Name returns to the service name', async ({
  page
}) => {
  await servePage(page, '/x');
  await page.route(pageUrl('/other'), route =>
    route.fulfill({ status: 502, body: '' })
  );
  await openPanel(page);
  let dialog = await openPopup(page);
  let name = dialog.getByLabel('Name');
  await enterPage(dialog, '/x');
  await expect(name).toHaveValue('My Service');

  await name.fill('My name');
  await dialog.getByLabel('Port').fill('5556');
  await dialog.getByLabel('Port').blur();
  await expect(name).toHaveValue('My name');
  await enterPage(dialog, '/other');
  await expect(name).toHaveValue('My name');
  await openButton(dialog).click();
  await expect(page.activity.getTabLocator('My name')).toBeVisible();
  await expect(rowTitles(page)).toHaveText(['My name']);

  // The same page again: the reused tab and the row take the new name.
  dialog = await openPopup(page);
  await enterPage(dialog, '/other');
  await dialog.getByLabel('Name').fill('New name');
  await openButton(dialog).click();
  await expect(page.activity.getTabLocator('New name')).toBeVisible();
  await expect(page.activity.getTabLocator('My name')).toHaveCount(0);
  await expect(rowTitles(page)).toHaveText(['New name']);

  dialog = await openPopup(page);
  name = dialog.getByLabel('Name');
  await enterPage(dialog, '/x');
  await expect(name).toHaveValue('My Service');
  await name.fill('Another name');
  await dialog.getByRole('button', { name: 'Reset Name' }).click();
  await expect(name).toHaveValue('My Service');

  // After a reset the field follows again, and so does a field the user emptied.
  await enterPage(dialog, '/other');
  await expect(name).toHaveValue('Proxy :5555/other');
  await name.fill('Typed');
  await name.fill('');
  await enterPage(dialog, '/x');
  await expect(name).toHaveValue('My Service');
});

test('a name typed straight after Path is the whole name, whenever the answer comes', async ({
  page
}) => {
  // An answer that never comes during this test.
  await page.route(pageUrl('/late'), () => undefined);
  await servePage(page, '/x');
  await openPanel(page);
  const dialog = await openPopup(page);
  const name = dialog.getByLabel('Name');
  const path = dialog.getByLabel('Path');
  await dialog.getByLabel('Port').fill('5555');

  // The click sends the `change` of Path and puts the caret in Name before an answer.
  await path.fill('/late');
  await name.click();
  await expect(name).toHaveAttribute('placeholder', 'Proxy :5555/late');
  await page.keyboard.type('First');
  await expect(name).toHaveValue('First');

  // The answer comes while Name has the focus: the next key replaces it.
  await name.fill('');
  await path.fill('/x');
  await name.click();
  await expect(name).toHaveValue('My Service');
  await page.keyboard.type('Second');
  await expect(name).toHaveValue('Second');

  // The same by the Tab key.
  await name.fill('');
  await path.fill('/late');
  await path.press('Tab');
  await expect(name).toBeFocused();
  await page.keyboard.type('Third');
  await expect(name).toHaveValue('Third');

  await name.fill('');
  await path.fill('/x');
  await path.press('Tab');
  await expect(name).toHaveValue('My Service');
  await page.keyboard.type('Fourth');
  await expect(name).toHaveValue('Fourth');
});

test.describe('on the real service, with the proxy seeing the open', () => {
  /** Enters the real service's port and `path`. */
  const enterBackend = async (dialog: Locator, path: string) => {
    await dialog.getByLabel('Port').fill(BACKEND_PORT);
    await dialog.getByLabel('Path').fill(path);
    await dialog.getByLabel('Path').blur();
  };

  test('one open is one row, and a page loaded later by URL keeps the typed name', async ({
    page,
    baseURL
  }) => {
    const path = `${encodeURIComponent('Typed page')}/`;
    await openPanel(page);
    const dialog = await openPopup(page);
    await enterBackend(dialog, path);
    await expect(dialog.getByLabel('Name')).toHaveValue('Typed page');
    await dialog.getByLabel('Name').fill('My name');
    await openButton(dialog).click();
    await expect(page.activity.getTabLocator('My name')).toBeVisible();
    await expect(
      page.frameLocator('.jp-ServerProxy iframe').locator('body')
    ).toHaveAttribute('data-done', 'yes');
    await expect(rowTitles(page)).toHaveText(['My name']);

    const tab = await page.context().newPage();
    await tab.goto(`${baseURL}/${backendPath('Typed page')}`);
    await expect(tab.locator('body')).toHaveAttribute('data-done', 'yes');
    await tab.close();
    // A later page's row shows that the server's list has been read past the load above.
    const later = await page.context().newPage();
    await later.goto(`${baseURL}/${backendPath('Later page')}`);
    await later.close();
    await expect(rowTitles(page)).toHaveText(['Later page', 'My name']);
    // Still a lab tab: the row goes to its tab, and no browser page opens.
    await rowTitles(page).filter({ hasText: 'My name' }).click();
    await expect(page.activity.getTabLocator('My name')).toHaveClass(
      /jp-mod-current/
    );
    expect(page.context().pages()).toHaveLength(1);
  });

  test('a secret in the path field is one row, without the secret', async ({
    page,
    baseURL
  }) => {
    await openPanel(page);
    const dialog = await openPopup(page);
    await enterBackend(dialog, 'Secret%20page/?api_key=FAKE&keep=1');
    await expect(dialog.getByLabel('Name')).toHaveValue('Secret page');
    await openButton(dialog).click();
    await expect(
      page.frameLocator('.jp-ServerProxy iframe').locator('body')
    ).toHaveAttribute('data-done', 'yes');
    await expect(rowTitles(page)).toHaveText(['Secret page']);
    await expect(section(page, 'recent').locator('[data-id]')).toHaveAttribute(
      'data-id',
      `${baseURL}/${backendPath('Secret page')}?keep=1`
    );
  });

  test('a page that redirects is one row, at its final URL', async ({
    page,
    baseURL
  }) => {
    await openPanel(page);
    const dialog = await openPopup(page);
    await enterBackend(dialog, 'moved');
    await expect(dialog.getByLabel('Name')).toHaveValue('final');
    await openButton(dialog).click();
    await expect(
      page.frameLocator('.jp-ServerProxy iframe').locator('body')
    ).toHaveAttribute('data-done', 'yes');
    await expect(rowTitles(page)).toHaveText(['final']);
    await expect(section(page, 'recent').locator('[data-id]')).toHaveAttribute(
      'data-id',
      `${baseURL}/proxy/${BACKEND_PORT}/final`
    );

    // A name typed first skips the reads of the fields, so Open reads the final URL itself.
    const named = await openPopup(page);
    await named.getByLabel('Name').fill('Name first');
    await enterBackend(named, 'named/moved');
    await openButton(named).click();
    await expect(
      page.frameLocator('iframe[src$="named/moved"]').locator('body')
    ).toHaveAttribute('data-done', 'yes');
    // A later page's row shows that the server's list has been read past this open.
    const later = await page.context().newPage();
    await later.goto(`${baseURL}/${backendPath('Later page')}`);
    await later.close();
    await expect(rowTitles(page)).toHaveText([
      'Later page',
      'Name first',
      'final'
    ]);
    await expect(
      section(page, 'recent').locator('[data-id]').nth(1)
    ).toHaveAttribute(
      'data-id',
      `${baseURL}/proxy/${BACKEND_PORT}/named/final`
    );
  });

  test('a page on a closed port still gets its row from the popup', async ({
    page
  }) => {
    await openPanel(page);
    const dialog = await openPopup(page);
    await enterPage(dialog, '/closed');
    await expect(dialog.getByLabel('Name')).toHaveValue('Proxy :5555/closed');
    await openButton(dialog).click();
    await expect(
      page.activity.getTabLocator('Proxy :5555/closed')
    ).toBeVisible();
    await expect(rowTitles(page)).toHaveText(['Proxy :5555/closed']);
  });

  test('a secret in the path field is not in the name of a page with no title', async ({
    page
  }) => {
    await openPanel(page);
    const dialog = await openPopup(page);
    await enterPage(dialog, '/closed?token=FAKE&keep=1');
    await expect(dialog.getByLabel('Name')).toHaveValue(
      'Proxy :5555/closed?keep=1'
    );
    await openButton(dialog).click();
    await expect(rowTitles(page)).toHaveText(['Proxy :5555/closed?keep=1']);
  });

  test('the popup on the lab port opens the page and lists no row', async ({
    page,
    baseURL
  }) => {
    await openPanel(page);
    const dialog = await openPopup(page);
    await dialog.getByLabel('Port').fill(new URL(baseURL!).port);
    await dialog.getByLabel('Path').fill('api/status');
    await dialog.getByLabel('Path').blur();
    await expect(dialog.getByLabel('Name')).toHaveValue(/^Proxy :/);
    await openButton(dialog).click();
    await expect(page.locator('.jp-ServerProxy iframe')).toBeVisible();
    // A later page's row shows that the server's list has been read past this open.
    const later = await page.context().newPage();
    await later.goto(`${baseURL}/${backendPath('Later page')}`);
    await later.close();
    await expect(rowTitles(page)).toHaveText(['Later page']);
  });
});
