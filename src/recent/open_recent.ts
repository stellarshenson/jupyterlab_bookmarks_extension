import { JupyterFrontEnd } from '@jupyterlab/application';
import { classifyTab } from '../classify/tab_kind';
import { IRecentProxyEntry, listedUrl, SERVER_PROXY_OPEN } from './recent';

/**
 * Reopens a Proxy section page the way it was first opened: the lab tab that
 * shows it, activated when it is open, or a new browser tab.
 */
export async function openRecent(
  app: JupyterFrontEnd,
  entry: IRecentProxyEntry
): Promise<unknown> {
  // A tab another route opened has another widget id, so it is found by its address.
  const open = entry.newBrowserTab
    ? undefined
    : [...app.shell.widgets('main')].find(widget => {
        const tab = classifyTab(widget, () => undefined);
        if (tab?.kind !== 'link') {
          return false;
        }
        // The page can move inside its tab; src keeps the address it opened at. An empty src would throw in listedUrl.
        const opened = widget.node.querySelector('iframe')?.src || tab.url;
        return (
          listedUrl(tab.url) === entry.url || listedUrl(opened) === entry.url
        );
      });
  if (open) {
    app.shell.activateById(open.id);
    return;
  }
  return app.commands.execute(SERVER_PROXY_OPEN, {
    url: entry.url,
    title: entry.title,
    newBrowserTab: entry.newBrowserTab,
    id: entry.id
  });
}
