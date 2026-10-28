import { JupyterFrontEnd } from '@jupyterlab/application';
import { IDocumentManager } from '@jupyterlab/docmanager';
import { ISignal, Signal } from '@lumino/signaling';
import { DockPanel } from '@lumino/widgets';
import { SECTION, tabMatches } from '../classify/bookmark_match';
import { classifyTab } from '../classify/tab_kind';
import { findNode } from '../model/tree';
import { BookmarkStore } from '../model/store';
import { TerminalSnapshot } from '../session/terminal_snapshot';

/** The tab ribbon and the panel dot live in the tab bar, outside the panel root. */
const TAB =
  '#jp-main-dock-panel .lm-TabBar-tab[data-id], #jp-down-stack .lm-TabBar-tab[data-id]';

/** The setting's value as an offered colour; anything else is the default brand. */
export function markValue(value: unknown): 'brand' | 'red' {
  return value === 'red' ? 'red' : 'brand';
}

/**
 * The bookmarks that have a tab open in the main or down area, and the current
 * tab's bookmark; the ribbon on each tab and the panel's open marks follow them.
 */
export class TabMarks {
  constructor(
    private _app: JupyterFrontEnd,
    private _store: BookmarkStore,
    private _docManager: IDocumentManager,
    private _snapshot: TerminalSnapshot
  ) {
    this._store.changed.connect(this._onStoreChanged, this);
    this._app.shell.currentChanged?.connect(this._sync, this);
    // The shell is a DockPanel; layoutModified covers a tab's add, removal, activation and move.
    (this._app.shell as unknown as DockPanel).layoutModified.connect(
      this._sync,
      this
    );
    this._snapshot.changed.connect(this._sync, this);
    this._onStoreChanged();
  }

  /** The ids of the bookmarks whose tab is open in the main or down area. */
  open = new Set<string>();

  /** The id of the bookmark whose tab is current. */
  current: string | undefined;

  /** Emits when `open` or `current` changes. */
  get changed(): ISignal<this, void> {
    return this._changed;
  }

  private _onStoreChanged(): void {
    this._sync();
    // A capture or a removal is a user action, so the terminals are read again with it.
    void this._snapshot
      .refresh()
      .catch(reason =>
        console.warn('Could not read the running terminals.', reason)
      );
  }

  private _sync(): void {
    const bookmarks = this._store.bookmarks;
    const baseUrl = this._app.serviceManager.serverSettings.baseUrl;
    const colour = markValue(this._store.markColour);
    const currentWidget = this._app.shell.currentWidget;
    const elements = new Map<string, HTMLElement>();
    this._app.shell.node
      .querySelectorAll<HTMLElement>(TAB)
      .forEach(element => elements.set(element.dataset.id!, element));

    const open = new Set<string>();
    let current: string | undefined;
    for (const area of ['main', 'down'] as const) {
      for (const widget of this._app.shell.widgets(area)) {
        const kind = classifyTab(widget, w =>
          this._docManager.contextForWidget(w)
        );
        const hit = kind
          ? findNode(
              bookmarks[SECTION[kind.kind]],
              tabMatches(kind, this._snapshot.terminals, baseUrl)
            )
          : undefined;
        if (hit) {
          open.add(hit.node.id);
          if (widget === currentWidget) {
            current = hit.node.id;
          }
        }
        const element = elements.get(widget.id);
        if (element) {
          if (hit) {
            element.dataset.bookmark = colour;
          } else {
            delete element.dataset.bookmark;
          }
        }
      }
    }

    const same =
      current === this.current &&
      open.size === this.open.size &&
      [...open].every(id => this.open.has(id));
    this.open = open;
    this.current = current;
    if (!same) {
      this._changed.emit();
    }
  }

  private _changed = new Signal<this, void>(this);
}
