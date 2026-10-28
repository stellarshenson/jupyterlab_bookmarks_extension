import { IStateDB } from '@jupyterlab/statedb';
import { ReadonlyPartialJSONValue } from '@lumino/coreutils';
import { ISignal, Signal } from '@lumino/signaling';
import { toStoredUrl } from '../link/link_url';
import { bookmarksIn } from '../model/tree';
import { ILink, Node } from '../model/types';

/** The state database key of the Recent Proxy list. */
export const RECENT_STATE_ID = 'jupyterlab_bookmarks_extension:recent-proxy';

export const DAY_MS = 24 * 60 * 60 * 1000;

/** A row older than this is drawn dimmed (design system, recency emphasis). */
export const STALE_MS = 7 * DAY_MS;

/** One page opened through the command `server-proxy:open`, as it was first opened. */
export interface IRecentProxyEntry {
  /** The absolute URL of the page. */
  url: string;
  /** The title the command ran with. */
  title: string;
  /** The page opened in a browser tab, never in a lab tab. */
  newBrowserTab: boolean;
  /** The widget id the command opened, for a lab tab. */
  id?: string;
  /** Milliseconds since the epoch of the last open. */
  openedAt: number;
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

/** The entries whose page no link bookmarks; a link's stored URL and the page's absolute URL compare in the stored form. */
export function recentWithoutBookmarks(
  entries: readonly IRecentProxyEntry[],
  links: Node[],
  baseUrl: string
): IRecentProxyEntry[] {
  const bookmarked = new Set(
    bookmarksIn(links)
      .filter((node): node is ILink => node.kind === 'link')
      .map(node => toStoredUrl(node.url, baseUrl))
  );
  return entries.filter(
    entry => !bookmarked.has(toStoredUrl(entry.url, baseUrl))
  );
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

/**
 * The Recent Proxy list, kept in the state database so it stays out of the
 * settings file, which holds the bookmarks.
 */
export class RecentProxyStore {
  constructor(private _state: IStateDB) {}

  get entries(): IRecentProxyEntry[] {
    return this._entries;
  }

  /** Emits after every record and every removal. */
  get changed(): ISignal<this, void> {
    return this._changed;
  }

  async load(): Promise<void> {
    const stored = await this._state.fetch(RECENT_STATE_ID);
    this._entries = Array.isArray(stored)
      ? (stored as unknown as IRecentProxyEntry[])
      : [];
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
  private _changed = new Signal<this, void>(this);
}
