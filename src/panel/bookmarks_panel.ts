import { JupyterFrontEnd } from '@jupyterlab/application';
import { showErrorMessage } from '@jupyterlab/apputils';
import { DocumentRegistry } from '@jupyterlab/docregistry';
import { TranslationBundle } from '@jupyterlab/translation';
import {
  filterIcon,
  LabIcon,
  MenuSvg,
  refreshIcon,
  SidePanel
} from '@jupyterlab/ui-components';
import { Panel, Widget } from '@lumino/widgets';
import { CommandIds } from '../commands';
import { isFileMissing } from '../file/file_status';
import { bookmarksIcon } from '../icons';
import { openLink } from '../link/open_link';
import { markValue, TabMarks } from '../mark/marks';
import { BookmarkStore } from '../model/store';
import {
  bookmarksIn,
  filterNodes,
  findNode,
  matchesFilter
} from '../model/tree';
import { Node, SectionKey } from '../model/types';
import { openRecent } from '../recent/open_recent';
import {
  matchesRecent,
  pruneRecent,
  RecentProxyStore,
  recentWithoutBookmarks
} from '../recent/recent';
import { openSession } from '../session/open_session';
import { loadCollapsed, saveCollapsed } from './fold_state';
import {
  RECENT_KEY,
  renderRecentSection,
  renderSection,
  SECTIONS
} from './section_view';

const ROW = '.jp-BookmarksPanel-row';

/** The shortest spin of Refresh, so a fast refresh still shows that it ran. */
const REFRESH_SPIN_MS = 500;

/** A 24 px icon button of the top bar. */
function iconButton(icon: LabIcon, title: string): HTMLButtonElement {
  const button = document.createElement('button');
  button.className = 'jp-BookmarksPanel-iconButton';
  button.title = title;
  button.setAttribute('aria-label', title);
  icon.element({ container: button });
  return button;
}

/** The side panel: a top bar with the title, Filter and Refresh, then the Links, Files, Sessions and Recent Proxy sections. */
export class BookmarksPanel extends SidePanel {
  constructor(
    private _app: JupyterFrontEnd,
    private _store: BookmarkStore,
    private _recent: RecentProxyStore,
    private _docRegistry: DocumentRegistry,
    private _marks: TabMarks,
    private _translation: TranslationBundle
  ) {
    super({ content: new Panel() });
    this.id = 'jupyterlab_bookmarks_manager_extension-panel';
    this.addClass('jp-BookmarksPanel');
    this.title.icon = bookmarksIcon;
    this.title.caption = this._translation.__('Bookmarks');

    const header = new Widget();
    header.addClass('jp-BookmarksPanel-header');
    const title = document.createElement('span');
    title.className = 'jp-BookmarksPanel-title';
    title.textContent = this._translation.__('Bookmarks');
    this._filterButton.setAttribute('aria-pressed', 'false');
    this._filterButton.addEventListener('click', () => this._toggleFilter());
    this._refreshButton.addEventListener('click', () => void this._refresh());
    header.node.append(title, this._filterButton, this._refreshButton);
    this.header.addWidget(header);

    this._filterBar.addClass('jp-BookmarksPanel-filter');
    this._filterInput.type = 'search';
    this._filterInput.className = 'jp-BookmarksPanel-filterInput';
    this._filterInput.placeholder = this._translation.__('Filter bookmarks');
    this._filterInput.setAttribute(
      'aria-label',
      this._translation.__('Filter bookmarks')
    );
    this._filterInput.spellcheck = false;
    this._filterInput.addEventListener('input', () => this._render());
    this._filterBar.node.appendChild(this._filterInput);
    this._filterBar.hide();
    this.addWidget(this._filterBar);

    this._body.addClass('jp-BookmarksPanel-body');
    this.addWidget(this._body);
    for (const type of ['click', 'keydown', 'focusin', 'focusout']) {
      this._body.node.addEventListener(type, this);
    }
    this._plusMenu = new MenuSvg({ commands: this._app.commands });
    // The open menu holds the focus, and a closed menu gives it to no element, so the + button takes it.
    this._plusMenu.aboutToClose.connect(() => {
      this._plusButton?.classList.remove('jp-mod-active');
      this._plusButton?.setAttribute('aria-expanded', 'false');
      this._plusButton?.focus();
    });
    this._store.changed.connect(this._render, this);
    this._recent.changed.connect(this._render, this);
    this._marks.changed.connect(this._render, this);
    this._render();
  }

