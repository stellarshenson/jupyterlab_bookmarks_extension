import { expect } from '@jupyterlab/galata';
import {
  contextMenu,
  mockBookmarks,
  openPanel,
  plusButton,
  plusMenu,
  row,
  section,
  sectionLabel,
  test
} from './helpers';

// A 1x1 red PNG, the favicon of page.html.
const RED_PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC';

const session = (id: string, name: string, command: string) => ({
  kind: 'session',
  id,
  name,
  cwd: '/tmp',
  command,
  env: {}
});

/** Each section: a root folder and a root bookmark; Apps also holds the nested folder Nested. */
const TREE = mockBookmarks({
  links: [
    {
      kind: 'folder',
      id: 'apps',
      name: 'Apps',
      children: [
        { kind: 'link', id: 'mlflow', name: 'MLflow', url: 'mlflow/' },
        { kind: 'folder', id: 'nested', name: 'Nested', children: [] }
      ]
    },
    {
      kind: 'link',
      id: 'docs',
      name: 'Docs',
      url: 'https://example.com/docs/'
    }
  ],
  files: [
    {
      kind: 'folder',
      id: 'notes',
      name: 'Notes',
      children: [{ kind: 'file', id: 'a', name: 'a.txt', path: 'notes/a.txt' }]
    },
    { kind: 'file', id: 'b', name: 'b.txt', path: 'b.txt' }
  ],
  sessions: [
    {
      kind: 'folder',
      id: 'servers',
      name: 'Servers',
      children: [
        session('sleep', 'sleep - tmp', 'sleep 300'),
        session('http', 'python3 - tmp', 'python3 -m http.server')
      ]
    },
    session('shell', 'shell - tmp', '')
  ]
});

const ALL_ROWS = [
  'Apps',
  'MLflow',
  'Nested',
  'Docs',
  'Notes',
  'a.txt',
  'b.txt',
  'Servers',
  'sleep - tmp',
  'python3 - tmp',
  'shell - tmp'
];

