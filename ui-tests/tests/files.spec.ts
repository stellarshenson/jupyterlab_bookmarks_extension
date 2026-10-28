import { expect, IJupyterLabPageFixture } from '@jupyterlab/galata';
import {
  contextMenu,
  layoutSaved,
  mockBookmarks,
  openPanel,
  row,
  sectionLabel,
  test
} from './helpers';

test.use({ mockSettings: mockBookmarks() });

// A saved notebook with one cell and a named kernelspec opens without a kernel dialog and stays clean.
const NOTEBOOK = JSON.stringify({
  cells: [{ cell_type: 'markdown', id: 'c1', metadata: {}, source: ['note'] }],
  metadata: {
    kernelspec: {
      display_name: 'Python 3',
      language: 'python',
      name: 'python3'
    }
  },
  nbformat: 4,
  nbformat_minor: 5
});

const TOGGLE_ITEM =
  '.lm-Menu-item[data-command="jupyterlab_bookmarks_extension:toggle-tab"]';

const basename = (path: string) => path.split('/').pop()!;

const tab = (page: IJupyterLabPageFixture, path: string) =>
  page.activity.getTabLocator(basename(path));

const dialog = (page: IJupyterLabPageFixture) => page.locator('.jp-Dialog');

/** Opens the file from the file browser, adds its tab through the tab menu and opens the panel. */
async function addFileTab(
  page: IJupyterLabPageFixture,
  path: string
): Promise<void> {
  // The file browser lists the file only while its side-bar tab is open.
  await page.sidebar.openTab('filebrowser');
  await page.filebrowser.open(path);
  await contextMenu(page, tab(page, path), 'Add Tab to Bookmarks');
  await openPanel(page);
  await expect(row(page, basename(path))).toBeVisible();
}

async function closeTab(
  page: IJupyterLabPageFixture,
  path: string
): Promise<void> {
  await tab(page, path).locator('.lm-TabBar-tabCloseIcon').click();
  await expect(tab(page, path)).toHaveCount(0);
}

/** Edit Bookmark... on the row; returns the dialog. */
async function openEdit(page: IJupyterLabPageFixture, name: string) {
  await contextMenu(page, row(page, name), 'Edit Bookmark...');
  await expect(dialog(page)).toBeVisible();
  return dialog(page);
}

/** Edit Bookmark..., the given field values, Save. */
async function saveEdit(
  page: IJupyterLabPageFixture,
  name: string,
  fields: Record<string, string>
): Promise<void> {
  const edit = await openEdit(page, name);
  for (const [label, value] of Object.entries(fields)) {
    await edit.getByLabel(label, { exact: true }).fill(value);
  }
  await edit.locator('.jp-mod-accept').click();
  await expect(dialog(page)).toHaveCount(0);
}

test('tab menu adds a file', async ({ page, tmpPath }) => {
  const path = `${tmpPath}/a.ipynb`;
  await page.contents.uploadContent(NOTEBOOK, 'text', path);
  await page.filebrowser.open(path);
  await openPanel(page);
  await expect(sectionLabel(page, 'files')).toHaveText('FILES (0)');

  await contextMenu(page, tab(page, path), 'Add Tab to Bookmarks');
  await expect(sectionLabel(page, 'files')).toHaveText('FILES (1)');
  await expect(
    page.locator(
      '.jp-BookmarksPanel-section[data-section="files"] .jp-BookmarksPanel-rowText'
    )
  ).toHaveText(['a.ipynb']);
});

test('bookmarked file tab offers remove', async ({ page, tmpPath }) => {
  const path = `${tmpPath}/a.ipynb`;
  await page.contents.uploadContent(NOTEBOOK, 'text', path);
  await page.filebrowser.open(path);
  const item = page.locator(`${TOGGLE_ITEM} .lm-Menu-itemLabel`);
  await tab(page, path).click({ button: 'right' });
  await expect(item).toHaveText('Add Tab to Bookmarks');
  await item.click();

  await openPanel(page);
  await expect(sectionLabel(page, 'files')).toHaveText('FILES (1)');
  await tab(page, path).click({ button: 'right' });
  await expect(item).toBeVisible();
  await expect(item).toHaveText('Remove Tab from Bookmarks');
  await page.keyboard.press('Escape');
});

