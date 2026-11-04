import { expect, IJupyterLabPageFixture } from '@jupyterlab/galata';
import {
  contextMenu,
  dragTab,
  mockBookmarks,
  openPanel,
  PANEL_ID,
  plusMenu,
  row,
  section,
  sectionLabel,
  setMarkColour,
  test,
  tokenColour
} from './helpers';

/** A button of the panel's top bar, by its label. */
const topButton = (page: IJupyterLabPageFixture, name: string) =>
  page
    .locator('.jp-BookmarksPanel-header')
    .getByRole('button', { name, exact: true });

test.use({ mockSettings: mockBookmarks() });

test('panel is on the left by default', async ({ page }) => {
  await expect(page.sidebar.getTabLocator(PANEL_ID)).toBeVisible();
  expect(await page.sidebar.getTabPosition(PANEL_ID)).toBe('left');
  await openPanel(page);
  await expect(
    page.locator('#jp-left-stack').locator(`#${PANEL_ID}`)
  ).toBeVisible();
});

test('switch sidebar side moves the panel to the right', async ({ page }) => {
  await contextMenu(
    page,
    page.sidebar.getTabLocator(PANEL_ID),
    'Switch Sidebar Side'
  );
  await expect(
    page.locator(`.jp-SideBar.jp-mod-right [data-id="${PANEL_ID}"]`)
  ).toBeVisible();
  await expect(
    page.locator(`.jp-SideBar.jp-mod-left [data-id="${PANEL_ID}"]`)
  ).toHaveCount(0);
  await openPanel(page);
  await expect(
    page.locator('#jp-right-stack').locator(`#${PANEL_ID}`)
  ).toBeVisible();
});

test('four section headers with counts', async ({ page, tmpPath }) => {
  await page.contents.uploadContent('note', 'text', `${tmpPath}/note.txt`);
  await page.filebrowser.open(`${tmpPath}/note.txt`);
  await openPanel(page);
  await expect(page.locator('.jp-BookmarksPanel-sectionLabel')).toHaveText([
    'LINKS (0)',
    'FILES (0)',
    'SESSIONS (0)',
    'PROXY (0)'
  ]);

  await contextMenu(
    page,
    page.activity.getTabLocator('note.txt'),
    'Add Tab to Bookmarks'
  );
  await expect(sectionLabel(page, 'files')).toHaveText('FILES (1)');
  await expect(sectionLabel(page, 'links')).toHaveText('LINKS (0)');
});

test('empty sections show their hint', async ({ page }) => {
  await openPanel(page);
  for (const key of ['links', 'files', 'sessions'] as const) {
    await expect(
      section(page, key).locator('.jp-BookmarksPanel-empty')
    ).toHaveText(`No ${key}. Use Add Tab to Bookmarks on a tab.`);
  }
});

test('launcher tab has no bookmark item', async ({ page }) => {
  await page.activity.getTabLocator('Launcher').click({ button: 'right' });
  // The menu is open: the item below is hidden, not merely not shown yet.
  await expect(
    page.locator('.lm-Menu-item[data-command="application:close"]')
  ).toBeVisible();
  // Lumino renders a hidden item with lm-mod-hidden, so the assertion is toBeHidden, not a count.
  await expect(
    page.locator(
      '.lm-Menu-item[data-command="jupyterlab_bookmarks_manager_extension:toggle-tab"]'
    )
  ).toBeHidden();
});

test('title has the size of the section labels', async ({ page }) => {
  await openPanel(page);
  const fontSize = (selector: string) =>
    page
      .locator(selector)
      .first()
      .evaluate(node => getComputedStyle(node).fontSize);
  const title = await fontSize('.jp-BookmarksPanel-title');
  expect(title).toBe(await fontSize('.jp-BookmarksPanel-sectionLabel'));
  // The AI code assistants panel title: --jp-ui-font-size0 inside a panel at --jp-ui-font-size1.
  const reference = await page.evaluate(() => {
    const panel = document.createElement('div');
    panel.style.fontSize = 'var(--jp-ui-font-size1)';
    const label = panel.appendChild(document.createElement('span'));
    label.style.fontSize = 'var(--jp-ui-font-size0)';
    document.body.appendChild(panel);
    const size = getComputedStyle(label).fontSize;
    panel.remove();
    return size;
  });
  expect(title).toBe(reference);
});