test.describe('tree', () => {
  test.use({ mockSettings: TREE });

  test.beforeEach(async ({ page }) => {
    await openPanel(page);
  });

  test('tree starts expanded', async ({ page }) => {
    for (const key of ['links', 'files', 'sessions'] as const) {
      await expect(
        section(page, key).locator('.jp-BookmarksPanel-sectionToggle')
      ).toHaveAttribute('aria-expanded', 'true');
    }
    for (const name of ALL_ROWS) {
      await expect(row(page, name)).toBeVisible();
    }
  });

  test('folder folds and unfolds', async ({ page }) => {
    await row(page, 'Apps').click();
    await expect(row(page, 'MLflow')).toBeHidden();
    await expect(row(page, 'Nested')).toBeHidden();
    await expect(row(page, 'Apps')).toHaveAttribute('aria-expanded', 'false');
    await expect(row(page, 'Docs')).toBeVisible();

    await row(page, 'Apps').click();
    await expect(row(page, 'MLflow')).toBeVisible();
    await expect(row(page, 'Nested')).toBeVisible();
    await expect(row(page, 'Apps')).toHaveAttribute('aria-expanded', 'true');
  });

  test('fold state persists across a reload', async ({ page }) => {
    await row(page, 'Apps').click();
    await expect(row(page, 'MLflow')).toBeHidden();

    await page.reload();
    await openPanel(page);
    await expect(row(page, 'Apps')).toBeVisible();
    await expect(row(page, 'Apps')).toHaveAttribute('aria-expanded', 'false');
    await expect(row(page, 'MLflow')).toBeHidden();
    await expect(row(page, 'a.txt')).toBeVisible();
  });

  test('section header folds and unfolds the section', async ({ page }) => {
    const links = section(page, 'links');
    const toggle = links.locator('.jp-BookmarksPanel-sectionToggle');
    const body = links.locator('.jp-BookmarksPanel-sectionBody');

    await toggle.click();
    await expect(body).toBeHidden();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(row(page, 'Docs')).toBeHidden();
    // The count stays visible while the section is folded.
    await expect(sectionLabel(page, 'links')).toHaveText('LINKS (2)');

    await toggle.click();
    await expect(body).toBeVisible();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(row(page, 'Docs')).toBeVisible();
  });

  test('new folder in each section', async ({ page }) => {
    for (const [key, title] of [
      ['links', 'Links'],
      ['files', 'Files'],
      ['sessions', 'Sessions']
    ] as const) {
      // The + button opens a menu of two items below it.
      await plusButton(page, title).click();
      await expect(plusButton(page, title)).toHaveAttribute(
        'aria-expanded',
        'true'
      );
      await expect(page.locator('.lm-Menu .lm-Menu-itemLabel')).toHaveText([
        'New Bookmark...',
        'New Folder'
      ]);
      await page.getByRole('menuitem', { name: 'New Folder' }).click();
      const dialog = page.locator('.jp-Dialog');
      await dialog.locator('input').fill(`${title} folder`);
      await dialog.locator('.jp-mod-accept').click();
      await expect(dialog).toHaveCount(0);

      const folder = section(page, key).locator('.jp-BookmarksPanel-folder', {
        hasText: `${title} folder`
      });
      await expect(folder).toBeVisible();
      await expect(folder).toHaveAttribute('aria-level', '1');
    }
  });

  test('new bookmark in Links and Files', async ({
    page,
    baseURL,
    tmpPath
  }) => {
    const url = `${baseURL}/files/${tmpPath}/page.html`;
    await page.contents.uploadContent(
      '<html><head><title>Page</title><link rel="icon" href="red.png"></head><body>page</body></html>',
      'text',
      `${tmpPath}/page.html`
    );
    await page.contents.uploadContent(RED_PNG, 'base64', `${tmpPath}/red.png`);
    const dialog = page.locator('.jp-Dialog');
    const save = dialog.locator('.jp-mod-accept');

    // Links: the edit dialog with empty fields; Save adds the link at the root and fetches its icon.
    await plusMenu(page, 'Links', 'New Bookmark...');
    await expect(dialog.locator('.jp-Dialog-header')).toHaveText(
      'New Bookmark'
    );
    await expect(dialog.getByLabel('Name')).toHaveValue('');
    await expect(dialog.getByLabel('URL')).toHaveValue('');
    await expect(save).toBeDisabled();
    await dialog.getByLabel('Name').fill('Typed page');
    await dialog.getByLabel('URL').fill(url);
    await save.click();
    await expect(dialog).toHaveCount(0);
    const link = row(page, 'Typed page');
    await expect(link).toHaveAttribute('aria-level', '1');
    await expect(sectionLabel(page, 'links')).toHaveText('LINKS (3)');
    await expect(link.locator('img.jp-BookmarksPanel-rowIcon')).toHaveAttribute(
      'src',
      `data:image/png;base64,${RED_PNG}`
    );
    await link.click();
    await expect(page.locator('#jp-main-dock-panel iframe')).toHaveAttribute(
      'src',
      url
    );

    // Files: a location that names no file yet is marked missing; once the file exists a click opens it.
    const path = `${tmpPath}/typed.txt`;
    await plusMenu(page, 'Files', 'New Bookmark...');
    await expect(dialog.getByLabel('Name')).toHaveValue('');
    await expect(dialog.getByLabel('Location')).toHaveValue('');
    await dialog.getByLabel('Location').fill(path);
    await dialog.getByRole('button', { name: 'Reset Name' }).click();
    await expect(dialog.getByLabel('Name')).toHaveValue('typed.txt');
    await save.click();
    await expect(dialog).toHaveCount(0);
    const file = row(page, 'typed.txt');
    await expect(file).toHaveAttribute('aria-level', '1');
    await expect(file).toHaveClass(/jp-mod-missing/);
    await expect(file).toHaveAttribute('title', `File not found: ${path}`);
    await page.contents.uploadContent('typed', 'text', path);
    await file.click();
    await expect(page.activity.getTabLocator('typed.txt')).toBeVisible();
    await expect(file).not.toHaveClass(/jp-mod-missing/);
  });

  test('edit moves a bookmark into a folder', async ({ page }) => {
    await expect(row(page, 'b.txt')).toHaveAttribute('aria-level', '1');
    await contextMenu(page, row(page, 'b.txt'), 'Edit Bookmark...');
    const dialog = page.locator('.jp-Dialog');
    await dialog.getByLabel('Folder').selectOption({ label: 'Notes' });
    await dialog.locator('.jp-mod-accept').click();
    await expect(dialog).toHaveCount(0);

    await expect(row(page, 'b.txt')).toHaveAttribute('aria-level', '2');
    await row(page, 'Notes').click();
    await expect(row(page, 'b.txt')).toBeHidden();
    await expect(row(page, 'a.txt')).toBeHidden();
  });

  test('edit moves a bookmark back to the section root', async ({ page }) => {
    await expect(row(page, 'a.txt')).toHaveAttribute('aria-level', '2');
    await contextMenu(page, row(page, 'a.txt'), 'Edit Bookmark...');
    const dialog = page.locator('.jp-Dialog');
    const folder = dialog.getByLabel('Folder');
    await expect(folder).toHaveValue('notes');
    await folder.selectOption({ label: 'None' });
    await dialog.locator('.jp-mod-accept').click();
    await expect(dialog).toHaveCount(0);

    await expect(row(page, 'a.txt')).toHaveAttribute('aria-level', '1');
    await row(page, 'Notes').click();
    await expect(row(page, 'a.txt')).toBeVisible();
  });

  test('folder field lists only root folders', async ({ page }) => {
    await contextMenu(page, row(page, 'Docs'), 'Edit Bookmark...');
    const options = page
      .locator('.jp-Dialog')
      .getByLabel('Folder')
      .locator('option');
    // Not Nested (inside Apps), not Notes (a Files folder).
    await expect(options).toHaveText(['None', 'Apps']);
    await page.locator('.jp-Dialog .jp-mod-reject').click();
  });

  test('rename folder', async ({ page }) => {
    await contextMenu(page, row(page, 'Notes'), 'Rename Folder...');
    const dialog = page.locator('.jp-Dialog');
    await expect(dialog.locator('input')).toHaveValue('Notes');
    await dialog.locator('input').fill('Journal');
    await dialog.locator('.jp-mod-accept').click();

    await expect(row(page, 'Journal')).toBeVisible();
    await expect(row(page, 'Journal')).toHaveClass(/jp-BookmarksPanel-folder/);
    await expect(row(page, 'Notes')).toBeHidden();
    await expect(row(page, 'a.txt')).toHaveAttribute('aria-level', '2');
  });

  test('delete folder removes its bookmarks after confirmation', async ({
    page
  }) => {
    await expect(sectionLabel(page, 'sessions')).toHaveText('SESSIONS (3)');
    await contextMenu(page, row(page, 'Servers'), 'Delete Folder');
    const dialog = page.locator('.jp-Dialog');
    await expect(dialog).toContainText('2 bookmarks');
    await dialog.getByRole('button', { name: 'Delete' }).click();

    await expect(row(page, 'Servers')).toBeHidden();
    await expect(row(page, 'sleep - tmp')).toBeHidden();
    await expect(row(page, 'python3 - tmp')).toBeHidden();
    await expect(row(page, 'shell - tmp')).toBeVisible();
    await expect(sectionLabel(page, 'sessions')).toHaveText('SESSIONS (1)');
  });

  test('cancelled delete keeps the folder', async ({ page }) => {
    await contextMenu(page, row(page, 'Servers'), 'Delete Folder');
    const dialog = page.locator('.jp-Dialog');
    await expect(dialog).toContainText('2 bookmarks');
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog).toHaveCount(0);

    for (const name of ['Servers', 'sleep - tmp', 'python3 - tmp']) {
      await expect(row(page, name)).toBeVisible();
    }
    await expect(sectionLabel(page, 'sessions')).toHaveText('SESSIONS (3)');
  });

  test('row context menu removes a bookmark', async ({ page }) => {
    for (const [key, name, before, after] of [
      ['links', 'Docs', 'LINKS (2)', 'LINKS (1)'],
      ['files', 'b.txt', 'FILES (2)', 'FILES (1)'],
      ['sessions', 'shell - tmp', 'SESSIONS (3)', 'SESSIONS (2)']
    ] as const) {
      await expect(sectionLabel(page, key)).toHaveText(before);
      await contextMenu(page, row(page, name), 'Remove Bookmark');
      await expect(row(page, name)).toBeHidden();
      await expect(sectionLabel(page, key)).toHaveText(after);
    }
  });
});

