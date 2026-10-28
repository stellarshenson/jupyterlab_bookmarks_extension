import { DocumentRegistry } from '@jupyterlab/docregistry';
import {
  folderIcon,
  LabIcon,
  linkIcon,
  terminalIcon
} from '@jupyterlab/ui-components';
import { fileTypeIcon } from '../file/file_icon';
import { toAbsoluteUrl } from '../link/link_url';
import { Node } from '../model/types';
import { IRecentProxyEntry } from '../recent/recent';

/** What the views read besides the bookmarks. */
export interface IViewState {
  /** Collapsed section keys and folder ids. */
  collapsed: Set<string>;
  /** File path to missing, for every file bookmark. */
  missing: Map<string, boolean>;
  docRegistry: DocumentRegistry;
  baseUrl: string;
  /** The row of each section that holds the section's one tab stop. */
  stops: Record<string, string | undefined>;
  /** The filter box narrows the sections. */
  filtering: boolean;
  /** The ids of the bookmarks whose tab is open in the main area. */
  open: Set<string>;
  /** The id of the bookmark whose tab is current. */
  current: string | undefined;
  /** The Recent Proxy rows shown, already pruned, filtered and without bookmarked pages. */
  recent: IRecentProxyEntry[];
  /** The render's clock, for the age labels. */
  now: number;
}

/** The fold caret, `▾` open and `▸` closed; empty on a bookmark row, so icons line up with folder icons. */
export function caret(expanded?: boolean): HTMLElement {
  const span = document.createElement('span');
  span.className = 'jp-BookmarksPanel-caret';
  span.setAttribute('aria-hidden', 'true');
  span.textContent = expanded === undefined ? '' : expanded ? '▾' : '▸';
  return span;
}

/** One row of the tree: a folder or a bookmark, indented 16 px per level. */
export function renderRow(
  node: Node,
  depth: number,
  view: IViewState
): HTMLElement {
  const row = document.createElement('div');
  row.className = 'jp-BookmarksPanel-row';
  row.dataset.id = node.id;
  row.tabIndex = -1;
  row.setAttribute('role', 'treeitem');
  row.setAttribute('aria-level', String(depth + 1));
  row.style.setProperty('--jp-bookmarks-depth', String(depth));
  let label = node.name;
  let icon: HTMLElement;
  switch (node.kind) {
    case 'folder': {
      const expanded = !view.collapsed.has(node.id);
      row.classList.add('jp-BookmarksPanel-folder');
      row.classList.toggle('jp-mod-collapsed', !expanded);
      row.setAttribute('aria-expanded', String(expanded));
      row.appendChild(caret(expanded));
      icon = iconElement(folderIcon);
      break;
    }
    case 'link':
      row.title = toAbsoluteUrl(node.url, view.baseUrl);
      icon = node.icon ? imageElement(node.icon) : iconElement(linkIcon);
      break;
    case 'file':
      if (view.missing.get(node.path)) {
        row.classList.add('jp-mod-missing');
        row.title = `File not found: ${node.path}`;
        label = `${node.name}, File not found`;
      } else {
        row.title = node.path;
      }
      icon = iconElement(fileTypeIcon(view.docRegistry, node.path));
      break;
    case 'session':
      row.title = `${node.cwd}: ${node.command}`;
      icon = iconElement(terminalIcon);
      break;
  }
  if (node.kind !== 'folder') {
    row.appendChild(caret());
  }
  // The open mark and the current tab's tint follow the open tabs; the word joins the aria-label.
  const open = view.open.has(node.id);
  if (open) {
    label = `${label}, open`;
  }
  if (view.current === node.id) {
    row.classList.add('jp-mod-current');
  }
  row.setAttribute('aria-label', label);
  const name = document.createElement('span');
  name.className = 'jp-BookmarksPanel-rowName';
  const text = document.createElement('span');
  text.className = 'jp-BookmarksPanel-rowText';
  text.textContent = node.name;
  name.appendChild(text);
  row.append(icon, name);
  if (open) {
    const mark = document.createElement('span');
    mark.className = 'jp-BookmarksPanel-rowMark';
    mark.setAttribute('aria-hidden', 'true');
    row.appendChild(mark);
  }
  return row;
}

export function iconElement(icon: LabIcon): HTMLElement {
  return icon.element({ tag: 'span', className: 'jp-BookmarksPanel-rowIcon' });
}

function imageElement(src: string): HTMLElement {
  const img = document.createElement('img');
  img.className = 'jp-BookmarksPanel-rowIcon';
  img.src = src;
  img.alt = '';
  return img;
}