test('a divider stands above the first section band', async ({ page }) => {
  await openPanel(page);
  const body = page.locator('.jp-BookmarksPanel-body');
  await expect(body).toHaveCSS('border-top-width', '1px');
  await expect(body).toHaveCSS('border-top-style', 'solid');
  await expect(body).toHaveCSS(
    'border-top-color',
    await tokenColour(body, '--jp-border-color3')
  );

  const band = section(page, 'links').locator(
    '.jp-BookmarksPanel-sectionHeader'
  );
  expect((await band.boundingBox())!.y).toBe((await body.boundingBox())!.y + 1);

  await topButton(page, 'Filter bookmarks').click();
  const filter = page.locator('.jp-BookmarksPanel-filter');
  await expect(filter).toBeVisible();
  const box = (await filter.boundingBox())!;
  expect(box.y + box.height).toBeLessThanOrEqual((await body.boundingBox())!.y);
});

test.describe('one left inset', () => {
  // One file bookmark, so the Files section has a row icon to measure.
  test.use({
    mockSettings: mockBookmarks({
      files: [
        {
          kind: 'file',
          id: 'note',
          name: 'note.txt',
          path: 'bookmarks-inset/note.txt'
        }
      ]
    })
  });

  test('panel content shares one left inset', async ({ page }) => {
    await openPanel(page);
    const left = async (selector: string) =>
      (await page.locator(selector).first().boundingBox())!.x;
    const empty = page.locator('.jp-BookmarksPanel-empty').first();
    await expect(
      page.locator('[data-section="files"] .jp-BookmarksPanel-rowIcon').first()
    ).toBeVisible();

    const labelLeft = await left('.jp-BookmarksPanel-sectionLabel');
    // The empty state is a padded block: its text starts past its box.
    const emptyLeft =
      (await left('.jp-BookmarksPanel-empty')) +
      (await empty.evaluate(node =>
        parseFloat(getComputedStyle(node).paddingLeft)
      ));
    const iconLeft = await left(
      '[data-section="files"] .jp-BookmarksPanel-rowIcon'
    );
    const panelLeft = await left('.jp-BookmarksPanel');
    const titleLeft = await left('.jp-BookmarksPanel-title');
    expect(Math.abs(labelLeft - panelLeft - 12)).toBeLessThanOrEqual(1);
    expect(Math.abs(labelLeft - emptyLeft)).toBeLessThanOrEqual(1);
    expect(Math.abs(labelLeft - iconLeft)).toBeLessThanOrEqual(1);
    expect(Math.abs(emptyLeft - iconLeft)).toBeLessThanOrEqual(1);
    expect(Math.abs(titleLeft - labelLeft)).toBeLessThanOrEqual(1);

    expect(
      await page
        .locator('.jp-BookmarksPanel-caret')
        .first()
        .evaluate(node => getComputedStyle(node).width)
    ).toBe('8px');
  });
});

