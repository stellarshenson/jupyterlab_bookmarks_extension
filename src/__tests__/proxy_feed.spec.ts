import { JupyterFrontEnd } from '@jupyterlab/application';
import { IStateDB } from '@jupyterlab/statedb';
import { BookmarkStore } from '../model/store';
import { followProxyOpens } from '../recent/proxy_feed';
import { IHeldOpen, RecentProxyStore } from '../recent/recent';
import { requestAPI } from '../request';

jest.mock('../request', () => ({ requestAPI: jest.fn() }));

const BASE = 'http://lab/user/a/';
const SCHEMA =
  'https://github.com/stellarshenson/jupyterlab_bookmarks_extension/events/proxy-open';
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
    const recent = new RecentProxyStore(state);
    followProxyOpens(app, recent, bookmarkStore);
    await settled();
    return recent;
  };

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
      { url: '/user/a/proxy/1/b', openedAt: 20, newBrowserTab: null }
    ];
    const recent = await started();
    expect(recent.entries).toEqual([
      {
        url: `${BASE}proxy/1/b`,
        title: 'Read title',
        newBrowserTab: false,
        id: `server-proxy:${BASE}proxy/1/b`,
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
        openedAt: clicked + 5
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
