import { Contents } from '@jupyterlab/services';
import { isFileMissing } from '../file/file_status';
import { fileName } from '../model/names';
import { BookmarkStore } from '../model/store';
import { IFileBookmark } from '../model/types';
import {
  dialogTitle,
  folderChoice,
  folderSelect,
  saveEdit
} from './folder_select';
import { editButtons, formBody, showEditDialog, textInput } from './form';

/** Edit a file bookmark's name, location and folder; a banner shows while the location names no file. */
export async function editFile(
  store: BookmarkStore,
  bookmark: IFileBookmark,
  contents: Contents.IManager
): Promise<void> {
  const name = textInput(bookmark.name, true);
  const location = textInput(bookmark.path, true);
  const reset = document.createElement('button');
  // type="button": a footer button would resolve the dialog.
  reset.type = 'button';
  reset.className = 'jp-BookmarksPanel-resetName';
  reset.textContent = 'Reset Name';
  reset.addEventListener('click', () => {
    name.value = fileName(location.value.trim());
    name.dispatchEvent(new Event('input', { bubbles: true }));
  });
  const folder = folderSelect(store.bookmarks.files, bookmark.id);
  const initial = folder.value;
  const banner = document.createElement('div');
  banner.className = 'jp-BookmarksPanel-banner';
  banner.setAttribute('role', 'status');
  banner.textContent = 'File not found';
  banner.hidden = true;
  const check = (): void => {
    const path = location.value.trim();
    void isFileMissing(contents, path).then(missing => {
      // An answer for a location the user has since changed is dropped.
      if (location.value.trim() === path) {
        banner.hidden = !missing;
      }
    });
  };
  location.addEventListener('change', check);
  check();

  const result = await showEditDialog({
    title: dialogTitle(store.bookmarks.files, bookmark.id),
    body: formBody(
      [
        ['Name', name, reset],
        ['Location', location],
        ['Folder', folder]
      ],
      banner
    ),
    buttons: editButtons(),
    focusNodeSelector: 'input'
  });
  if (!result.button.accept) {
    return;
  }
  await saveEdit(
    store,
    'files',
    {
      kind: 'file',
      id: bookmark.id,
      name: name.value.trim(),
      path: location.value.trim().replace(/^\/+/, '')
    },
    folderChoice(folder, initial)
  );
}