test('tab menu removes a file', async ({ page, tmpPath }) => {
  const path = `${tmpPath}/a.ipynb`;
  await page.contents.uploadContent(NOTEBOOK, 'text', path);
  await addFileTab(page, path);
  await expect(sectionLabel(page, 'files')).toHaveText('FILES (1)');

  await contextMenu(page, tab(page, path), 'Remove Tab from Bookmarks');
  await expect(sectionLabel(page, 'files')).toHaveText('FILES (0)');
  await expect(row(page, 'a.ipynb')).toHaveCount(0);
});

test('row shows the file-type icon', async ({ page, tmpPath }) => {
  await page.contents.uploadContent(NOTEBOOK, 'text', `${tmpPath}/a.ipynb`);
  await page.contents.uploadContent('data', 'text', `${tmpPath}/b.xyz`);
  await addFileTab(page, `${tmpPath}/a.ipynb`);
  await addFileTab(page, `${tmpPath}/b.xyz`);

  const icon = (name: string) =>
    row(page, name).locator('.jp-BookmarksPanel-rowIcon svg');
  await expect(icon('a.ipynb')).toHaveAttribute(
    'data-icon',
    'ui-components:notebook'
  );
  await expect(icon('b.xyz')).toHaveAttribute(
    'data-icon',
    'ui-components:file'
  );
});

test('location is relative to the server root', async ({ page, tmpPath }) => {
  const path = `${tmpPath}/dir/a.ipynb`;
  await page.contents.uploadContent(NOTEBOOK, 'text', path);
  await addFileTab(page, path);

  const edit = await openEdit(page, 'a.ipynb');
  // tmpPath is the test folder under the server root, so `path` has no leading slash.
  await expect(edit.getByLabel('Location')).toHaveValue(path);
  await edit.locator('.jp-mod-reject').click();
  await expect(dialog(page)).toHaveCount(0);
});

test('click opens the file', async ({ page, tmpPath }) => {
  const path = `${tmpPath}/note.txt`;
  await page.contents.uploadContent('note', 'text', path);
  await addFileTab(page, path);
  await closeTab(page, path);

  await row(page, 'note.txt').click();
  await expect(tab(page, path)).toHaveClass(/jp-mod-current/);
  await page.activity.activateTab('Launcher');
  await expect(tab(page, path)).not.toHaveClass(/jp-mod-current/);

  await row(page, 'note.txt').click();
  await expect(tab(page, path)).toHaveClass(/jp-mod-current/);
  await expect(tab(page, path)).toHaveCount(1);
});

test('added bookmark of a deleted file is marked missing', async ({
  page,
  tmpPath
}) => {
  const path = `${tmpPath}/note.txt`;
  await page.contents.uploadContent('note', 'text', path);
  // A delete before the document's first checkpoint fails the open and closes the tab.
  const checkpoint = page.waitForResponse(
    response =>
      response.request().method() === 'POST' &&
      new URL(response.url()).pathname.endsWith('/note.txt/checkpoints')
  );
  await page.filebrowser.open(path);
  expect((await checkpoint).ok()).toBe(true);
  expect(await page.contents.deleteFile(path)).toBe(true);

  await contextMenu(page, tab(page, path), 'Add Tab to Bookmarks');
  await openPanel(page);
  await expect(row(page, 'note.txt')).toHaveClass(/jp-mod-missing/);
  await expect(row(page, 'note.txt')).toHaveAttribute(
    'title',
    `File not found: ${path}`
  );
});

test('deleted file is marked missing', async ({ page, tmpPath }) => {
  const path = `${tmpPath}/note.txt`;
  await page.contents.uploadContent('note', 'text', path);
  await addFileTab(page, path);
  await closeTab(page, path);
  await layoutSaved(page);
  await expect(row(page, 'note.txt')).not.toHaveClass(/jp-mod-missing/);
  expect(await page.contents.deleteFile(path)).toBe(true);

  await page.reload();
  await openPanel(page);
  await expect(row(page, 'note.txt')).toHaveClass(/jp-mod-missing/);
  await expect(row(page, 'note.txt')).toHaveAttribute(
    'title',
    `File not found: ${path}`
  );
});

