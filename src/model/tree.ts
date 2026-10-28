import { IFolder, Node } from './types';

/**
 * Pure tree functions over one section. None mutates its input; every one
 * accepts folders at any depth.
 */

/** The first node that passes `test`, with the folder holding it (null at the section root). */
export function findNode(
  nodes: Node[],
  test: (node: Node) => boolean,
  parent: IFolder | null = null
): { node: Node; parent: IFolder | null } | undefined {
  for (const node of nodes) {
    if (test(node)) {
      return { node, parent };
    }
    if (node.kind === 'folder') {
      const hit = findNode(node.children, test, node);
      if (hit) {
        return hit;
      }
    }
  }
  return undefined;
}

/** Every bookmark in `nodes`, folders left out. */
export function bookmarksIn(nodes: Node[]): Node[] {
  return ([] as Node[]).concat(
    ...nodes.map(node =>
      node.kind === 'folder' ? bookmarksIn(node.children) : [node]
    )
  );
}

export function countBookmarks(nodes: Node[]): number {
  return bookmarksIn(nodes).length;
}

/** Replaces the node `id` with `change(node)`; renames and edits go through here. */
export function updateNode(
  nodes: Node[],
  id: string,
  change: (node: Node) => Node
): Node[] {
  return nodes.map(node => {
    if (node.id === id) {
      return change(node);
    }
    return node.kind === 'folder'
      ? { ...node, children: updateNode(node.children, id, change) }
      : node;
  });
}

/** Adds `node` inside the folder `folderId`, or at the section root when that folder does not exist. */
export function addNode(
  nodes: Node[],
  node: Node,
  folderId: string | null = null
): Node[] {
  const folder =
    folderId !== null &&
    findNode(nodes, n => n.kind === 'folder' && n.id === folderId);
  if (!folder) {
    return [...nodes, node];
  }
  return updateNode(nodes, folder.node.id, f =>
    f.kind === 'folder' ? { ...f, children: [...f.children, node] } : f
  );
}

/** Removes every node that passes `test`, with the contents of a removed folder. */
export function removeNodes(
  nodes: Node[],
  test: (node: Node) => boolean
): Node[] {
  return nodes
    .filter(node => !test(node))
    .map(node =>
      node.kind === 'folder'
        ? { ...node, children: removeNodes(node.children, test) }
        : node
    );
}

/** Moves the node `id` into the folder `folderId`, or to the section root for null. */
export function moveNode(
  nodes: Node[],
  id: string,
  folderId: string | null
): Node[] {
  const hit = findNode(nodes, n => n.id === id);
  if (!hit) {
    return nodes;
  }
  return addNode(
    removeNodes(nodes, n => n.id === id),
    hit.node,
    folderId
  );
}

/** True when the bookmark's name, URL, path or command contains `query`, case ignored. */
export function matchesFilter(node: Node, query: string): boolean {
  const field =
    node.kind === 'link'
      ? node.url
      : node.kind === 'file'
        ? node.path
        : node.kind === 'session'
          ? node.command
          : '';
  return `${node.name}\n${field}`.toLowerCase().includes(query.toLowerCase());
}

/** The bookmarks that pass `test`, inside the folders holding them; a folder without one is left out. */
export function filterNodes(
  nodes: Node[],
  test: (node: Node) => boolean
): Node[] {
  const kept: Node[] = [];
  for (const node of nodes) {
    if (node.kind !== 'folder') {
      if (test(node)) {
        kept.push(node);
      }
      continue;
    }
    const children = filterNodes(node.children, test);
    if (children.length > 0) {
      kept.push({ ...node, children });
    }
  }
  return kept;
}