test.describe('refresh', () => {
  // A folder of its own in the server root: the bookmark must name the path before the page loads.
  const path = 'bookmarks-refresh/note.txt';
  test.use({
    mockSettings: mockBookmarks({
      files: [{ kind: 'file', id: 'note', name: 'note.txt', path }]
    })
  });

  test('refresh marks a deleted file missing', async ({ page }) => {
    await openPanel(page);
    // Checked on panel load, before the file exists.
    await expect(row(page, 'note.txt')).toHaveClass(/jp-mod-missing/);
    await page.contents.uploadContent('note', 'text', path);

    const refresh = topButton(page, 'Refresh');
    // The spin waits for the read of the terminals, so the test holds it while it reads the spin.
    let release!: () => void;
    const released = new Promise<void>(resolve => (release = resolve));
    await page.route(/\/api\/terminals/, async route => {
      await released;
      await route.fallback();
    });
    await refresh.click();
    await expect(refresh).toHaveClass(/jp-mod-spinning/);
    await expect(refresh).toBeDisabled();
    release();
    await expect(refresh).not.toHaveClass(/jp-mod-spinning/);
    await expect(refresh).toBeEnabled();
    await expect(row(page, 'note.txt')).not.toHaveClass(/jp-mod-missing/);

    expect(await page.contents.deleteFile(path)).toBe(true);
    // Nothing else checks the file now: a new bookmark renders the panel and has its own check and
    // mark, and by that mark a check of the known file has been sent. The mark waits for the click.
    let checks = 0;
    page.on('request', request => {
      checks += request.url().includes(path) ? 1 : 0;
    });
    await plusMenu(page, 'Files', 'New Bookmark...');
    const dialog = page.locator('.jp-Dialog');
    await dialog.getByLabel('Name').fill('gone.txt');
    await dialog.getByLabel('Location').fill('bookmarks-refresh/gone.txt');
    await dialog.locator('.jp-mod-accept').click();
    await expect(row(page, 'gone.txt')).toHaveClass(/jp-mod-missing/);
    expect(checks).toBe(0);
    await expect(row(page, 'note.txt')).not.toHaveClass(/jp-mod-missing/);
    await refresh.click();
    await expect(row(page, 'note.txt')).toHaveClass(/jp-mod-missing/);
    expect(checks).toBeGreaterThan(0);
    await expect(row(page, 'note.txt')).toHaveAttribute(
      'title',
      `File not found: ${path}`
    );
  });
});

test.describe('filter', () => {
  test.use({
    mockSettings: mockBookmarks({
      links: [
        {
          kind: 'folder',
          id: 'apps',
          name: 'Apps',
          children: [
            { kind: 'link', id: 'mlflow', name: 'MLflow', url: 'mlflow/' },
            { kind: 'link', id: 'grafana', name: 'Grafana', url: 'grafana/' }
          ]
        },
        {
          kind: 'link',
          id: 'docs',
          name: 'Docs',
          url: 'https://example.com/docs/'
        }
      ],
      files: [{ kind: 'file', id: 'b', name: 'b.txt', path: 'notes/b.txt' }],
      sessions: [
        {
          kind: 'session',
          id: 'sleep',
          name: 'sleep - tmp',
          cwd: '/tmp',
          command: 'sleep 300',
          env: {}
        }
      ]
    })
  });

  test('filter narrows the sections', async ({ page }) => {
    await openPanel(page);
    const rows = page.locator('.jp-BookmarksPanel-row');
    const box = page
      .locator(`#${PANEL_ID}`)
      .getByRole('searchbox', { name: 'Filter bookmarks' });
    const filter = topButton(page, 'Filter bookmarks');

    // A folded folder, so the test sees the fold state come back.
    await row(page, 'Apps').click();
    await expect(row(page, 'MLflow')).toBeHidden();
    await expect(rows).toHaveCount(4);
    await expect(box).toBeHidden();
    await expect(filter).toHaveAttribute('aria-pressed', 'false');

    await filter.click();
    await expect(filter).toHaveAttribute('aria-pressed', 'true');
    await expect(box).toBeFocused();

    // Part of one name, in other case: that row and its folder, open.
    await box.fill('MLF');
    await expect(rows).toHaveCount(2);
    await expect(row(page, 'Apps')).toHaveAttribute('aria-expanded', 'true');
    await expect(row(page, 'MLflow')).toBeVisible();
    await expect(page.locator('.jp-BookmarksPanel-sectionLabel')).toHaveText([
      'LINKS (1)',
      'FILES (0)',
      'SESSIONS (0)',
      'PROXY (0)'
    ]);
    await expect(
      section(page, 'files').locator('.jp-BookmarksPanel-empty')
    ).toHaveText('No matching bookmarks.');

    // A click on the folder keeps it open and leaves its saved fold state alone.
    await row(page, 'Apps').click();
    await expect(row(page, 'Apps')).toHaveAttribute('aria-expanded', 'true');
    await expect(row(page, 'MLflow')).toBeVisible();

    // The URL, the path and the command match as the name does.
    for (const [query, name] of [
      ['example.com', 'Docs'],
      ['notes/', 'b.txt'],
      ['sleep 3', 'sleep - tmp']
    ]) {
      await box.fill(query);
      await expect(rows).toHaveCount(1);
      await expect(row(page, name)).toBeVisible();
    }

    // An empty box: every bookmark, and the folder folded again.
    await box.fill('');
    await expect(rows).toHaveCount(4);
    await expect(row(page, 'Apps')).toHaveAttribute('aria-expanded', 'false');
    await expect(row(page, 'MLflow')).toBeHidden();
    await expect(page.locator('.jp-BookmarksPanel-sectionLabel')).toHaveText([
      'LINKS (3)',
      'FILES (1)',
      'SESSIONS (1)',
      'PROXY (0)'
    ]);

    // A hidden box: every bookmark too.
    await box.fill('docs');
    await expect(rows).toHaveCount(1);
    await filter.click();
    await expect(box).toBeHidden();
    await expect(filter).toHaveAttribute('aria-pressed', 'false');
    await expect(rows).toHaveCount(4);
    await expect(row(page, 'Apps')).toHaveAttribute('aria-expanded', 'false');
  });
});

