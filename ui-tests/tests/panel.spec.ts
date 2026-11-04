import { expect, IJupyterLabPageFixture } from '@jupyterlab/galata';
import { Locator } from '@playwright/test';
import {
  contextMenu,
  dragTab,
  mockBookmarks,
  openPanel,
  PANEL_ID,
  plusMenu,
  row,
  section,
  sectionCount,
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

/**
 * A locator's box, polled until non-null: a render that replaces the element leaves its
 * `boundingBox()` null for a frame, and one read can lose that race.
 */
async function settledBox(locator: Locator) {
  let box = await locator.boundingBox();
  await expect
    .poll(async () => (box = await locator.boundingBox()), { timeout: 5000 })
    .not.toBeNull();
  return box!;
}

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
    'LINKS',
    'FILES',
    'SESSIONS',
    'Proxy'
  ]);
  await expect(page.locator('.jp-BookmarksPanel-sectionCount')).toHaveText([
    '(0)',
    '(0)',
    '(0)',
    '(0)'
  ]);

  await contextMenu(
    page,
    page.activity.getTabLocator('note.txt'),
    'Add Tab to Bookmarks'
  );
  await expect(sectionCount(page, 'files')).toHaveText('(1)');
  await expect(sectionCount(page, 'links')).toHaveText('(0)');
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

test('the title band separates the panel from the first section', async ({
  page
}) => {
  await openPanel(page);
  const title = page.locator(`#${PANEL_ID} .jp-SidePanel-header`);
  await expect(title).toHaveCSS('border-bottom-width', '1px');
  await expect(title).toHaveCSS('border-bottom-style', 'solid');
  // Both bands paint --jp-layout-color2, so the line is one fill step.
  await expect(title).toHaveCSS(
    'border-bottom-color',
    await tokenColour(title, '--jp-layout-color3')
  );

  const body = page.locator('.jp-BookmarksPanel-body');
  await expect(body).toHaveCSS('border-top-width', '0px');
  const band = section(page, 'links').locator(
    '.jp-BookmarksPanel-sectionHeader'
  );
  expect((await band.boundingBox())!.y).toBe((await body.boundingBox())!.y);

  // The shown filter sits between the title band and the first section, so
  // the title band keeps its own --jp-border-color2 rule.
  await topButton(page, 'Filter bookmarks').click();
  const filter = page.locator('.jp-BookmarksPanel-filter');
  await expect(filter).toBeVisible();
  await expect(title).toHaveCSS(
    'border-bottom-color',
    await tokenColour(title, '--jp-border-color2')
  );
  const box = (await filter.boundingBox())!;
  expect(box.y + box.height).toBeLessThanOrEqual((await body.boundingBox())!.y);
});

test('a folded section above another takes the divider', async ({ page }) => {
  await openPanel(page);
  const links = section(page, 'links');
  const proxy = section(page, 'recent');
  const fold = (key: 'links' | 'recent') =>
    section(page, key).locator('.jp-BookmarksPanel-sectionToggle').click();

  // Expanded: its rows end on the panel fill, so no line.
  await expect(links).toHaveCSS('border-bottom-width', '0px');

  await fold('links');
  await expect(links).toHaveClass(/jp-mod-collapsed/);
  await expect(links).toHaveCSS('border-bottom-width', '1px');
  await expect(links).toHaveCSS(
    'border-bottom-color',
    await tokenColour(links, '--jp-layout-color3')
  );

  // The last section has nothing below it, so it takes no line.
  await fold('recent');
  await expect(proxy).toHaveClass(/jp-mod-collapsed/);
  await expect(proxy).toHaveCSS('border-bottom-width', '0px');
});

test('the count is meta text 6px after the label', async ({ page }) => {
  await openPanel(page);
  const count = section(page, 'links').locator(
    '.jp-BookmarksPanel-sectionCount'
  );
  const label = sectionLabel(page, 'links');
  await expect(count).toHaveCSS('margin-left', '6px');
  await expect(count).toHaveCSS('font-variant-numeric', 'tabular-nums');
  expect(await count.evaluate(node => getComputedStyle(node).color)).toBe(
    await tokenColour(count, '--jp-ui-font-color2')
  );
  expect(await label.evaluate(node => getComputedStyle(node).color)).toBe(
    await tokenColour(label, '--jp-ui-font-color1')
  );
  // The rendered gap: the label's text, not its flex box, ends 6px before the
  // count. A box-to-box subtraction stays 6px even when the label fills the band.
  const gap = await label.evaluate(node => {
    const text = document.createRange();
    text.selectNodeContents(node);
    const count = node.nextElementSibling as HTMLElement;
    return (
      count.getBoundingClientRect().left - text.getBoundingClientRect().right
    );
  });
  expect(Math.abs(gap - 6)).toBeLessThanOrEqual(1);
});

