import { BookmarkStore } from '../model/store';
import { addNode, findNode, moveNode, updateNode } from '../model/tree';
import { Node, SectionKey } from '../model/types';

/** The Folder field: None plus the section's root folders, set to the folder holding bookmark `id`. */
export function folderSelect(nodes: Node[], id: string): HTMLSelectElement {
  const current = findNode(nodes, n => n.id === id)?.parent?.id;
  const select = document.createElement('select');
  select.className = 'jp-BookmarksPanel-input';
  select.add(new Option('None', ''));
  for (const node of nodes) {
    if (node.kind === 'folder') {
      select.add(new Option(node.name, node.id, false, node.id === current));
    }
  }
  return select;
}

/** The edit dialog's title: New Bookmark for a bookmark the section does not hold yet. */
export function dialogTitle(nodes: Node[], id: string): string {
  return findNode(nodes, n => n.id === id) ? 'Edit Bookmark' : 'New Bookmark';
}

/**
 * Writes the edited bookmark in place; a Folder choice the user changed
 * moves it, `null` to the section root. `undefined` leaves it where it is.
 * A bookmark the section does not hold, a new one, is added in the chosen
 * folder or at the section root.
 */
export function saveEdit(
  store: BookmarkStore,
  section: SectionKey,
  node: Node,
  folderId: string | null | undefined
): Promise<void> {
  return store.update(section, nodes => {
    if (!findNode(nodes, n => n.id === node.id)) {
      return addNode(nodes, node, folderId ?? null);
    }
    const updated = updateNode(nodes, node.id, () => node);
    return folderId === undefined
      ? updated
      : moveNode(updated, node.id, folderId);
  });
}

/** The Folder choice to pass to `saveEdit`, given the value the field opened with. */
export function folderChoice(
  select: HTMLSelectElement,
  initial: string
): string | null | undefined {
  return select.value === initial ? undefined : select.value || null;
}