test.describe('a render during a press', () => {
  test.use({
    mockSettings: mockBookmarks({
      links: [
        {
          kind: 'folder',
          id: 'folder',
          name: 'Folder',
          children: [
            { kind: 'link', id: 'inside', name: 'Inside', url: '/lab/inside' }
          ]
        }
      ]
    })
  });

  test('the click of the press acts, and the render follows the release', async ({
    page
  }) => {
    await openPanel(page);
    await expect(row(page, 'Inside')).toBeVisible();
    const box = (await row(page, 'Folder').boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await setMarkColour(page, 'red');
    await page.mouse.up();

    // The click on the folder row folds it.
    await expect(row(page, 'Inside')).toHaveCount(0);
    await expect(page.locator(`#${PANEL_ID}`)).toHaveAttribute(
      'data-mark',
      'red'
    );
  });

  /** Sends one pointer event, as the browser does; the panel listens on the document. */
  const pointerEvent = (
    page: IJupyterLabPageFixture,
    type: string,
    buttons: number
  ) =>
    page.evaluate(
      ({ type, buttons }) => {
        document.body.dispatchEvent(
          new PointerEvent(type, { bubbles: true, buttons })
        );
      },
      { type, buttons }
    );

  test('the render after a release waits for the click of that release', async ({
    page
  }) => {
    await openPanel(page);
    const panel = page.locator(`#${PANEL_ID}`);
    const before = await panel.getAttribute('data-mark');
    await pointerEvent(page, 'pointerdown', 1);
    await setMarkColour(page, 'red');
    await pointerEvent(page, 'pointerup', 0);

    // Nothing but the click can run the render: this evaluate lets every task queued before it run.
    await page.evaluate(() => new Promise(resolve => setTimeout(resolve)));
    expect(await panel.getAttribute('data-mark')).toBe(before);

    await page.evaluate(() => document.body.click());
    await expect(panel).toHaveAttribute('data-mark', 'red');
  });

  test('a press on a row released elsewhere renders at the next move', async ({
    page
  }) => {
    await openPanel(page);
    const box = (await row(page, 'Folder').boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await setMarkColour(page, 'red');
    await page.mouse.move(box.x + box.width + 300, box.y + 200);
    await page.mouse.up();
    await page.mouse.move(box.x + box.width + 301, box.y + 201);

    await expect(page.locator(`#${PANEL_ID}`)).toHaveAttribute(
      'data-mark',
      'red'
    );
    await expect(row(page, 'Inside')).toBeVisible();
  });

  test('a right-button press and release renders', async ({ page }) => {
    await openPanel(page);
    const box = (await row(page, 'Folder').boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down({ button: 'right' });
    await setMarkColour(page, 'red');
    await page.mouse.up({ button: 'right' });

    await expect(page.locator(`#${PANEL_ID}`)).toHaveAttribute(
      'data-mark',
      'red'
    );
    await page.keyboard.press('Escape');
  });

  test('a release the browser did not report ends the press at the next move', async ({
    page
  }) => {
    await openPanel(page);
    const panel = page.locator(`#${PANEL_ID}`);
    const before = await panel.getAttribute('data-mark');
    await pointerEvent(page, 'pointerdown', 1);
    await setMarkColour(page, 'red');
    // Lumino's tab drag sends such a move of its own when it starts, with the button down.
    await pointerEvent(page, 'pointermove', 0);
    expect(await panel.getAttribute('data-mark')).toBe(before);

    await page.mouse.move(10, 10);
    await expect(panel).toHaveAttribute('data-mark', 'red');

    // The press is over, so the next render runs at once.
    await setMarkColour(page, 'brand');
    await expect(panel).toHaveAttribute('data-mark', 'brand');
  });
});

test.describe('drag a tab onto the panel', () => {
  test.use({ mockSettings: mockBookmarks() });

  test('a dropped tab is bookmarked in its section or folder', async ({
    page,
    baseURL,
    tmpPath
  }) => {
    const url = `${baseURL}/files/${tmpPath}/page.html`;
    await page.contents.uploadContent(
      '<html><head><title>Page</title></head><body>page</body></html>',
      'text',
      `${tmpPath}/page.html`
    );
    await page.contents.uploadContent('note', 'text', `${tmpPath}/note.txt`);
    await page.evaluate(
      async ({ url, title }) => {
        await (window as any).jupyterapp.commands.execute('help:open', {
          url,
          text: title
        });
      },
      { url, title: 'Page' }
    );
    await expect(page.activity.getTabLocator('Page')).toBeVisible();
    // The file opens while the File Browser has the sidebar; the panel then takes the sidebar.
    await page.sidebar.openTab('filebrowser');
    await page.filebrowser.open(`${tmpPath}/note.txt`);
    await expect(page.activity.getTabLocator('note.txt')).toBeVisible();
    await openPanel(page);

    // A page tab dropped on the Links section: the section header marks, and the row is at the root.
    const linksHeader = section(page, 'links').locator(
      '.jp-BookmarksPanel-sectionHeader'
    );
    await dragTab(
      page,
      page.activity.getTabLocator('Page'),
      section(page, 'links'),
      async () => {
        await expect(linksHeader).toHaveClass(/jp-mod-dropTarget/);
      }
    );
    await expect(linksHeader).not.toHaveClass(/jp-mod-dropTarget/);
    await expect(row(page, 'Page')).toHaveAttribute('aria-level', '1');
    await expect(sectionLabel(page, 'links')).toHaveText('LINKS (1)');

    // A folder in Files, then a file tab dropped on its row: the row marks, and the bookmark lands inside.
    await plusMenu(page, 'Files', 'New Folder');
    const dialog = page.locator('.jp-Dialog');
    await dialog.locator('input').fill('Notes');
    await dialog.locator('.jp-mod-accept').click();
    await expect(dialog).toHaveCount(0);

    await dragTab(
      page,
      page.activity.getTabLocator('note.txt'),
      row(page, 'Notes'),
      async () => {
        await expect(row(page, 'Notes')).toHaveClass(/jp-mod-dropTarget/);
      }
    );
    await expect(row(page, 'Notes')).not.toHaveClass(/jp-mod-dropTarget/);
    await expect(row(page, 'note.txt')).toHaveAttribute('aria-level', '2');
    await expect(sectionLabel(page, 'files')).toHaveText('FILES (1)');
  });

  test('a render during the drag keeps the drop mark, and the drop lands', async ({
    page,
    tmpPath
  }) => {
    await page.contents.uploadContent('note', 'text', `${tmpPath}/held.txt`);
    await page.sidebar.openTab('filebrowser');
    await page.filebrowser.open(`${tmpPath}/held.txt`);
    await expect(page.activity.getTabLocator('held.txt')).toBeVisible();
    await openPanel(page);

    const filesHeader = section(page, 'files').locator(
      '.jp-BookmarksPanel-sectionHeader'
    );
    await dragTab(
      page,
      page.activity.getTabLocator('held.txt'),
      section(page, 'files'),
      async () => {
        await expect(filesHeader).toHaveClass(/jp-mod-dropTarget/);
        await setMarkColour(page, 'red');
        await expect(filesHeader).toHaveClass(/jp-mod-dropTarget/);
      }
    );
    await expect(filesHeader).not.toHaveClass(/jp-mod-dropTarget/);
    await expect(sectionLabel(page, 'files')).toHaveText('FILES (1)');
    await expect(page.locator(`#${PANEL_ID}`)).toHaveAttribute(
      'data-mark',
      'red'
    );
  });
});