test('a section band is content-sized and its + button fits it', async ({
  page
}) => {
  await openPanel(page);
  const header = section(page, 'links').locator(
    '.jp-BookmarksPanel-sectionHeader'
  );
  const band = (await header.boundingBox())!;
  const lineBox = (await header
    .locator('.jp-BookmarksPanel-sectionLabel')
    .boundingBox())!;
  const plus = (await header.locator('.jp-BookmarksPanel-plus').boundingBox())!;
  // The toggle's 4px above and 4px below one label line: the label sets the height, not a child.
  expect(Math.abs(band.height - (lineBox.height + 8))).toBeLessThanOrEqual(1);
  expect(plus.height).toBeLessThanOrEqual(band.height);

  // The top bar keeps its 24px hit box.
  const top = page
    .locator('.jp-BookmarksPanel-header .jp-BookmarksPanel-iconButton')
    .first();
  expect((await top.boundingBox())!.height).toBe(24);
});

test.describe('no reserved scrollbar gutter', () => {
  test.use({
    mockSettings: mockBookmarks({
      links: [{ kind: 'link', id: 'a', name: 'A', url: 'https://example.com/' }]
    })
  });

  test('a row surface reaches the panel edge', async ({ page }) => {
    await openPanel(page);
    const body = section(page, 'links').locator(
      '.jp-BookmarksPanel-sectionBody'
    );
    expect(
      await body.evaluate(
        node => (getComputedStyle(node) as any).scrollbarGutter ?? ''
      )
    ).not.toContain('stable');
    const rowBox = (await row(page, 'A').boundingBox())!;
    const bodyBox = (await body.boundingBox())!;
    expect(
      Math.abs(rowBox.x + rowBox.width - (bodyBox.x + bodyBox.width))
    ).toBeLessThanOrEqual(1);
  });

  test("the current tab's tint reaches the panel edge", async ({
    page,
    baseURL,
    tmpPath
  }) => {
    await page.contents.uploadContent(
      '<html><head><title>Page</title></head><body>Page</body></html>',
      'text',
      `${tmpPath}/page.html`
    );
    await page.evaluate(
      async ({ url, text }) => {
        await (window as any).jupyterapp.commands.execute('help:open', {
          url,
          text
        });
      },
      { url: `${baseURL}/files/${tmpPath}/page.html`, text: 'Page' }
    );
    await expect(page.activity.getTabLocator('Page')).toBeVisible();
    await openPanel(page);
    await contextMenu(
      page,
      page.activity.getTabLocator('Page'),
      'Add Tab to Bookmarks'
    );

    const current = row(page, 'Page');
    await expect(current).toHaveClass(/jp-mod-current/);
    const rowBox = await settledBox(current);
    const panelBox = await settledBox(page.locator(`#${PANEL_ID}`));
    expect(
      Math.abs(rowBox.x + rowBox.width - (panelBox.x + panelBox.width))
    ).toBeLessThanOrEqual(1);
  });

  test.describe('a section taller than its box', () => {
    test.use({
      mockSettings: mockBookmarks({
        links: Array.from({ length: 12 }, (_, index) => ({
          kind: 'link',
          id: `link-${index}`,
          name: `Link ${index}`,
          url: `https://example.com/${index}`
        }))
      })
    });

    test('shows its scrollbar at the panel edge', async ({ page }) => {
      await openPanel(page);
      const body = section(page, 'links').locator(
        '.jp-BookmarksPanel-sectionBody'
      );
      // Playwright's headless Chromium launches with --hide-scrollbars, so a
      // scrollbar's width is 0 here; the body is the scroller when it overflows.
      expect(
        await body.evaluate(node => node.scrollHeight > node.clientHeight)
      ).toBe(true);
      const bodyBox = (await body.boundingBox())!;
      const panelBox = (await page.locator(`#${PANEL_ID}`).boundingBox())!;
      expect(
        Math.abs(bodyBox.x + bodyBox.width - (panelBox.x + panelBox.width))
      ).toBeLessThanOrEqual(1);
    });
  });
});

