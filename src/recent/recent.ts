import { IStateDB } from '@jupyterlab/statedb';
import { ReadonlyPartialJSONValue } from '@lumino/coreutils';
import { ISignal, Signal } from '@lumino/signaling';
import { toStoredUrl } from '../link/link_url';
import { bookmarksIn } from '../model/tree';
import { ILink, Node } from '../model/types';

/** The command that opens a page through the lab's server proxy. */
export const SERVER_PROXY_OPEN = 'server-proxy:open';

/** The state database key of the Proxy section's list. */
export const RECENT_STATE_ID =
  'jupyterlab_bookmarks_manager_extension:recent-proxy';

/** The state database key of the newest server `openedAt` the list has taken, so a removed row stays removed. */
export const TAKEN_STATE_ID = `${RECENT_STATE_ID}-taken`;

/**
 * The longest read of a page's title. A browser tab opens after the read, and
 * `window.open` needs the click's user activation, which browsers keep for 5 s.
 */
const READ_TIMEOUT_MS = 3000;

/** The query parameters no recorded URL keeps, matched as substrings: `SECRET_KEYS` of `proxy_tap.py`. */
const SECRET_KEYS = ['token', 'auth', 'key', 'code', 'state', 'xsrf'];

export const DAY_MS = 24 * 60 * 60 * 1000;

/** A row older than this is drawn dimmed (design system, recency emphasis). */
export const STALE_MS = 7 * DAY_MS;

/** One page opened through the lab's server proxy, as it was first opened. */
export interface IRecentProxyEntry {
  /** The absolute URL of the page, in the form of `listedUrl`. */
  url: string;
  /** The name the row shows: typed in the popup, or the page's title. */
  title: string;
  /** The page opened in a browser tab, never in a lab tab. */
  newBrowserTab: boolean;
  /** The widget id of a lab tab that `server-proxy:open` creates or reuses. */
  id?: string;
  /** Milliseconds since the epoch of the last open, by the server's clock or the browser's. */
  openedAt: number;
}

/** One page the proxy saw, as the server's route `proxy-opens` answers it. */
export interface IHeldOpen {
  /** The path and query of the request, the secrets removed. */
  url: string;
  /** Milliseconds since the epoch, by the server's clock. */
  openedAt: number;
  /** Null when the browser sent no fetch metadata. */
  newBrowserTab: boolean | null;
}

/** The entries opened within the last `ttlDays` days; an entry exactly at the limit stays. */
export function pruneRecent(
  entries: readonly IRecentProxyEntry[],
  ttlDays: number,
  now: number
): IRecentProxyEntry[] {
  return entries.filter(entry => now - entry.openedAt <= ttlDays * DAY_MS);
}

/** `entry` first, the same page's older record dropped, the expired entries gone. */
export function recordRecent(
  entries: readonly IRecentProxyEntry[],
  entry: IRecentProxyEntry,
  ttlDays: number,
  now: number
): IRecentProxyEntry[] {
  return [
    entry,
    ...pruneRecent(
      entries.filter(older => older.url !== entry.url),
      ttlDays,
      now
    )
  ];
}

/**
 * `seen`, a page the proxy saw, first. A listed page keeps its name, mode and id, and
 * keeps an `openedAt` newer than `seen`: the browser's clock can run ahead of the server's.
 */
export function mergeSeen(
  entries: readonly IRecentProxyEntry[],
  seen: IRecentProxyEntry,
  ttlDays: number,
  now: number
): IRecentProxyEntry[] {
  const listed = entries.find(entry => entry.url === seen.url);
  return recordRecent(
    entries,
    listed
      ? { ...listed, openedAt: Math.max(listed.openedAt, seen.openedAt) }
      : seen,
    ttlDays,
    now
  );
}

/** The held opens newer than `taken`, oldest first; both sides are the server's clock. */
export function opensAfter(
  held: readonly IHeldOpen[],
  taken: number
): IHeldOpen[] {
  return held
    .filter(open => open.openedAt > taken)
    .sort((a, b) => a.openedAt - b.openedAt);
}

/**
 * The form a page is listed under, which is the form the proxy's request gives after
 * `new URL`: encoded as a browser sends it, with no fragment and no secret in its query.
 */
export function listedUrl(url: string): string {
  const parsed = new URL(url);
  parsed.hash = '';
  parsed.search = parsed.search
    .slice(1)
    .split('&')
    .filter(pair => {
      const name = pair.split('=')[0].toLowerCase();
      return !SECRET_KEYS.some(key => name.includes(key));
    })
    .join('&');
  return parsed.href;
}

/** The entries whose page no link bookmarks; a link's URL, which can hold a secret, and the page's URL compare in the listed form. */
export function recentWithoutBookmarks(
  entries: readonly IRecentProxyEntry[],
  links: Node[],
  baseUrl: string
): IRecentProxyEntry[] {
  const listed = (url: string): string => listedUrl(new URL(url, baseUrl).href);
  const bookmarked = new Set(
    bookmarksIn(links)
      .filter((node): node is ILink => node.kind === 'link')
      .map(node => listed(node.url))
  );
  return entries.filter(entry => !bookmarked.has(listed(entry.url)));
}