test.describe('keyboard', () => {
  test.use({
    autoGoto: false,
    mockSettings: async ({ tmpPath }, use) => {
      const file = (id: string) => ({
        kind: 'file',
        id,
        name: `${id}.txt`,
        path: `${tmpPath}/${id}.txt`
      });
      await use(
        mockBookmarks({
          files: [
            file('a'),
            file('b'),
            { kind: 'folder', id: 'f', name: 'Notes', children: [file('c')] }
          ]
        })
      );
    }
  });

  test('keyboard opens a bookmark and folds a folder', async ({
    page,
    tmpPath
  }) => {
    for (const id of ['a', 'b', 'c']) {
      await page.contents.uploadContent(id, 'text', `${tmpPath}/${id}.txt`);
    }
    await page.goto();
    await openPanel(page);
    const plus = plusButton(page, 'Files');

    // The Files rows are one tab stop after the header's + button.
    await plus.focus();
    await page.keyboard.press('Tab');
    await expect(row(page, 'a.txt')).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(row(page, 'b.txt')).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.activity.getTabLocator('b.txt')).toBeVisible();
    await expect(page.activity.getTabLocator('a.txt')).toHaveCount(0);

    // Back in the panel, the tab stop is the row last focused.
    await plus.focus();
    await page.keyboard.press('Tab');
    await expect(row(page, 'b.txt')).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(row(page, 'Notes')).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(row(page, 'c.txt')).toBeHidden();
    await expect(row(page, 'Notes')).toHaveAttribute('aria-expanded', 'false');
  });
});
