import { JupyterFrontEnd } from '@jupyterlab/application';
import { IRecentProxyEntry } from './recent';

/**
 * Reopens a recent proxy page the way it was first opened: the lab tab with
 * the same widget id, activated when it is open, or a new browser tab.
 */
export function openRecent(
  app: JupyterFrontEnd,
  entry: IRecentProxyEntry
): Promise<unknown> {
  return app.commands.execute('server-proxy:open', {
    url: entry.url,
    title: entry.title,
    newBrowserTab: entry.newBrowserTab,
    id: entry.id
  });
}
