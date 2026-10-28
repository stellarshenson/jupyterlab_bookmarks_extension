import { JupyterFrontEnd } from '@jupyterlab/application';
import { IDocumentManager } from '@jupyterlab/docmanager';
import { Widget } from '@lumino/widgets';
import { SECTION } from '../classify/bookmark_match';
import { classifyTab, TabKind } from '../classify/tab_kind';
import { BookmarkStore } from '../model/store';
import { SectionKey } from '../model/types';
import { TerminalSnapshot } from '../session/terminal_snapshot';
import { addTabBookmark } from '../tab_add';

/** The main-area tabs; Lumino drags a tab by the pointer, so the drag is followed by pointer events. */
const TAB = '#jp-main-dock-panel .lm-TabBar-tab[data-id]';

/** The class of the section header or folder row a drop would land on. */
const MARK = 'jp-mod-dropTarget';

/** The movement that turns a press on a tab into a drag, as Lumino's own tab drag. */
const DRAG_THRESHOLD = 5;

/**
 * The element under the point. Lumino's tab drag covers the pointer with its
 * cursor backdrop, which elementFromPoint would return, so the backdrop drops
 * behind the page for the lookup as Lumino's own drop code does.
 */
function elementAt(x: number, y: number): Element | null {
  const backdrop = document.querySelector<HTMLElement>('.lm-cursor-backdrop');
  if (backdrop) {
    backdrop.style.zIndex = '-1000';
  }
  const element = document.elementFromPoint(x, y);
  if (backdrop) {
    backdrop.style.zIndex = '';
  }
  return element;
}

/** The widget and kind of a main-area tab, classified as the tab menu does. */
interface ITabTarget {
  widget: Widget;
  kind: TabKind;
}

/** A dragged tab and the section or folder it would land in. */
interface IDrop {
  target: ITabTarget;
  section: SectionKey;
  folderId: string | null;
}

/**
 * Where a tab of `kind` dropped with the pointer over `element` lands: a folder
 * row of the tab's own section takes the bookmark, any other part of the panel
 * its section root, and anything outside the panel nothing.
 */
export function dropTarget(
  kind: TabKind,
  element: Element | null
): { section: SectionKey; folderId: string | null } | undefined {
  if (!element?.closest('.jp-BookmarksPanel')) {
    return undefined;
  }
  const section = SECTION[kind.kind];
  const folder = element.closest<HTMLElement>('.jp-BookmarksPanel-folder');
  const own = folder?.closest<HTMLElement>('[data-section]')?.dataset.section;
  return {
    section,
    folderId: folder && own === section ? (folder.dataset.id ?? null) : null
  };
}

/**
 * A press on a main-area tab that moves onto the panel adds the tab's bookmark
 * where it is released, and marks the section or folder it would land on. The
 * tab's own drag between dock areas is not touched.
 */
export function addTabDrop(
  app: JupyterFrontEnd,
  store: BookmarkStore,
  docManager: IDocumentManager,
  snapshot: TerminalSnapshot
): void {
  let press: { id: string; x: number; y: number } | undefined;
  let marked: HTMLElement | undefined;

  const targetOf = (id: string): ITabTarget | undefined => {
    const widget = [...app.shell.widgets('main')].find(w => w.id === id);
    const kind = widget
      ? classifyTab(widget, w => docManager.contextForWidget(w))
      : null;
    return widget && kind ? { widget, kind } : undefined;
  };

  /** The drop under the pointer, once the press on the tab has moved far enough. */
  const dropOf = (event: PointerEvent): IDrop | undefined => {
    if (!press) {
      return undefined;
    }
    const dx = Math.abs(event.clientX - press.x);
    const dy = Math.abs(event.clientY - press.y);
    const target =
      dx < DRAG_THRESHOLD && dy < DRAG_THRESHOLD
        ? undefined
        : targetOf(press.id);
    const landing = target
      ? dropTarget(target.kind, elementAt(event.clientX, event.clientY))
      : undefined;
    return target && landing ? { target, ...landing } : undefined;
  };

  /** The header of the section a drop lands in, or the folder row it lands on. */
  const markFor = (drop: IDrop): HTMLElement | null =>
    drop.folderId
      ? document.querySelector<HTMLElement>(
          `.jp-BookmarksPanel-folder[data-id="${CSS.escape(drop.folderId)}"]`
        )
      : document.querySelector<HTMLElement>(
          `[data-section="${drop.section}"] .jp-BookmarksPanel-sectionHeader`
        );

  const reset = (): void => {
    press = undefined;
    marked?.classList.remove(MARK);
    marked = undefined;
  };

  document.addEventListener(
    'pointerdown',
    event => {
      const tab = (event.target as Element | null)?.closest<HTMLElement>(TAB);
      press = tab
        ? { id: tab.dataset.id!, x: event.clientX, y: event.clientY }
        : undefined;
    },
    true
  );

  document.addEventListener(
    'pointermove',
    event => {
      const drop = dropOf(event);
      const next = drop ? markFor(drop) : null;
      if (next !== marked) {
        marked?.classList.remove(MARK);
        marked = next ?? undefined;
        marked?.classList.add(MARK);
      }
    },
    true
  );

  document.addEventListener(
    'pointerup',
    event => {
      const drop = dropOf(event);
      reset();
      if (drop) {
        void addTabBookmark(
          app,
          store,
          snapshot,
          drop.target.widget,
          drop.target.kind,
          drop.folderId
        );
      }
    },
    true
  );

  // Escape and the context menu abort Lumino's tab drag; the drop must not land after them.
  document.addEventListener(
    'keydown',
    event => {
      if (event.key === 'Escape') {
        reset();
      }
    },
    true
  );
  document.addEventListener('contextmenu', reset, true);
}