test('a row shows the time since its tab was last present', async ({
  page,
  baseURL,
  tmpPath
}) => {
  // The 30 s tick updates the age at most once more than a tick away.
  test.setTimeout(120_000);
  await page.contents.uploadContent(
    '<html><head><title>Page</title></head><body>Page</body></html>',
    'text',
    `${tmpPath}/page.html`
  );
  await page.evaluate(
    async ({ url, text }) => {
      await (window as any).jupyterapp.commands.execute('help:open', {
        url,
        text
      });
    },
    { url: `${baseURL}/files/${tmpPath}/page.html`, text: 'Page' }
  );
  await expect(page.activity.getTabLocator('Page')).toBeVisible();
  await openPanel(page);
  await contextMenu(
    page,
    page.activity.getTabLocator('Page'),
    'Add Tab to Bookmarks'
  );

  const shown = row(page, 'Page');
  await expect(shown.locator('.jp-BookmarksPanel-rowMark')).toBeVisible();
  await expect(shown.locator('.jp-BookmarksPanel-rowTime')).toHaveCount(0);

  await page.activity
    .getTabLocator('Page')
    .locator('.lm-TabBar-tabCloseIcon')
    .click();
  await expect(page.activity.getTabLocator('Page')).toHaveCount(0);
  await expect(shown.locator('.jp-BookmarksPanel-rowTime')).toHaveText('now');
  await expect(shown.locator('.jp-BookmarksPanel-rowMark')).toHaveCount(0);
  // The tick updates the age in place, so the row node must survive it; a
  // rebuild would drop this marker.
  await shown.evaluate(node => node.setAttribute('data-probe', 'kept'));

  // Fix Date past the minute and change nothing: only the panel's 30 s tick can
  // update the row, so this reads 'now' without the tick and '1m ago' with it.
  // setFixedTime keeps the lab's timers running; the next tick lands within 30 s.
  await page.clock.setFixedTime(Date.now() + 61 * 1000);
  await expect(shown.locator('.jp-BookmarksPanel-rowTime')).toHaveText(
    '1m ago',
    { timeout: 45_000 }
  );
  await expect(shown).toHaveAttribute('aria-label', 'Page, 1m ago');
  await expect(shown).toHaveAttribute('data-probe', 'kept');
});

test.describe('row hover', () => {
  test.use({
    mockSettings: mockBookmarks({
      links: [{ kind: 'link', id: 'a', name: 'A', url: 'https://example.com/' }]
    })
  });

  test('takes one fill above the band and leaves the current tint', async ({
    page,
    baseURL,
    tmpPath
  }) => {
    await page.contents.uploadContent(
      '<html><head><title>Page</title></head><body>Page</body></html>',
      'text',
      `${tmpPath}/page.html`
    );
    await page.evaluate(
      async ({ url, text }) => {
        await (window as any).jupyterapp.commands.execute('help:open', {
          url,
          text
        });
      },
      { url: `${baseURL}/files/${tmpPath}/page.html`, text: 'Page' }
    );
    await expect(page.activity.getTabLocator('Page')).toBeVisible();
    await openPanel(page);
    await contextMenu(
      page,
      page.activity.getTabLocator('Page'),
      'Add Tab to Bookmarks'
    );

    const other = row(page, 'A');
    await other.hover();
    expect(
      await other.evaluate(node => getComputedStyle(node).backgroundColor)
    ).toBe(await tokenColour(other, '--jp-layout-color3'));

    const current = row(page, 'Page');
    await expect(current).toHaveClass(/jp-mod-current/);
    const tint = await current.evaluate(
      node => getComputedStyle(node).backgroundColor
    );
    await current.hover();
    expect(
      await current.evaluate(node => getComputedStyle(node).backgroundColor)
    ).toBe(tint);
    expect(tint).not.toBe(await tokenColour(current, '--jp-layout-color3'));
  });
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
      'LINKS',
      'FILES',
      'SESSIONS',
      'Proxy'
    ]);
    await expect(page.locator('.jp-BookmarksPanel-sectionCount')).toHaveText([
      '(1)',
      '(0)',
      '(0)',
      '(0)'
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
      'LINKS',
      'FILES',
      'SESSIONS',
      'Proxy'
    ]);
    await expect(page.locator('.jp-BookmarksPanel-sectionCount')).toHaveText([
      '(3)',
      '(1)',
      '(1)',
      '(0)'
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
    await expect(sectionLabel(page, 'links')).toHaveText('LINKS');

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
    await expect(sectionLabel(page, 'files')).toHaveText('FILES');
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
    await expect(sectionLabel(page, 'files')).toHaveText('FILES');
    await expect(page.locator(`#${PANEL_ID}`)).toHaveAttribute(
      'data-mark',
      'red'
    );
  });
});
