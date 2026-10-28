import { addIcon, linkIcon } from '@jupyterlab/ui-components';
import { countBookmarks } from '../model/tree';
import { Node, SectionKey } from '../model/types';
import { formatAgo, IRecentProxyEntry, STALE_MS } from '../recent/recent';
import { caret, iconElement, IViewState, renderRow } from './row_view';

export const SECTIONS: SectionKey[] = ['links', 'files', 'sessions'];

/** The section key of the Recent Proxy section; it holds no user folders or bookmarks. */
export const RECENT_KEY = 'recent';

const NAMES: Record<SectionKey, string> = {
  links: 'Links',
  files: 'Files',
  sessions: 'Sessions'
};

/** One section: a sticky header with the fold toggle and the + menu button, then its rows or the empty hint. */
export function renderSection(
  key: SectionKey,
  nodes: Node[],
  view: IViewState
): HTMLElement {
  const expanded = !view.collapsed.has(key);
  const section = document.createElement('div');
  section.className = 'jp-BookmarksPanel-section';
  section.classList.toggle('jp-mod-collapsed', !expanded);
  section.dataset.section = key;

  const header = document.createElement('div');
  header.className = 'jp-BookmarksPanel-sectionHeader';
  const toggle = document.createElement('button');
  toggle.className = 'jp-BookmarksPanel-sectionToggle';
  toggle.setAttribute('aria-expanded', String(expanded));
  const label = document.createElement('span');
  label.className = 'jp-BookmarksPanel-sectionLabel';
  label.textContent = `${NAMES[key].toUpperCase()} (${countBookmarks(nodes)})`;
  toggle.append(caret(expanded), label);
  const plus = document.createElement('button');
  plus.className = 'jp-BookmarksPanel-iconButton jp-BookmarksPanel-plus';
  plus.title = 'New Bookmark or Folder';
  plus.setAttribute('aria-label', `New Bookmark or Folder in ${NAMES[key]}`);
  plus.setAttribute('aria-haspopup', 'menu');
  plus.setAttribute('aria-expanded', 'false');
  plus.appendChild(addIcon.element({ tag: 'span' }));
  header.append(toggle, plus);
  section.appendChild(header);

  if (expanded) {
    const body = document.createElement('div');
    body.className = 'jp-BookmarksPanel-sectionBody';
    body.setAttribute('role', 'tree');
    body.setAttribute('aria-label', NAMES[key]);
    if (nodes.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'jp-BookmarksPanel-empty';
      empty.textContent = view.filtering
        ? 'No matching bookmarks.'
        : `No ${key}. Use Add Tab to Bookmarks on a tab.`;
      body.appendChild(empty);
    } else {
      appendRows(body, nodes, 0, view);
      // Roving tabindex: the section is one tab stop, on the remembered row or the first.
      const rows = Array.from(
        body.querySelectorAll<HTMLElement>('.jp-BookmarksPanel-row')
      );
      (
        rows.find(row => row.dataset.id === view.stops[key]) ?? rows[0]
      ).tabIndex = 0;
    }
    section.appendChild(body);
  }
  return section;
}

function appendRows(
  body: HTMLElement,
  nodes: Node[],
  depth: number,
  view: IViewState
): void {
  for (const node of nodes) {
    body.appendChild(renderRow(node, depth, view));
    if (node.kind === 'folder' && !view.collapsed.has(node.id)) {
      appendRows(body, node.children, depth + 1, view);
    }
  }
}

/** The Recent Proxy section: a fold toggle and the pages opened through `server-proxy:open`, newest first; no + menu. */
export function renderRecentSection(view: IViewState): HTMLElement {
  const expanded = !view.collapsed.has(RECENT_KEY);
  const section = document.createElement('div');
  section.className = 'jp-BookmarksPanel-section';
  section.classList.toggle('jp-mod-collapsed', !expanded);
  section.dataset.section = RECENT_KEY;

  const header = document.createElement('div');
  header.className = 'jp-BookmarksPanel-sectionHeader';
  const toggle = document.createElement('button');
  toggle.className = 'jp-BookmarksPanel-sectionToggle';
  toggle.setAttribute('aria-expanded', String(expanded));
  const label = document.createElement('span');
  label.className = 'jp-BookmarksPanel-sectionLabel';
  label.textContent = `RECENT PROXY (${view.recent.length})`;
  toggle.append(caret(expanded), label);
  header.appendChild(toggle);
  section.appendChild(header);

  if (expanded) {
    const body = document.createElement('div');
    body.className = 'jp-BookmarksPanel-sectionBody';
    body.setAttribute('role', 'tree');
    body.setAttribute('aria-label', 'Recent Proxy');
    if (view.recent.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'jp-BookmarksPanel-empty';
      empty.textContent = view.filtering
        ? 'No matching bookmarks.'
        : 'No recent proxy pages.';
      body.appendChild(empty);
    } else {
      for (const entry of view.recent) {
        body.appendChild(renderRecentRow(entry, view.now));
      }
      const rows = Array.from(
        body.querySelectorAll<HTMLElement>('.jp-BookmarksPanel-row')
      );
      (
        rows.find(row => row.dataset.id === view.stops[RECENT_KEY]) ?? rows[0]
      ).tabIndex = 0;
    }
    section.appendChild(body);
  }
  return section;
}

/** One recent page: its title, its age, and the recently-active or stale state of the design system. */
function renderRecentRow(entry: IRecentProxyEntry, now: number): HTMLElement {
  const age = now - entry.openedAt;
  const time = formatAgo(age);
  const row = document.createElement('div');
  row.className = 'jp-BookmarksPanel-row jp-BookmarksPanel-recent';
  row.dataset.id = entry.url;
  row.tabIndex = -1;
  row.setAttribute('role', 'treeitem');
  row.setAttribute('aria-level', '1');
  row.title = entry.url;
  row.setAttribute('aria-label', `${entry.title}, ${time}`);
  if (age < 60 * 1000) {
    row.classList.add('jp-mod-recentlyActive');
  } else if (age > STALE_MS) {
    row.classList.add('jp-mod-stale');
  }
  const name = document.createElement('span');
  name.className = 'jp-BookmarksPanel-rowName';
  const text = document.createElement('span');
  text.className = 'jp-BookmarksPanel-rowText';
  text.textContent = entry.title;
  name.appendChild(text);
  const shown = document.createElement('span');
  shown.className = 'jp-BookmarksPanel-rowTime';
  shown.textContent = time;
  row.append(iconElement(linkIcon), name, shown);
  return row;
}
