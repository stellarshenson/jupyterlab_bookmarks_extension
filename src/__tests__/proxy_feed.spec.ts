import { JupyterFrontEnd } from '@jupyterlab/application';
import { IStateDB } from '@jupyterlab/statedb';
import { BookmarkStore } from '../model/store';
import { followFrameLoads, followProxyOpens } from '../recent/proxy_feed';
import { IHeldOpen, RecentProxyStore } from '../recent/recent';
import { requestAPI } from '../request';

jest.mock('../request', () => ({ requestAPI: jest.fn() }));

const BASE = 'http://lab/user/a/';
const SCHEMA =
  'https://github.com/stellarshenson/jupyterlab_bookmarks_extension/events/proxy-open';
const ROW_URL = `${BASE}proxy/1/a`;
const settled = () => new Promise(resolve => setTimeout(resolve));

describe('recent/proxy_feed', () => {
  let held: IHeldOpen[];
  let send: (event: { schema_id: string }) => void;
  let reads: jest.Mock;
  let values: Map<string, unknown>;

  const app = {
    serviceManager: {
      serverSettings: { baseUrl: BASE },
      events: {
        stream: {
          connect: (listener: (sender: unknown, event: unknown) => void) => {
            send = event => listener(null, event);
          }
        }
      }
    }
  } as unknown as JupyterFrontEnd;
  const bookmarkStore = { recentProxyTtlDays: 100000 } as BookmarkStore;

  const started = async (): Promise<RecentProxyStore> => {
    const state = {
      fetch: async (id: string) => values.get(id),
      save: async (id: string, value: unknown) => {
        values.set(id, value);
      }
    } as unknown as IStateDB;
    const recent = new RecentProxyStore(state, BASE);
    followProxyOpens(app, recent, bookmarkStore);
    await settled();
    return recent;
  };

  /** `started`, with a row for `ROW_URL` that a click or the popup gave. */
  const startedWithRow = async (): Promise<RecentProxyStore> => {
    const recent = await started();
    await recent.record(
      { url: ROW_URL, title: 'Typed', newBrowserTab: true },
      100000
    );
    return recent;
  };

  /** Holds the next read of the server's list until the returned function runs. */
  const holdList = (): (() => void) => {
    let answer!: () => void;
    const answered = new Promise<void>(resolve => (answer = resolve));
    (requestAPI as jest.Mock).mockImplementationOnce(async () => {
      await answered;
      return held;
    });
    return answer;
  };

  /** Holds every title read until the returned function runs. */
  const holdTitles = (): (() => void) => {
    let answer!: () => void;
    const answered = new Promise<void>(resolve => (answer = resolve));
    const read = reads;
    window.fetch = (async (url: string) => {
      await answered;
      return read(url);
    }) as unknown as typeof fetch;
    return answer;
  };

  /** An open of `page` on port 1, the port of `ROW_URL`, or on `port`. */
  const heldOpen = (page: string, openedAt: number, port = 1): IHeldOpen => ({
    url: `/user/a/proxy/${port}/${page}`,
    openedAt,
    newBrowserTab: true
  });

  const urls = (recent: RecentProxyStore): string[] =>
    recent.entries.map(entry => entry.url);

  beforeEach(() => {
    values = new Map();
    held = [];
    (requestAPI as jest.Mock).mockImplementation(async () => held);
    reads = jest.fn(async (url: string) => ({
      ok: true,
      url,
      headers: new Map([['Content-Type', 'text/html']]),
      text: async () => '<title>Read title</title>'
    }));
    window.fetch = reads as unknown as typeof fetch;
    AbortSignal.timeout ??= () => new AbortController().signal;
  });

  it('takes the held pages at the start, named by their title, with their mode', async () => {
    held = [
      { url: '/user/a/proxy/1/a', openedAt: 10, newBrowserTab: true },
      { url: '/user/a/proxy/2/b', openedAt: 20, newBrowserTab: null }
    ];
    const recent = await started();
    expect(recent.entries).toEqual([
      {
        url: `${BASE}proxy/2/b`,
        title: 'Read title',
        newBrowserTab: false,
        id: `server-proxy:${BASE}proxy/2/b`,
        openedAt: 20
      },
      {
        url: `${BASE}proxy/1/a`,
        title: 'Read title',
        newBrowserTab: true,
        id: `server-proxy:${BASE}proxy/1/a`,
        openedAt: 10
      }
    ]);
  });

  it('reads on its own event only, and the same page twice is one row and one title read', async () => {
    const recent = await started();
    held = [{ url: '/user/a/proxy/1/a', openedAt: 10, newBrowserTab: true }];
    send({ schema_id: 'https://example.com/other' });
    await settled();
    expect(recent.entries).toEqual([]);

    send({ schema_id: SCHEMA });
    send({ schema_id: SCHEMA });
    await settled();
    expect(recent.entries).toHaveLength(1);
    expect(reads).toHaveBeenCalledTimes(1);
  });

  it('keeps the name of a listed page and does not read it', async () => {
    const recent = await started();
    await recent.record(
      { url: `${BASE}proxy/1/a`, title: 'Typed', newBrowserTab: true },
      100000
    );
    const clicked = recent.entries[0].openedAt;
    held = [
      { url: '/user/a/proxy/1/a', openedAt: clicked + 5, newBrowserTab: false }
    ];
    send({ schema_id: SCHEMA });
    await settled();
    expect(recent.entries).toEqual([
      {
        url: `${BASE}proxy/1/a`,
        title: 'Typed',
        newBrowserTab: true,
        openedAt: clicked + 5,
        namedBy: `${BASE}proxy/1/a`
      }
    ]);
    expect(reads).not.toHaveBeenCalled();
  });

  it('does not bring back a removed page at the next start, and reads when the page shows again', async () => {
    held = [{ url: '/user/a/proxy/1/a', openedAt: 10, newBrowserTab: true }];
    const first = await started();
    await first.remove(`${BASE}proxy/1/a`);
    const second = await started();
    expect(second.entries).toEqual([]);

    held = [{ url: '/user/a/proxy/1/a', openedAt: 20, newBrowserTab: true }];
    document.dispatchEvent(new Event('visibilitychange'));
    await settled();
    expect(second.entries.map(entry => entry.openedAt)).toEqual([20]);
  });

  it('keeps a row removed during a title read away, and moves the watermark past it', async () => {
    const recent = await startedWithRow();
    const answer = holdTitles();
    held = [heldOpen('b', 5, 2), heldOpen('a', 6)];
    send({ schema_id: SCHEMA });
    await settled();

    await recent.remove(ROW_URL);
    answer();
    await settled();
    expect(urls(recent)).toEqual([`${BASE}proxy/2/b`]);
    expect(recent.taken).toBe(6);
  });

  it('keeps a row removed while the read of the server list is held away', async () => {
    const recent = await startedWithRow();
    const answer = holdList();
    held = [heldOpen('later', 5, 2), heldOpen('a', 6)];
    send({ schema_id: SCHEMA });
    await settled();

    await recent.remove(ROW_URL);
    answer();
    await settled();
    expect(urls(recent)).toEqual([`${BASE}proxy/2/later`]);
    expect(recent.taken).toBe(6);
  });

  it('keeps a row removed while an earlier read waits for a title away, with its reopen in the next read', async () => {
    const recent = await startedWithRow();
    const answer = holdTitles();
    held = [heldOpen('slow', 5, 2)];
    send({ schema_id: SCHEMA });
    await settled();
    held = [heldOpen('slow', 5, 2), heldOpen('a', 6)];
    send({ schema_id: SCHEMA });

    await recent.remove(ROW_URL);
    answer();
    await settled();
    expect(urls(recent)).toEqual([`${BASE}proxy/2/slow`]);
    expect(recent.taken).toBe(6);
  });

  it('keeps another page on the port of a removed row, seen before the removal, away', async () => {
    const recent = await startedWithRow();
    const answer = holdTitles();
    held = [heldOpen('other', 6)];
    send({ schema_id: SCHEMA });
    await settled();

    await recent.remove(ROW_URL);
    answer();
    await settled();
    expect(recent.entries).toEqual([]);
    expect(recent.taken).toBe(6);
  });

  it('keeps a removed row away when the event of its reopen comes after the removal', async () => {
    const recent = await startedWithRow();
    held = [heldOpen('a', 6)];

    await recent.remove(ROW_URL);
    await settled();
    expect(recent.taken).toBe(6);
    send({ schema_id: SCHEMA });
    await settled();
    expect(recent.entries).toEqual([]);
  });

  it('brings the row back for an open made after the read of its removal has finished', async () => {
    const recent = await startedWithRow();
    await recent.remove(ROW_URL);
    await settled();

    held = [heldOpen('a', 7)];
    send({ schema_id: SCHEMA });
    await settled();
    expect(urls(recent)).toEqual([ROW_URL]);
    expect(recent.taken).toBe(7);
  });

  it('names a row by the read title of a when one read holds b and then a', async () => {
    const recent = await startedWithRow();
    reads.mockImplementation(async (url: string) => ({
      ok: true,
      url,
      headers: new Map([['Content-Type', 'text/html']]),
      text: async () => `<title>Title of ${url.split('/').pop()}</title>`
    }));
    held = [heldOpen('b', 5), heldOpen('a', 6)];
    send({ schema_id: SCHEMA });
    await settled();
    expect(
      recent.entries.map(({ url, title, namedBy }) => [url, title, namedBy])
    ).toEqual([[ROW_URL, 'Title of a', ROW_URL]]);
  });

  it('adds no row for an in-app open with no listed row, and moves the watermark past it', async () => {
    const recent = await startedWithRow();
    await recent.remove(ROW_URL);
    await settled();

    held = [{ ...heldOpen('b', 5), inApp: true }];
    send({ schema_id: SCHEMA });
    await settled();
    expect(recent.entries).toEqual([]);
    expect(recent.taken).toBe(5);
  });

  it('renames the listed row of its port for an in-app open', async () => {
    const recent = await startedWithRow();
    held = [{ ...heldOpen('b', 5), inApp: true }];
    send({ schema_id: SCHEMA });
    await settled();
    expect(
      recent.entries.map(({ url, title, namedBy }) => [url, title, namedBy])
    ).toEqual([[ROW_URL, 'Read title', `${BASE}proxy/1/b`]]);
  });

  /** Fires `load` on a frame in the lab page that shows `href`; a null `title` is a cross-origin page. */
  const loadFrame = (href: string, title: string | null): void => {
    const frame = document.createElement('iframe');
    Object.defineProperty(frame, 'contentWindow', {
      value: {
        location: {
          get href() {
            if (title === null) {
              throw new DOMException('Blocked a frame', 'SecurityError');
            }
            return href;
          }
        }
      }
    });
    Object.defineProperty(frame, 'contentDocument', {
      value: title === null ? null : { title }
    });
    document.body.appendChild(frame);
    frame.dispatchEvent(new Event('load'));
    frame.remove();
  };

  it('renames a listed row when its frame loads another page of the port', async () => {
    const recent = await startedWithRow();
    followFrameLoads(recent, bookmarkStore, BASE);
    loadFrame(`${BASE}proxy/1/b?token=FAKE#top`, 'Beta');
    await settled();
    expect(recent.entries).toEqual([
      expect.objectContaining({
        url: ROW_URL,
        title: 'Beta',
        newBrowserTab: true,
        namedBy: `${BASE}proxy/1/b`
      })
    ]);
  });

  it('changes nothing for a frame of an unlisted port or a cross-origin frame', async () => {
    const recent = await startedWithRow();
    followFrameLoads(recent, bookmarkStore, BASE);
    const before = recent.entries;
    loadFrame(`${BASE}proxy/2/b`, 'Other');
    loadFrame(`${BASE}proxy/1/b`, null);
    await settled();
    expect(recent.entries).toBe(before);
  });

  it('warns and keeps reading after a failed read', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation();
    (requestAPI as jest.Mock).mockRejectedValueOnce(new Error('down'));
    const recent = await started();
    expect(warn).toHaveBeenCalledTimes(1);
    held = [{ url: '/user/a/proxy/1/a', openedAt: 10, newBrowserTab: true }];
    send({ schema_id: SCHEMA });
    await settled();
    expect(recent.entries).toHaveLength(1);
    warn.mockRestore();
  });
});