/** True when the title or the URL contains `query`, case ignored. */
export function matchesRecent(
  entry: IRecentProxyEntry,
  query: string
): boolean {
  return `${entry.title}\n${entry.url}`
    .toLowerCase()
    .includes(query.toLowerCase());
}

/** `now`, `Nm ago`, `Nh ago`, `Nd ago`, `Nmo ago`, `Ny ago`, with whole-number floors. */
export function formatAgo(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) {
    return 'now';
  }
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return `${minutes}m ago`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours}h ago`;
  }
  const days = Math.floor(hours / 24);
  if (days < 30) {
    return `${days}d ago`;
  }
  const months = Math.floor(days / 30);
  return months < 12 ? `${months}mo ago` : `${Math.floor(days / 365)}y ago`;
}

/** The path as the URL holds it: no surrounding white space, no leading slash. */
function pathSuffix(path: string): string {
  return path.trim().replace(/^\/+/, '');
}

/** The URL of the page at `port` and `path`, through the lab's server proxy. */
export function proxyPageUrl(
  baseUrl: string,
  port: number,
  path: string
): string {
  return `${baseUrl}proxy/${port}/${pathSuffix(path)}`;
}

/** The service name of a page that has no title or does not answer. */
export function fallbackName(port: number, path: string): string {
  const suffix = pathSuffix(path);
  return `Proxy :${port}${suffix && `/${suffix}`}`;
}

/** The name of a page the proxy saw with no title: `fallbackName` when its URL holds a port, else its path under the lab, as a named server's has. */
export function seenFallbackName(url: string, baseUrl: string): string {
  const stored = toStoredUrl(url, baseUrl);
  const match = /^proxy\/(?:absolute\/)?(?:[^/]*:)?(\d+)\/?(.*)$/.exec(stored);
  return match ? fallbackName(Number(match[1]), match[2]) : stored;
}

/** The `<title>` of an HTML page, white space collapsed; `DOMParser` runs no scripts. */
export function parseTitle(html: string): string {
  const page = new DOMParser().parseFromString(html, 'text/html');
  return page.title.replace(/\s+/g, ' ').trim();
}

/** What a read of a page gave: its service name and the URL it ended at after any redirect. */
export interface IPageRead {
  title: string;
  url: string;
}

/**
 * Reads the page at `url`; the name is `fallback` for no title, a non-HTML answer, a failed request or a timeout.
 * A plain `fetch`, because the proxy passes the token and XSRF header of `ServerConnection` to whatever listens on the port.
 */
export async function readServiceName(
  url: string,
  fallback: string
): Promise<IPageRead> {
  try {
    // no-store: the HTTP cache holds a second read of one URL until the first ends, which spends the limit.
    const response = await fetch(url, {
      cache: 'no-store',
      signal: AbortSignal.timeout(READ_TIMEOUT_MS)
    });
    const type = response.headers.get('Content-Type') ?? '';
    const title =
      response.ok && /^text\/html/i.test(type)
        ? parseTitle(await response.text())
        : '';
    return { title: title || fallback, url: response.url || url };
  } catch {
    return { title: fallback, url };
  }
}

/**
 * The Proxy section's list, kept in the state database so it stays out of the
 * settings file, which holds the bookmarks.
 */
export class RecentProxyStore {
  constructor(private _state: IStateDB) {}

  get entries(): IRecentProxyEntry[] {
    return this._entries;
  }

  /** The newest server `openedAt` the list has taken. */
  get taken(): number {
    return this._taken;
  }

  /** Emits after every record and every removal. */
  get changed(): ISignal<this, void> {
    return this._changed;
  }

  async load(): Promise<void> {
    const [stored, taken] = await Promise.all([
      this._state.fetch(RECENT_STATE_ID),
      this._state.fetch(TAKEN_STATE_ID)
    ]);
    this._entries = Array.isArray(stored)
      ? (stored as unknown as IRecentProxyEntry[])
      : [];
    this._taken = typeof taken === 'number' ? taken : 0;
    this._changed.emit();
  }

  /** Records an open at the top of the list. */
  record(
    entry: Omit<IRecentProxyEntry, 'openedAt'>,
    ttlDays: number
  ): Promise<void> {
    const now = Date.now();
    this._entries = recordRecent(
      this._entries,
      { ...entry, openedAt: now },
      ttlDays,
      now
    );
    return this._save();
  }

  /** Merges pages the proxy saw, oldest first, and remembers the newest as taken. */
  async takeSeen(seen: IRecentProxyEntry[], ttlDays: number): Promise<void> {
    if (seen.length === 0) {
      return;
    }
    const now = Date.now();
    this._entries = seen.reduce(
      (entries, page) => mergeSeen(entries, page, ttlDays, now),
      this._entries
    );
    this._taken = seen[seen.length - 1].openedAt;
    await Promise.all([
      this._save(),
      this._state.save(TAKEN_STATE_ID, this._taken)
    ]);
  }

  remove(url: string): Promise<void> {
    this._entries = this._entries.filter(entry => entry.url !== url);
    return this._save();
  }

  private _save(): Promise<void> {
    this._changed.emit();
    return this._state.save(
      RECENT_STATE_ID,
      this._entries as unknown as ReadonlyPartialJSONValue
    );
  }

  private _entries: IRecentProxyEntry[] = [];
  private _taken = 0;
  private _changed = new Signal<this, void>(this);
}