  /** The + menu of a section header: New Bookmark... and New Folder, below the button. */
  private _openPlusMenu(section: SectionKey, button: HTMLElement): void {
    const menu = this._plusMenu;
    menu.clearItems();
    for (const command of [CommandIds.newBookmark, CommandIds.newFolder]) {
      menu.addItem({ command, args: { section } });
    }
    this._plusButton = button;
    button.classList.add('jp-mod-active');
    button.setAttribute('aria-expanded', 'true');
    const rect = button.getBoundingClientRect();
    menu.open(rect.left, rect.bottom);
  }

  /** Checks every file bookmark and reads the running terminals again, then redraws; the icon spins meanwhile. */
  private async _refresh(): Promise<void> {
    const button = this._refreshButton;
    button.disabled = true;
    button.classList.add('jp-mod-spinning');
    const { contents, terminals } = this._app.serviceManager;
    // isFileMissing never rejects, so only the terminal read needs a catch.
    await Promise.all([
      ...[...this._missing.keys()].map(async path =>
        this._missing.set(path, await isFileMissing(contents, path))
      ),
      terminals
        .refreshRunning()
        .catch(reason =>
          console.warn('Could not read the running terminals.', reason)
        ),
      new Promise(resolve => setTimeout(resolve, REFRESH_SPIN_MS))
    ]);
    this._render();
    button.disabled = false;
    button.classList.remove('jp-mod-spinning');
  }

  handleEvent(event: Event): void {
    const target = event.target as HTMLElement;
    const key = target.closest<HTMLElement>('[data-section]')?.dataset.section;
    const row = target.closest<HTMLElement>(ROW);
    const plus = target.closest<HTMLElement>('.jp-BookmarksPanel-plus');
    if (!key) {
      return;
    }
    switch (event.type) {
      case 'click':
        // The second click of a double-click would start a session twice or fold a folder back.
        if ((event as MouseEvent).detail > 1) {
          break;
        }
        if (target.closest('.jp-BookmarksPanel-sectionToggle')) {
          this._toggle(key);
        } else if (plus) {
          this._openPlusMenu(key as SectionKey, plus);
        } else if (row) {
          void this._activateRow(key, row.dataset.id!);
        }
        break;
      case 'keydown':
        if (row) {
          this._onKeydown(event as KeyboardEvent, key, row);
        }
        break;
      case 'focusin':
        if (row) {
          this._stops[key] = row.dataset.id;
          row.parentElement
            ?.querySelectorAll<HTMLElement>(ROW)
            .forEach(r => (r.tabIndex = r === row ? 0 : -1));
          row.classList.add('jp-mod-active');
        }
        break;
      case 'focusout':
        row?.classList.remove('jp-mod-active');
        break;
    }
  }

