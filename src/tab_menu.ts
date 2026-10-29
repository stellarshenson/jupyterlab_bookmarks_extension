import { JupyterFrontEnd } from '@jupyterlab/application';
import { IDocumentManager } from '@jupyterlab/docmanager';
import { Widget } from '@lumino/widgets';
import { SECTION, tabMatches } from './classify/bookmark_match';
import { classifyTab, TabKind } from './classify/tab_kind';
import { CommandIds, NO_ARGS } from './commands';
import { BookmarkStore } from './model/store';
import { findNode, removeNodes } from './model/tree';
import { TerminalSnapshot } from './session/terminal_snapshot';
import { addTabBookmark } from './tab_add';

/**
 * `Add Tab to Bookmarks` or `Remove Tab from Bookmarks` in the context menu
 * of a web, document or terminal tab; hidden on any other tab.
 */
export function addTabMenu(
  app: JupyterFrontEnd,
  store: BookmarkStore,
  docManager: IDocumentManager,
  snapshot: TerminalSnapshot
): void {
  const { baseUrl } = app.serviceManager.serverSettings;

  /** The right-clicked tab's widget and what it shows. */
  const tab = (): { widget: Widget; kind: TabKind } | undefined => {
    const id = app.contextMenuHitTest(node => !!node.dataset.id)?.dataset.id;
    const widget = [
      ...app.shell.widgets('main'),
      ...app.shell.widgets('down')
    ].find(w => w.id === id);
    const kind = widget
      ? classifyTab(widget, w => docManager.contextForWidget(w))
      : null;
    return widget && kind ? { widget, kind } : undefined;
  };

  // The open menu's label follows the snapshot and the bookmarks: Lumino menus redraw only on update().
  const redraw = (): void => {
    app.commands.notifyCommandChanged(CommandIds.toggleTab);
    app.contextMenu.menu.update();
  };
  snapshot.changed.connect(redraw);
  store.changed.connect(redraw);
  // The menu opens with the snapshot; its opening reads the terminals again.
  app.contextMenu.opened.connect(() => {
    if (tab()?.kind.kind === 'terminal') {
      void snapshot.refresh();
    }
  });

  // Execute performs the verb the label showed: Add never removes.
  let remove = false;

  app.commands.addCommand(CommandIds.toggleTab, {
    describedBy: NO_ARGS,
    label: () => {
      const target = tab();
      remove =
        !!target &&
        !!findNode(
          store.bookmarks[SECTION[target.kind.kind]],
          tabMatches(target.kind, snapshot.terminals, baseUrl)
        );
      return remove ? 'Remove Tab from Bookmarks' : 'Add Tab to Bookmarks';
    },
    isVisible: () => !!tab(),
    execute: async () => {
      const target = tab();
      if (!target) {
        return;
      }
      const { widget, kind } = target;
      if (remove) {
        await store.update(SECTION[kind.kind], nodes =>
          removeNodes(nodes, tabMatches(kind, snapshot.terminals, baseUrl))
        );
        return;
      }
      await addTabBookmark(app, store, snapshot, widget, kind);
    }
  });

  for (const selector of [
    '#jp-main-dock-panel .lm-DockPanel-tabBar .lm-TabBar-tab',
    '#jp-down-stack .lm-TabBar-tab[data-id]'
  ]) {
    app.contextMenu.addItem({
      command: CommandIds.toggleTab,
      selector,
      rank: 25
    });
  }
}
