const KEY = 'jupyterlab_bookmarks_extension:collapsed';

/** Ids of the collapsed sections and folders; an unreadable value means all expanded. */
export function loadCollapsed(): Set<string> {
  try {
    const value = JSON.parse(window.localStorage.getItem(KEY) ?? '[]');
    return new Set(
      Array.isArray(value) ? value.filter(id => typeof id === 'string') : []
    );
  } catch {
    return new Set();
  }
}

export function saveCollapsed(ids: Set<string>): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(Array.from(ids)));
  } catch {
    // localStorage unavailable (private mode, quota): the fold state lasts the session.
  }
}