test('missing location shows the banner', async ({ page, tmpPath }) => {
  const path = `${tmpPath}/note.txt`;
  await page.contents.uploadContent('note', 'text', path);
  await addFileTab(page, path);

  const edit = await openEdit(page, 'note.txt');
  const banner = edit.locator('.jp-BookmarksPanel-banner');
  const location = edit.getByLabel('Location');
  await expect(banner).toBeHidden();
  // The banner follows the input's change event, which Tab fires.
  await location.fill(`${tmpPath}/missing.txt`);
  await location.press('Tab');
  await expect(banner).toBeVisible();
  await expect(banner).toHaveAttribute('role', 'status');
  await expect(banner).toHaveText('File not found');

  await location.fill(path);
  await location.press('Tab');
  await expect(banner).toBeHidden();
  await edit.locator('.jp-mod-reject').click();
  await expect(dialog(page)).toHaveCount(0);
});

test('location change updates the missing mark', async ({ page, tmpPath }) => {
  const path = `${tmpPath}/note.txt`;
  await page.contents.uploadContent('note', 'text', path);
  await addFileTab(page, path);
  await expect(row(page, 'note.txt')).not.toHaveClass(/jp-mod-missing/);

  await saveEdit(page, 'note.txt', { Location: `${tmpPath}/missing.txt` });
  await expect(row(page, 'note.txt')).toHaveClass(/jp-mod-missing/);

  await saveEdit(page, 'note.txt', { Location: path });
  await expect(row(page, 'note.txt')).not.toHaveClass(/jp-mod-missing/);
  await expect(row(page, 'note.txt')).toHaveAttribute('title', path);
});

test('edit changes the file bookmark name', async ({ page, tmpPath }) => {
  const path = `${tmpPath}/note.txt`;
  await page.contents.uploadContent('note', 'text', path);
  await addFileTab(page, path);

  await saveEdit(page, 'note.txt', { Name: 'My notes' });
  await expect(row(page, 'My notes')).toBeVisible();
  await expect(row(page, 'note.txt')).toHaveCount(0);
  await expect(sectionLabel(page, 'files')).toHaveText('FILES (1)');
});

test('reset name restores the file name', async ({ page, tmpPath }) => {
  const path = `${tmpPath}/note.txt`;
  await page.contents.uploadContent('note', 'text', path);
  await addFileTab(page, path);
  await saveEdit(page, 'note.txt', { Name: 'My notes' });
  await expect(row(page, 'My notes')).toBeVisible();

  const edit = await openEdit(page, 'My notes');
  await edit.getByRole('button', { name: 'Reset Name' }).click();
  await expect(edit.getByLabel('Name', { exact: true })).toHaveValue(
    'note.txt'
  );
  // Reset Name is a body button; the dialog stays open until Save.
  await expect(dialog(page)).toBeVisible();
  await edit.locator('.jp-mod-accept').click();
  await expect(dialog(page)).toHaveCount(0);
  await expect(row(page, 'note.txt')).toBeVisible();
  await expect(row(page, 'My notes')).toHaveCount(0);
});

test('empty location disables Save', async ({ page, tmpPath }) => {
  const path = `${tmpPath}/note.txt`;
  await page.contents.uploadContent('note', 'text', path);
  await addFileTab(page, path);

  const edit = await openEdit(page, 'note.txt');
  const save = edit.locator('.jp-mod-accept');
  await expect(save).toBeEnabled();
  await edit.getByLabel('Location').fill('');
  await expect(save).toBeDisabled();
  await edit.getByLabel('Location').fill(path);
  await expect(save).toBeEnabled();
  await edit.locator('.jp-mod-reject').click();
  await expect(dialog(page)).toHaveCount(0);
});

test('click on a missing file opens no tab', async ({ page, tmpPath }) => {
  const path = `${tmpPath}/note.txt`;
  await page.contents.uploadContent('note', 'text', path);
  await addFileTab(page, path);
  await closeTab(page, path);
  expect(await page.contents.deleteFile(path)).toBe(true);

  await row(page, 'note.txt').click();
  await expect(dialog(page)).toContainText(`File not found: ${path}`);
  await dialog(page).getByRole('button', { name: 'Close' }).click();
  await expect(dialog(page)).toHaveCount(0);
  await expect(tab(page, path)).toHaveCount(0);
  await expect(row(page, 'note.txt')).toHaveClass(/jp-mod-missing/);

  await page.contents.uploadContent('note', 'text', path);
  await row(page, 'note.txt').click();
  await expect(tab(page, path)).toHaveClass(/jp-mod-current/);
  await expect(row(page, 'note.txt')).not.toHaveClass(/jp-mod-missing/);
});
