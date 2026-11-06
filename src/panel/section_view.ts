import { TranslationBundle } from '@jupyterlab/translation';
import {
  addIcon,
  LabIcon,
  linkIcon,
  refreshIcon
} from '@jupyterlab/ui-components';
import { eraserIcon } from '../icons';
import { countBookmarks } from '../model/tree';
import { Node, SectionKey } from '../model/types';
import { formatAgo, IRecentProxyEntry, STALE_MS } from '../recent/recent';
import {
  caret,
  iconElement,
  imageElement,
  IViewState,
  renderRow
} from './row_view';

export const SECTIONS: SectionKey[] = ['links', 'files', 'sessions'];

/** The section key of the Proxy section; it holds no user folders or bookmarks. */
export const RECENT_KEY = 'recent';

const NAMES: Record<SectionKey, string> = {
  links: 'Links',
  files: 'Files',
  sessions: 'Sessions'
};

/** The name of a bookmark section in its band, its tooltips and its dialogs. */
export function sectionName(key: SectionKey): string {
  return NAMES[key];
}

/** One section: a sticky header with the fold toggle, the Clear button and the + menu button, then its rows or the empty hint. */
export function renderSection(
  key: SectionKey,
  nodes: Node[],
  view: IViewState,
  trans: TranslationBundle,
  hasContent = nodes.length > 0
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
  label.textContent = NAMES[key].toUpperCase();
  const count = document.createElement('span');
  count.className = 'jp-BookmarksPanel-sectionCount';
  count.textContent = `(${countBookmarks(nodes)})`;
  toggle.append(caret(expanded), label, count);
  const plus = document.createElement('button');
  plus.className = 'jp-BookmarksPanel-iconButton jp-BookmarksPanel-plus';
  plus.title = trans.__('New Bookmark or Folder');
  plus.setAttribute(
    'aria-label',
    trans.__('New Bookmark or Folder in %1', NAMES[key])
  );
  plus.setAttribute('aria-haspopup', 'menu');
  plus.setAttribute('aria-expanded', 'false');
  plus.appendChild(addIcon.element({ tag: 'span' }));
  header.append(toggle, clearButton(NAMES[key], key, hasContent, trans), plus);
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
        ? trans.__('No matching bookmarks.')
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

/** The Proxy section: a fold toggle, the Clear button, the + button of the Open Proxy Page dialog and the pages opened through the lab's server proxy, newest first. */
export function renderRecentSection(
  view: IViewState,
  trans: TranslationBundle,
  hasContent = view.recent.length > 0
): HTMLElement {
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
  label.textContent = trans.__('Proxy');
  const count = document.createElement('span');
  count.className = 'jp-BookmarksPanel-sectionCount';
  count.textContent = `(${view.recent.length})`;
  toggle.append(caret(expanded), label, count);
  header.append(
    toggle,
    clearButton(trans.__('Proxy'), RECENT_KEY, hasContent, trans)
  );
  const plus = document.createElement('button');
  plus.className = 'jp-BookmarksPanel-iconButton jp-BookmarksPanel-plus';
  plus.disabled = !view.canOpenProxy;
  plus.title = view.canOpenProxy
    ? trans.__('Open Proxy Page')
    : trans.__('Open Proxy Page needs jupyter-server-proxy');
  plus.setAttribute('aria-label', trans.__('Open Proxy Page'));
  plus.setAttribute('aria-haspopup', 'dialog');
  plus.appendChild(addIcon.element({ tag: 'span' }));
  header.appendChild(plus);
  section.appendChild(header);

  if (expanded) {
    const body = document.createElement('div');
    body.className = 'jp-BookmarksPanel-sectionBody';
    body.setAttribute('role', 'tree');
    body.setAttribute('aria-label', trans.__('Proxy'));
    if (view.recent.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'jp-BookmarksPanel-empty';
      empty.textContent = view.filtering
        ? trans.__('No matching bookmarks.')
        : trans.__('No proxy pages.');
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

/** The name of the globe a proxied page's lab tab shows, which jupyterlab-vscode-icons-extension registers and exports no symbol for. */
export const WEB_ICON = 'jupyterlab_vscode_icons_extension:local-page';

/** The web icon of a proxied page's lab tab; the link icon when no extension registers it, as `resolve` then holds the refresh placeholder. */
export function webIcon(): LabIcon {
  const icon = LabIcon.resolve({ icon: WEB_ICON });
  return icon.svgstr === refreshIcon.svgstr ? linkIcon : icon;
}

/** The Clear control of a section band: an eraser beside the +, disabled while the section holds nothing. */
function clearButton(
  name: string,
  section: string,
  hasContent: boolean,
  trans: TranslationBundle
): HTMLButtonElement {
  const button = document.createElement('button');
  button.className = 'jp-BookmarksPanel-iconButton jp-BookmarksPanel-clear';
  button.title = trans.__('Clear %1', name);
  button.setAttribute('aria-label', trans.__('Clear %1', name));
  button.dataset.clearSection = section;
  button.disabled = !hasContent;
  button.appendChild(eraserIcon.element({ tag: 'span' }));
  return button;
}

/** One Proxy section page: its title, its age, and the recently-active or stale state of the design system. */
function renderRecentRow(entry: IRecentProxyEntry, now: number): HTMLElement {
  const age = now - entry.openedAt;
  const time = formatAgo(age);
  const row = document.createElement('div');
  row.className = 'jp-BookmarksPanel-row jp-BookmarksPanel-recent';
  row.dataset.id = entry.url;
  row.tabIndex = -1;
  row.setAttribute('role', 'treeitem');
  row.setAttribute('aria-level', '1');
  row.title = `${entry.title}\n${entry.url}`;
  row.dataset.timeAt = String(entry.openedAt);
  row.dataset.labelBase = entry.title;
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
  row.append(
    caret(),
    entry.icon ? imageElement(entry.icon, webIcon()) : iconElement(webIcon()),
    name,
    shown
  );
  return row;
}
