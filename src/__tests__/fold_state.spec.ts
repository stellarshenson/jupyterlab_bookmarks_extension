import { loadCollapsed, saveCollapsed } from '../panel/fold_state';

const KEY = 'jupyterlab_bookmarks_manager_extension:collapsed';

describe('panel/fold_state', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    window.localStorage.clear();
  });

  it('keeps the collapsed ids across a load', () => {
    saveCollapsed(new Set(['links', 'folder-1']));
    expect(loadCollapsed()).toEqual(new Set(['links', 'folder-1']));
  });

  it('an unreadable or malformed value means all expanded', () => {
    window.localStorage.setItem(KEY, '{not json');
    expect(loadCollapsed().size).toBe(0);
    window.localStorage.setItem(KEY, '{"links": true}');
    expect(loadCollapsed().size).toBe(0);
    jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });
    expect(loadCollapsed().size).toBe(0);
  });
});
