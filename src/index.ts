import {
  ILayoutRestorer,
  JupyterFrontEnd,
  JupyterFrontEndPlugin
} from '@jupyterlab/application';
import { IDocumentManager } from '@jupyterlab/docmanager';
import { ISettingRegistry } from '@jupyterlab/settingregistry';
import { IStateDB } from '@jupyterlab/statedb';
import { ITranslator, nullTranslator } from '@jupyterlab/translation';
import { addCommands } from './commands';
import { TabMarks } from './mark/marks';
import { BookmarkStore, PLUGIN_ID } from './model/store';
import { BookmarksPanel } from './panel/bookmarks_panel';
import { addTabDrop } from './panel/tab_drop';
import { RecentProxyStore } from './recent/recent';
import { TerminalSnapshot } from './session/terminal_snapshot';
import { addTabMenu } from './tab_menu';

/** The command that opens a page through the lab's server proxy. */
const SERVER_PROXY_OPEN = 'server-proxy:open';

/**
 * The bookmarks side panel, its commands, the tab-menu item and the Recent
 * Proxy list that every run of `server-proxy:open` feeds.
 */
const plugin: JupyterFrontEndPlugin<void> = {
  id: PLUGIN_ID,
  description:
    'Bookmarks side panel for web pages, files and terminal sessions, in folders, with tab menu actions',
  autoStart: true,
  requires: [ISettingRegistry, IDocumentManager, IStateDB],
  optional: [ILayoutRestorer, ITranslator],
  activate: async (
    app: JupyterFrontEnd,
    registry: ISettingRegistry,
    docManager: IDocumentManager,
    state: IStateDB,
    restorer: ILayoutRestorer | null,
    translator: ITranslator | null
  ) => {
    const trans = (translator ?? nullTranslator).load(
      'jupyterlab_bookmarks_manager_extension'
    );
    console.log(
      'JupyterLab extension jupyterlab_bookmarks_manager_extension is activated!'
    );
    const store = new BookmarkStore(registry, await registry.load(PLUGIN_ID));
    const recent = new RecentProxyStore(state);
    // One terminal snapshot feeds the tab menu's label and the marks.
    const snapshot = new TerminalSnapshot(
      app.serviceManager.serverSettings,
      app.serviceManager.terminals
    );
    const marks = new TabMarks(app, store, docManager, snapshot);
    const panel = new BookmarksPanel(
      app,
      store,
      recent,
      docManager.registry,
      marks,
      trans
    );
    // Never await the state database here: its fetch waits for the workspace load, which runs
    // after every plugin has activated, so awaiting it inside activate would deadlock the start.
    void recent.load();
    app.shell.add(panel, 'left', { rank: 600, type: 'Bookmarks' });
    restorer?.add(panel, panel.id);
    addCommands(app, store, recent, trans);
    addTabMenu(app, store, docManager, snapshot);
    addTabDrop(app, store, docManager, snapshot);
    app.commands.commandExecuted.connect((_, { id, args }) => {
      const url = typeof args.url === 'string' ? args.url : '';
      if (id !== SERVER_PROXY_OPEN || !url) {
        return;
      }
      void recent.record(
        {
          url,
          title:
            typeof args.title === 'string' && args.title ? args.title : url,
          newBrowserTab: args.newBrowserTab === true,
          id: typeof args.id === 'string' ? args.id : undefined
        },
        store.recentProxyTtlDays
      );
    });
  }
};

export default plugin;
