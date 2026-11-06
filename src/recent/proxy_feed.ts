import { JupyterFrontEnd } from '@jupyterlab/application';
import { BookmarkStore } from '../model/store';
import { requestAPI } from '../request';
import {
  IHeldOpen,
  IRecentProxyEntry,
  listedUrl,
  opensAfter,
  proxyKey,
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
  // The services of the removals whose read has not finished, one item per removal.
  const removing: string[] = [];

  const asEntry = async (
    open: IHeldOpen,
    url: string,
    named: boolean
  ): Promise<IRecentProxyEntry> => {
    // The page that last named a row keeps that name, so its title is not read again.
    const title = named
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
    // The page that names each row, as it stands after the earlier opens of this read.
    const namedBy = new Map(
      recent.entries.map(entry => [
        proxyKey(entry.url, baseUrl),
        entry.namedBy ?? entry.url
      ])
    );
    const seen = await Promise.all(
      opens.map(open => {
        const url = new URL(open.url, baseUrl).href;
        const key = proxyKey(url, baseUrl);
        const named = namedBy.get(key) === url;
        namedBy.set(key, url);
        return asEntry(open, url, named);
      })
    );
    // No await from here into takeSeen, so a removal comes before this filter or after the merge.
    const listed = new Set(
      recent.entries.map(entry => proxyKey(entry.url, baseUrl))
    );
    await recent.takeSeen(
      seen.filter((page, index) => {
        const key = proxyKey(page.url, baseUrl);
        // An in-app open renames the row of its service, listed now or by an earlier open of this read, and adds none.
        if (
          removing.includes(key) ||
          (opens[index].inApp && !listed.has(key))
        ) {
          return false;
        }
        listed.add(key);
        return true;
      }),
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
    const key = proxyKey(url, baseUrl);
    removing.push(key);
    read();
    void queue.then(() => removing.splice(removing.indexOf(key), 1));
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

/**
 * Renames a listed row when a lab tab's page moves to another page of its service: a link
 * followed inside the app fires `load` on its frame in the lab page, while a frame the app
 * embeds fires its `load` inside the app's own page. Never adds a row.
 */
export function followFrameLoads(
  recent: RecentProxyStore,
  store: BookmarkStore,
  baseUrl: string
): void {
  document.addEventListener(
    'load',
    event => {
      const frame = event.target;
      if (!(frame instanceof HTMLIFrameElement)) {
        return;
      }
      let url: string;
      let title: string;
      try {
        url = listedUrl(frame.contentWindow!.location.href);
        title = frame.contentDocument!.title;
      } catch {
        // A cross-origin or empty frame.
        return;
      }
      const key = proxyKey(url, baseUrl);
      if (recent.entries.some(entry => proxyKey(entry.url, baseUrl) === key)) {
        void recent.takeSeen(
          [
            {
              url,
              title: title || seenFallbackName(url, baseUrl),
              newBrowserTab: false,
              openedAt: Date.now()
            }
          ],
          recent.taken,
          store.recentProxyTtlDays
        );
      }
    },
    true
  );
}