  /** Up and Down move between the rows of a section; Enter acts as a click. */
  private _onKeydown(
    event: KeyboardEvent,
    key: string,
    row: HTMLElement
  ): void {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const rows = Array.from(
        row.parentElement!.querySelectorAll<HTMLElement>(ROW)
      );
      const step = event.key === 'ArrowDown' ? 1 : -1;
      rows[rows.indexOf(row) + step]?.focus();
    } else if (event.key === 'Enter') {
      event.preventDefault();
      void this._activateRow(key, row.dataset.id!);
    }
  }

  /** A bookmark row opens its bookmark; a Recent Proxy row reopens its page. */
  private _activateRow(key: string, id: string): Promise<unknown> {
    return key === RECENT_KEY
      ? this._openRecent(id)
      : this._activate(key as SectionKey, id);
  }

  private async _openRecent(url: string): Promise<void> {
    const entry = this._recent.entries.find(e => e.url === url);
    if (entry) {
      await openRecent(this._app, entry);
    }
  }

  private async _activate(section: SectionKey, id: string): Promise<void> {
    const node = findNode(
      this._store.bookmarks[section],
      n => n.id === id
    )?.node;
    switch (node?.kind) {
      case 'folder':
        // A folder holding a match stays open while the filter narrows the sections.
        if (!this._filterInput.value.trim()) {
          this._toggle(node.id);
        }
        break;
      case 'link':
        openLink(this._app, node);
        break;
      case 'file':
        await this._openFile(node.path);
        break;
      case 'session':
        await openSession(this._app, node);
        break;
    }
  }

  /** Opens the file; the file is checked on every click, and a missing file opens nothing. */
  private async _openFile(path: string): Promise<void> {
    const missing = await isFileMissing(
      this._app.serviceManager.contents,
      path
    );
    if (missing !== this._missing.get(path)) {
      this._missing.set(path, missing);
      this._render();
    }
    if (missing) {
      void showErrorMessage('File not found', `File not found: ${path}`);
      return;
    }
    await this._app.commands.execute('docmanager:open', { path });
  }

  /** Shows or hides the filter box; hiding it clears the text, so no hidden filter narrows the rows. */
  private _toggleFilter(): void {
    const show = this._filterBar.isHidden;
    this._filterBar.setHidden(!show);
    this._filterButton.classList.toggle('jp-mod-active', show);
    this._filterButton.setAttribute('aria-pressed', String(show));
    if (show) {
      this._filterInput.focus();
    } else if (this._filterInput.value) {
      this._filterInput.value = '';
      this._render();
    }
  }

  private _toggle(id: string): void {
    if (!this._collapsed.delete(id)) {
      this._collapsed.add(id);
    }
    saveCollapsed(this._collapsed);
    this._render();
  }

  private _render(): void {
    const bookmarks = this._store.bookmarks;
    this.node.dataset.mark = markValue(this._store.markColour);
    this._trackFiles(bookmarks.files);
    const focus = this._focusSelector();
    const query = this._filterInput.value.trim();
    const baseUrl = this._app.serviceManager.serverSettings.baseUrl;
    const now = Date.now();
    const recent = recentWithoutBookmarks(
      pruneRecent(this._recent.entries, this._store.recentProxyTtlDays, now),
      bookmarks.links,
      baseUrl
    ).filter(entry => !query || matchesRecent(entry, query));
    const shown = (nodes: Node[]) =>
      query ? filterNodes(nodes, node => matchesFilter(node, query)) : nodes;
    const view = {
      // While filtering, every folder shown holds a match and stays open; the saved fold state waits.
      collapsed: query
        ? new Set(
            [...SECTIONS, RECENT_KEY].filter(key => this._collapsed.has(key))
          )
        : this._collapsed,
      filtering: !!query,
      missing: this._missing,
      open: this._marks.open,
      current: this._marks.current,
      docRegistry: this._docRegistry,
      baseUrl,
      stops: this._stops,
      recent,
      now
    };
    this._body.node.replaceChildren(
      ...SECTIONS.map(key =>
        renderSection(key, shown(bookmarks[key]), view, this._translation)
      ),
      renderRecentSection(view, this._translation)
    );
    if (focus) {
      this._body.node.querySelector<HTMLElement>(focus)?.focus();
    }
  }

  /** A selector for the focused row or section toggle, so the focus survives a render. */
  private _focusSelector(): string | undefined {
    const focused = document.activeElement as HTMLElement | null;
    if (!focused || !this._body.node.contains(focused)) {
      return undefined;
    }
    if (focused.dataset.id) {
      return `${ROW}[data-id="${CSS.escape(focused.dataset.id)}"]`;
    }
    const section =
      focused.closest<HTMLElement>('[data-section]')?.dataset.section;
    return `[data-section="${section}"] .jp-BookmarksPanel-sectionToggle`;
  }

  /**
   * Keeps the missing state of every bookmarked path. A path not seen before
   * - on panel load, after an add or a location change - is checked once.
   */
  private _trackFiles(files: Node[]): void {
    const known = this._missing;
    this._missing = new Map();
    for (const node of bookmarksIn(files)) {
      if (node.kind !== 'file' || this._missing.has(node.path)) {
        continue;
      }
      const state = known.get(node.path);
      this._missing.set(node.path, state ?? false);
      if (state === undefined) {
        void isFileMissing(this._app.serviceManager.contents, node.path).then(
          missing => {
            if (this._missing.get(node.path) === !missing) {
              this._missing.set(node.path, missing);
              this._render();
            }
          }
        );
      }
    }
  }

  private _plusMenu: MenuSvg;
  private _plusButton: HTMLElement | undefined;
  private _filterButton = iconButton(filterIcon, 'Filter bookmarks');
  private _refreshButton = iconButton(refreshIcon, 'Refresh');
  private _filterBar = new Widget();
  private _filterInput = document.createElement('input');
  private _body = new Widget();
  private _collapsed = loadCollapsed();
  private _missing = new Map<string, boolean>();
  private _stops: Record<string, string | undefined> = {};
}
