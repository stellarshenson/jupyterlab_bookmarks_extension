import { JupyterFrontEnd } from '@jupyterlab/application';
import { MainAreaWidget } from '@jupyterlab/apputils';
import { classifyTab } from '../classify/tab_kind';
import {
  IRecentProxyEntry,
  listedUrl,
  seenFallbackName,
  SERVER_PROXY_OPEN
} from './recent';

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
  // A later page of the app named the row: the tab opens with the address label, never the left page's name,
  // and takes the name of the page it opens once that page loads.
  const renamed = (entry.namedBy ?? entry.url) !== entry.url;
  const address = seenFallbackName(
    entry.url,
    app.serviceManager.serverSettings.baseUrl
  );
  const widget = await app.commands.execute(SERVER_PROXY_OPEN, {
    url: entry.url,
    title: renamed ? address : entry.title,
    newBrowserTab: entry.newBrowserTab,
    id: entry.id
  });
  const frame =
    widget instanceof MainAreaWidget && renamed
      ? widget.node.querySelector('iframe')
      : null;
  frame?.addEventListener(
    'load',
    () => {
      widget.content.title.label = frame.contentDocument?.title || address;
    },
    { once: true }
  );
  return widget;
}
