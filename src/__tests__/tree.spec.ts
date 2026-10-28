import {
  addNode,
  countBookmarks,
  filterNodes,
  findNode,
  matchesFilter,
  moveNode,
  removeNodes,
  updateNode
} from '../model/tree';
import { IFolder, ILink, Node } from '../model/types';

const link = (id: string): ILink => ({
  kind: 'link',
  id,
  name: id,
  url: `${id}/`
});
const folder = (id: string, children: Node[] = []): IFolder => ({
  kind: 'folder',
  id,
  name: id,
  children
});

/** The tree as nested id lists, for compact assertions. */
const shape = (nodes: Node[]): unknown[] =>
  nodes.map(n => (n.kind === 'folder' ? { [n.id]: shape(n.children) } : n.id));

describe('model/tree', () => {
  it('adds to the section root and to a folder', () => {
    const nodes = [folder('f'), link('a')];
    expect(shape(addNode(nodes, link('b')))).toEqual([{ f: [] }, 'a', 'b']);
    expect(shape(addNode(nodes, link('b'), 'f'))).toEqual([{ f: ['b'] }, 'a']);
  });

  it('adds to the section root when the folder does not exist', () => {
    expect(shape(addNode([link('a')], link('b'), 'gone'))).toEqual(['a', 'b']);
  });

  it('removes a bookmark and a folder with its contents', () => {
    const nodes = [folder('f', [link('a'), link('b')]), link('c')];
    expect(shape(removeNodes(nodes, n => n.id === 'a'))).toEqual([
      { f: ['b'] },
      'c'
    ]);
    expect(shape(removeNodes(nodes, n => n.id === 'f'))).toEqual(['c']);
  });

  it('renames through updateNode', () => {
    const nodes = [folder('f', [link('a')])];
    const renamed = updateNode(nodes, 'a', n => ({ ...n, name: 'New' }));
    expect(findNode(renamed, n => n.id === 'a')?.node.name).toBe('New');
  });

  it('moves between folders and back to the root', () => {
    const nodes = [folder('f', [link('a')]), folder('g')];
    const moved = moveNode(nodes, 'a', 'g');
    expect(shape(moved)).toEqual([{ f: [] }, { g: ['a'] }]);
    expect(shape(moveNode(moved, 'a', null))).toEqual([
      { f: [] },
      { g: [] },
      'a'
    ]);
  });

  it('counts bookmarks, not folders', () => {
    expect(
      countBookmarks([folder('f', [link('a'), folder('g')]), link('b')])
    ).toBe(2);
    expect(countBookmarks([])).toBe(0);
  });

  it('finds a node with the folder that holds it', () => {
    const nodes = [folder('f', [link('a')]), link('b')];
    expect(findNode(nodes, n => n.id === 'a')?.parent?.id).toBe('f');
    expect(findNode(nodes, n => n.id === 'b')?.parent).toBeNull();
    expect(findNode(nodes, n => n.id === 'x')).toBeUndefined();
  });

  it('depth-2 folder', () => {
    const tree = (): Node[] => [
      folder('outer', [folder('inner', [link('a')])])
    ];
    expect(shape(addNode(tree(), link('b'), 'inner'))).toEqual([
      { outer: [{ inner: ['a', 'b'] }] }
    ]);
    expect(shape(removeNodes(tree(), n => n.id === 'a'))).toEqual([
      { outer: [{ inner: [] }] }
    ]);
    const renamed = updateNode(tree(), 'a', n => ({ ...n, name: 'A2' }));
    expect(findNode(renamed, n => n.id === 'a')).toEqual({
      node: { ...link('a'), name: 'A2' },
      parent: expect.objectContaining({ id: 'inner' })
    });
    expect(shape(moveNode(tree(), 'a', 'outer'))).toEqual([
      { outer: [{ inner: [] }, 'a'] }
    ]);
    expect(countBookmarks(tree())).toBe(1);
  });

  it('filters to the matches and the folders holding them', () => {
    const nodes = [
      folder('f', [link('a'), link('b'), folder('empty')]),
      folder('g', [link('c')]),
      link('ab')
    ];
    expect(shape(filterNodes(nodes, n => n.id.includes('a')))).toEqual([
      { f: ['a'] },
      'ab'
    ]);
    expect(filterNodes(nodes, () => false)).toEqual([]);
  });

  it('matches name, URL, path or command, case ignored', () => {
    const url: ILink = {
      ...link('x'),
      name: 'Docs',
      url: 'https://Example.com/'
    };
    const file: Node = {
      kind: 'file',
      id: 'f',
      name: 'a',
      path: 'notes/B.txt'
    };
    const session: Node = {
      kind: 'session',
      id: 's',
      name: 'sleep - tmp',
      cwd: '/tmp',
      command: 'sleep 300',
      env: {}
    };
    expect(matchesFilter(url, 'docs')).toBe(true);
    expect(matchesFilter(url, 'EXAMPLE.com')).toBe(true);
    expect(matchesFilter(file, 'b.TXT')).toBe(true);
    expect(matchesFilter(session, 'p 30')).toBe(true);
    expect(matchesFilter(session, '/tmp')).toBe(false);
    expect(matchesFilter(url, 'nothing')).toBe(false);
  });

  it('never mutates its input', () => {
    const nodes = [folder('f', [link('a')]), folder('g')];
    const before = JSON.stringify(nodes);
    addNode(nodes, link('b'), 'f');
    removeNodes(nodes, n => n.id === 'a');
    updateNode(nodes, 'a', n => ({ ...n, name: 'x' }));
    moveNode(nodes, 'a', 'g');
    filterNodes(nodes, n => n.id === 'a');
    expect(JSON.stringify(nodes)).toBe(before);
  });
});
