import { JupyterFrontEnd } from '@jupyterlab/application';
import { Dialog, InputDialog, showDialog } from '@jupyterlab/apputils';
import { UUID } from '@lumino/coreutils';
import { editFile } from './dialogs/edit_file';
import { editLink } from './dialogs/edit_link';
import { editSession } from './dialogs/edit_session';
import { storeFavicon } from './link/favicon';
import { toStoredUrl } from './link/link_url';
import { BookmarkStore } from './model/store';
import {
  addNode,
  countBookmarks,
  findNode,
  removeNodes,
  updateNode
} from './model/tree';
import { ILink, Node, SectionKey } from './model/types';
import { IRecentProxyEntry, RecentProxyStore } from './recent/recent';

export namespace CommandIds {
  export const toggleTab = 'jupyterlab_bookmarks_extension:toggle-tab';
  export const edit = 'jupyterlab_bookmarks_extension:edit';
  export const remove = 'jupyterlab_bookmarks_extension:remove';
  export const newBookmark = 'jupyterlab_bookmarks_extension:new-bookmark';
  export const newFolder = 'jupyterlab_bookmarks_extension:new-folder';
  export const renameFolder = 'jupyterlab_bookmarks_extension:rename-folder';
  export const deleteFolder = 'jupyterlab_bookmarks_extension:delete-folder';
  export const addRecent = 'jupyterlab_bookmarks_extension:add-recent';
  export const removeRecent = 'jupyterlab_bookmarks_extension:remove-recent';
}

const BOOKMARK_ROW =
  '.jp-BookmarksPanel-row:not(.jp-BookmarksPanel-folder):not(.jp-BookmarksPanel-recent)';
const FOLDER_ROW = '.jp-BookmarksPanel-folder';
const RECENT_ROW = '.jp-BookmarksPanel-recent';
const DANGER = 'jp-BookmarksContextMenu-danger';

/** A bookmark of the section's kind with empty fields, for New Bookmark... */
function blank(section: SectionKey): Node {
  const id = UUID.uuid4();
  switch (section) {
    case 'links':
      return { kind: 'link', id, name: '', url: '' };
    case 'files':
      return { kind: 'file', id, name: '', path: '' };
    case 'sessions':
      return { kind: 'session', id, name: '', cwd: '', command: '', env: {} };
  }
}

