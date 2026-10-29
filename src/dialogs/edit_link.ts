import { ServerConnection } from '@jupyterlab/services';
import { TranslationBundle } from '@jupyterlab/translation';
import { storeFavicon } from '../link/favicon';
import { toAbsoluteUrl, toStoredUrl } from '../link/link_url';
import { BookmarkStore } from '../model/store';
import { ILink } from '../model/types';
import {
  dialogTitle,
  folderChoice,
  folderSelect,
  saveEdit
} from './folder_select';
import { editButtons, formBody, showEditDialog, textInput } from './form';

/** Edit a link's name, URL and folder; a changed URL drops the old favicon and fetches the new page's. */
export async function editLink(
  store: BookmarkStore,
  link: ILink,
  settings: ServerConnection.ISettings,
  trans: TranslationBundle
): Promise<void> {
  const { baseUrl } = settings;
  const name = textInput(link.name, true);
  // A new link's empty URL stays empty, not the lab base URL.
  const url = textInput(link.url && toAbsoluteUrl(link.url, baseUrl), true);
  const folder = folderSelect(store.bookmarks.links, link.id);
  const initial = folder.value;
  const result = await showEditDialog({
    title: dialogTitle(store.bookmarks.links, link.id),
    body: formBody([
      ['Name', name],
      ['URL', url],
      ['Folder', folder]
    ]),
    buttons: editButtons(trans),
    focusNodeSelector: 'input'
  });
  if (!result.button.accept) {
    return;
  }
  const stored = toStoredUrl(url.value.trim(), baseUrl);
  const next: ILink = {
    kind: 'link',
    id: link.id,
    name: name.value.trim(),
    url: stored
  };
  if (stored === link.url && link.icon) {
    next.icon = link.icon;
  }
  await saveEdit(store, 'links', next, folderChoice(folder, initial));
  if (stored !== link.url) {
    await storeFavicon(store, next, settings);
  }
}
