import { TabKind } from '../classify/tab_kind';
import { dropTarget } from '../panel/tab_drop';

const link: TabKind = { kind: 'link', url: 'https://example.com/' };
const file: TabKind = { kind: 'file', path: 'notes/a.txt' };

/** A panel root as the view renders it. */
function panel(): HTMLElement {
  const root = document.createElement('div');
  root.className = 'jp-BookmarksPanel';
  document.body.append(root);
  return root;
}

/** A panel section inside `parent`. */
function section(parent: HTMLElement, key: string): HTMLElement {
  const section = document.createElement('div');
  section.className = 'jp-BookmarksPanel-section';
  section.dataset.section = key;
  parent.append(section);
  return section;
}

/** A folder row inside `parent`. */
function folder(parent: HTMLElement, id: string): HTMLElement {
  const row = document.createElement('div');
  row.className = 'jp-BookmarksPanel-row jp-BookmarksPanel-folder';
  row.dataset.id = id;
  parent.append(row);
  return row;
}

describe('panel/tab_drop', () => {
  afterEach(() => document.body.replaceChildren());

  it('a drop on any part of the panel lands at the tab kind section root', () => {
    const root = panel();
    expect(dropTarget(file, section(root, 'files'))).toEqual({
      section: 'files',
      folderId: null
    });
    expect(dropTarget(link, section(root, 'recent'))).toEqual({
      section: 'links',
      folderId: null
    });
  });

  it('a drop on the panel top bar lands at the tab kind section root', () => {
    const header = document.createElement('div');
    header.className = 'jp-BookmarksPanel-header';
    panel().append(header);
    expect(dropTarget(file, header)).toEqual({
      section: 'files',
      folderId: null
    });
  });

  it('a folder row of the tab kind section takes the drop', () => {
    const root = panel();
    expect(dropTarget(file, folder(section(root, 'files'), 'notes'))).toEqual({
      section: 'files',
      folderId: 'notes'
    });
  });

  it('a folder row of another section goes to the tab kind section root', () => {
    const root = panel();
    expect(dropTarget(file, folder(section(root, 'links'), 'apps'))).toEqual({
      section: 'files',
      folderId: null
    });
  });

  it('anything outside the panel is no drop target', () => {
    panel();
    const outside = document.createElement('div');
    document.body.append(outside);
    expect(dropTarget(file, outside)).toBeUndefined();
    expect(dropTarget(file, null)).toBeUndefined();
  });
});