/** The panel's commands and the row context menu: Edit and Remove on bookmarks, Rename and Delete on folders, Add to Bookmarks and Remove from Recent on recent proxy pages. */
export function addCommands(
  app: JupyterFrontEnd,
  store: BookmarkStore,
  recent: RecentProxyStore
): void {
  const { commands, contextMenu } = app;

  /** The bookmark or folder whose row was right-clicked. */
  const target = (): { section: SectionKey; node: Node } | undefined => {
    const row = app.contextMenuHitTest(n =>
      n.classList.contains('jp-BookmarksPanel-row')
    );
    const section = row?.closest<HTMLElement>('[data-section]')?.dataset
      .section as SectionKey | undefined;
    if (!row || !section) {
      return undefined;
    }
    const hit = findNode(
      store.bookmarks[section],
      n => n.id === row.dataset.id
    );
    return hit && { section, node: hit.node };
  };

  /** The recent proxy page whose row was right-clicked. */
  const recentTarget = (): IRecentProxyEntry | undefined => {
    const row = app.contextMenuHitTest(n =>
      n.classList.contains('jp-BookmarksPanel-recent')
    );
    return recent.entries.find(entry => entry.url === row?.dataset.id);
  };

  const remove = (section: SectionKey, id: string): Promise<void> =>
    store.update(section, nodes => removeNodes(nodes, n => n.id === id));

  /** The edit dialog of the bookmark's kind; Save adds a bookmark the section does not hold yet. */
  const edit = async (node: Node): Promise<void> => {
    switch (node.kind) {
      case 'link':
        await editLink(store, node, app.serviceManager.serverSettings);
        break;
      case 'file':
        await editFile(store, node, app.serviceManager.contents);
        break;
      case 'session':
        await editSession(store, node);
        break;
    }
  };

  commands.addCommand(CommandIds.newBookmark, {
    label: 'New Bookmark...',
    execute: args => edit(blank(args.section as SectionKey))
  });

  commands.addCommand(CommandIds.newFolder, {
    label: 'New Folder',
    execute: async args => {
      const section = args.section as SectionKey;
      const result = await InputDialog.getText({
        title: 'New Folder',
        placeholder: 'Folder name'
      });
      const name = result.value?.trim();
      if (result.button.accept && name) {
        await store.update(section, nodes =>
          addNode(nodes, {
            kind: 'folder',
            id: UUID.uuid4(),
            name,
            children: []
          })
        );
      }
    }
  });

  commands.addCommand(CommandIds.renameFolder, {
    label: 'Rename Folder...',
    execute: async () => {
      const hit = target();
      if (!hit) {
        return;
      }
      const result = await InputDialog.getText({
        title: 'Rename Folder',
        text: hit.node.name
      });
      const name = result.value?.trim();
      if (result.button.accept && name) {
        await store.update(hit.section, nodes =>
          updateNode(nodes, hit.node.id, n => ({ ...n, name }))
        );
      }
    }
  });

  commands.addCommand(CommandIds.deleteFolder, {
    label: 'Delete Folder',
    className: DANGER,
    execute: async () => {
      const hit = target();
      if (hit?.node.kind !== 'folder') {
        return;
      }
      const count = countBookmarks(hit.node.children);
      const result = await showDialog({
        title: 'Delete Folder',
        body: `Delete the folder "${hit.node.name}" and the ${count} ${count === 1 ? 'bookmark' : 'bookmarks'} in it?`,
        buttons: [Dialog.cancelButton(), Dialog.warnButton({ label: 'Delete' })]
      });
      if (result.button.accept) {
        await remove(hit.section, hit.node.id);
      }
    }
  });

  commands.addCommand(CommandIds.edit, {
    label: 'Edit Bookmark...',
    execute: async () => {
      const hit = target();
      if (hit) {
        await edit(hit.node);
      }
    }
  });

  commands.addCommand(CommandIds.remove, {
    label: 'Remove Bookmark',
    className: DANGER,
    execute: async () => {
      const hit = target();
      if (hit) {
        await remove(hit.section, hit.node.id);
      }
    }
  });

  commands.addCommand(CommandIds.addRecent, {
    label: 'Add to Bookmarks',
    execute: async () => {
      const entry = recentTarget();
      if (!entry) {
        return;
      }
      const link: ILink = {
        kind: 'link',
        id: UUID.uuid4(),
        name: entry.title,
        url: toStoredUrl(entry.url, app.serviceManager.serverSettings.baseUrl)
      };
      await store.update('links', nodes => addNode(nodes, link));
      await storeFavicon(store, link, app.serviceManager.serverSettings);
    }
  });

  commands.addCommand(CommandIds.removeRecent, {
    label: 'Remove from Recent',
    execute: async () => {
      const entry = recentTarget();
      if (entry) {
        await recent.remove(entry.url);
      }
    }
  });

  // The destructive entry is last, below a separator.
  for (const [selector, first, last] of [
    [BOOKMARK_ROW, CommandIds.edit, CommandIds.remove],
    [FOLDER_ROW, CommandIds.renameFolder, CommandIds.deleteFolder]
  ]) {
    contextMenu.addItem({ command: first, selector, rank: 1 });
    contextMenu.addItem({ type: 'separator', selector, rank: 2 });
    contextMenu.addItem({ command: last, selector, rank: 3 });
  }
  // Removing a recent page loses a history row only, so the entry is not destructive and needs no separator.
  contextMenu.addItem({
    command: CommandIds.addRecent,
    selector: RECENT_ROW,
    rank: 1
  });
  contextMenu.addItem({
    command: CommandIds.removeRecent,
    selector: RECENT_ROW,
    rank: 2
  });
}
