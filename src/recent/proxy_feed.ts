import { JupyterFrontEnd } from '@jupyterlab/application';
import { BookmarkStore } from '../model/store';
import { requestAPI } from '../request';
import {
  IHeldOpen,
  IRecentProxyEntry,
  opensAfter,
  readServiceName,
  RecentProxyStore,
  seenFallbackName
} from './recent';

/** The `$id` of `events/proxy_open.yaml` in the Python package. */
const PROXY_OPEN_SCHEMA =
  'https://github.com/stellarshenson/jupyterlab_bookmarks_extension/events/proxy-open';

/**
 * Loads the Proxy section's list and keeps it up with the pages the proxy saw:
 * reads the server's list after the load, on each event that says it changed,
 * and when the lab page shows again, because a hidden page can lose its event
 * socket. A removal adds a read, and every open that read or an earlier one
 * answers stays out of the list, with the watermark past it.
 */
export function followProxyOpens(
  app: JupyterFrontEnd,
  recent: RecentProxyStore,
  store: BookmarkStore
): void {
  const { events, serverSettings } = app.serviceManager;
  const baseUrl = serverSettings.baseUrl;
  // The URLs of the removals whose read has not finished, one item per removal.
  const removing: string[] = [];

  const asEntry = async (
    open: IHeldOpen,
    listed: Set<string>
  ): Promise<IRecentProxyEntry> => {
    const url = new URL(open.url, baseUrl).href;
    // A listed page keeps its name, so its title is not read again.
    const title = listed.has(url)
      ? url
      : (await readServiceName(url, seenFallbackName(url, baseUrl))).title;
    return {
      url,
      title,
      newBrowserTab: open.newBrowserTab === true,
      id: `server-proxy:${url}`,
      openedAt: open.openedAt
    };
  };

  const take = async (): Promise<void> => {
    const held = await requestAPI<IHeldOpen[]>('proxy-opens', serverSettings);
    const opens = opensAfter(held, recent.taken);
    if (opens.length === 0) {
      return;
    }
    const listed = new Set(recent.entries.map(entry => entry.url));
    const seen = await Promise.all(opens.map(open => asEntry(open, listed)));
    // No await from here into takeSeen, so a removal comes before this filter or after the merge.
    await recent.takeSeen(
      seen.filter(page => !removing.includes(page.url)),
      opens[opens.length - 1].openedAt,
      store.recentProxyTtlDays
    );
  };

  // One read at a time, so that an event during the title reads does not take the same opens twice.
  let queue = recent.load();
  const read = (): void => {
    queue = queue
      .then(take)
      .catch(reason =>
        console.warn('Could not read the pages the proxy saw', reason)
      );
  };

  recent.removed.connect((_, url) => {
    removing.push(url);
    read();
    void queue.then(() => removing.splice(removing.indexOf(url), 1));
  });
  events.stream.connect((_, event) => {
    if (event.schema_id === PROXY_OPEN_SCHEMA) {
      read();
    }
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      read();
    }
  });
  read();
}
