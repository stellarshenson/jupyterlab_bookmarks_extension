import { IStateDB } from '@jupyterlab/statedb';
import {
  fallbackName,
  formatAgo,
  IHeldOpen,
  IRecentProxyEntry,
  listedUrl,
  mergeSeen,
  opensAfter,
  parseTitle,
  proxyPageUrl,
  proxyKey,
  pruneRecent,
  RecentProxyStore,
  recordRecent,
  seenFallbackName
} from '../recent/recent';

const DAY = 24 * 60 * 60 * 1000;
// A fixed clock: the expiry test reads the same `now` for every age.
const NOW = Date.UTC(2026, 9, 28, 12, 0, 0);
// The lab's base URL; a bare name like `a` is a URL under it.
const BASE = 'http://lab/user/a/';

const entry = (
  url: string,
  openedAt: number,
  title = url
): IRecentProxyEntry => ({ url, title, newBrowserTab: false, openedAt });

describe('recent/recent', () => {
  it('expires at a fixed clock of 2, 3 and 4 days with a ttl of 3', () => {
    const entries = [
      entry('two', NOW - 2 * DAY),
      entry('three', NOW - 3 * DAY),
      entry('four', NOW - 4 * DAY)
    ];
    expect(pruneRecent(entries, 3, NOW).map(e => e.url)).toEqual([
      'two',
      'three'
    ]);
    expect(pruneRecent(entries, 0, NOW)).toEqual([]);
  });

  it('moves a reopened page to the top and keeps one row per page', () => {
    const entries = [entry('b', NOW - 1000), entry('a', NOW - 2000)];
    expect(
      recordRecent(entries, entry('a', NOW), 3, NOW, BASE).map(e => e.url)
    ).toEqual(['a', 'b']);
    expect(recordRecent(entries, entry('a', NOW), 3, NOW, BASE)).toHaveLength(
      2
    );
  });

  it('keeps an entry whose page a link bookmarks, so the Proxy list shows it', () => {
    const entries = [entry('http://lab/proxy/8501/', NOW)];
    expect(pruneRecent(entries, 3, NOW).map(e => e.url)).toEqual([
      'http://lab/proxy/8501/'
    ]);
  });

  it('labels the age with whole-number floors', () => {
    expect(formatAgo(59_000)).toBe('now');
    expect(formatAgo(60_000)).toBe('1m ago');
    expect(formatAgo(2 * 60 * 60_000)).toBe('2h ago');
    expect(formatAgo(3 * DAY)).toBe('3d ago');
    expect(formatAgo(45 * DAY)).toBe('1mo ago');
    expect(formatAgo(400 * DAY)).toBe('1y ago');
  });

  it('builds the proxy URL with one slash after the port', () => {
    const base = 'http://lab/user/a/';
    expect(proxyPageUrl(base, 5555, '/x')).toBe(
      'http://lab/user/a/proxy/5555/x'
    );
    expect(proxyPageUrl(base, 5555, 'x/y?z=1')).toBe(
      'http://lab/user/a/proxy/5555/x/y?z=1'
    );
    expect(proxyPageUrl(base, 5555, ' //x ')).toBe(
      'http://lab/user/a/proxy/5555/x'
    );
    expect(proxyPageUrl(base, 5555, '')).toBe('http://lab/user/a/proxy/5555/');
  });

  it('builds the fallback name with one leading slash on the path', () => {
    expect(fallbackName(5555, '/x')).toBe('Proxy :5555/x');
    expect(fallbackName(5555, 'x')).toBe('Proxy :5555/x');
    expect(fallbackName(5555, '')).toBe('Proxy :5555');
    expect(fallbackName(5555, '/')).toBe('Proxy :5555');
  });

  it('reads a page title with its white space collapsed', () => {
    expect(
      parseTitle('<html><head><title> My\n  Service\t</title></head></html>')
    ).toBe('My Service');
  });

  it('reads an empty title from a page without one', () => {
    expect(parseTitle('<html><body><h1>Title</h1></body></html>')).toBe('');
    expect(parseTitle('<title>  </title>')).toBe('');
    expect(parseTitle('')).toBe('');
  });

  it('keeps markup in a title as text', () => {
    expect(parseTitle('<title>&lt;b&gt;Bold&lt;/b&gt;</title>')).toBe(
      '<b>Bold</b>'
    );
  });

  describe('a page the proxy saw', () => {
    const typed: IRecentProxyEntry = {
      url: 'a',
      title: 'Typed',
      newBrowserTab: true,
      id: 'popup-id',
      openedAt: NOW - 5000
    };

    it('keeps the name, mode and id of a listed page, and moves it to the top', () => {
      const entries = [entry('b', NOW - 1000), typed];
      const merged = mergeSeen(entries, entry('a', NOW, 'Title'), 3, NOW, BASE);
      expect(merged.map(e => e.url)).toEqual(['a', 'b']);
      expect(merged[0]).toEqual({ ...typed, openedAt: NOW, namedBy: 'a' });
    });

    it('does not overwrite a newer browser-side time with an older observation', () => {
      const merged = mergeSeen([typed], entry('a', NOW - 9000), 3, NOW, BASE);
      expect(merged[0].openedAt).toBe(NOW - 5000);
    });

    it('lists a new page first, and the same observation twice as one row', () => {
      const once = mergeSeen([typed], entry('new', NOW, 'Title'), 3, NOW, BASE);
      expect(once.map(e => e.url)).toEqual(['new', 'a']);
      expect(once[0].title).toBe('Title');
      expect(mergeSeen(once, entry('new', NOW), 3, NOW, BASE)).toEqual([
        { ...once[0], namedBy: 'new' },
        once[1]
      ]);
    });

    it('shows no negative age when the server clock runs ahead', () => {
      expect(formatAgo(-5 * 60_000)).toBe('now');
      expect(pruneRecent([entry('ahead', NOW + DAY)], 3, NOW)).toHaveLength(1);
    });

    it('shows the age of the open from the server time, however late it is taken', () => {
      const late = mergeSeen([], entry('late', NOW - 3 * 60_000), 3, NOW, BASE);
      expect(formatAgo(NOW - late[0].openedAt)).toBe('3m ago');
    });

    it('takes only the opens newer than the watermark, oldest first', () => {
      const open = (url: string, openedAt: number): IHeldOpen => ({
        url,
        openedAt,
        newBrowserTab: null
      });
      const held = [open('c', 30), open('a', 10), open('b', 20)];
      expect(opensAfter(held, 10).map(o => o.url)).toEqual(['b', 'c']);
      expect(opensAfter(held, 30)).toEqual([]);
    });
  });

  describe('one row per proxied service', () => {
    const base = BASE;
    const at = (path: string, openedAt: number, title = path) =>
      entry(`${base}${path}`, openedAt, title);

    it('keys a URL by its host and port, a named route by its name, else by the URL', () => {
      expect(proxyKey(`${base}proxy/5555/x`, base)).toBe(':5555');
      expect(proxyKey(`${base}proxy/absolute/5555/`, base)).toBe(':5555');
      expect(proxyKey(`${base}proxy/5555`, base)).toBe(':5555');
      expect(proxyKey(`${base}proxy/localhost:5555/x`, base)).toBe(
        'localhost:5555'
      );
      expect(proxyKey(`${base}vapp/x/y`, base)).toBe('vapp');
      expect(proxyKey('http://other/proxy/5555/x', base)).toBe(
        'http://other/proxy/5555/x'
      );
    });

    it('reads the key under a base URL that itself holds /proxy/<port>/', () => {
      const proxied = 'http://lab/proxy/9999/';
      expect(proxyKey(`${proxied}proxy/5555/x`, proxied)).toBe(':5555');
      expect(proxyKey(`${proxied}proxy/5556/x`, proxied)).toBe(':5556');
      expect(proxyKey(`${proxied}vapp/x`, proxied)).toBe('vapp');
      expect(seenFallbackName(`${proxied}vapp/x`, proxied)).toBe('vapp/x');
    });

    it('names the row of a port by its second page and keeps the first URL', () => {
      const first = mergeSeen(
        [],
        at('proxy/5555/alpha', NOW - 1000),
        3,
        NOW,
        BASE
      );
      const merged = mergeSeen(first, at('proxy/5555/beta', NOW), 3, NOW, BASE);
      expect(merged).toEqual([
        {
          ...first[0],
          title: 'proxy/5555/beta',
          openedAt: NOW,
          namedBy: `${base}proxy/5555/beta`
        }
      ]);
      expect(merged[0].url).toBe(`${base}proxy/5555/alpha`);
    });

    it('keeps a typed name when the URL of the row is seen again', () => {
      const typed = at('proxy/5555/alpha', NOW - 1000, 'Typed');
      const merged = mergeSeen(
        [typed],
        at('proxy/5555/alpha', NOW),
        3,
        NOW,
        BASE
      );
      expect(merged).toEqual([{ ...typed, openedAt: NOW, namedBy: typed.url }]);
    });

    it('keeps a name typed in the popup at another path of a listed port through the echo', () => {
      const listed = mergeSeen(
        [],
        at('proxy/5555/alpha', NOW - 2000),
        3,
        NOW,
        BASE
      );
      const typed = recordRecent(
        listed,
        at('proxy/5555/beta', NOW - 1000, 'Typed'),
        3,
        NOW,
        BASE
      );
      const echoed = mergeSeen(typed, at('proxy/5555/beta', NOW), 3, NOW, BASE);
      expect(echoed.map(e => [e.url, e.title])).toEqual([
        [`${base}proxy/5555/alpha`, 'Typed']
      ]);
    });

    it('names the row by a after a, then b, then a again', () => {
      const pages = [
        at('proxy/5555/a', NOW - 2000, 'A'),
        at('proxy/5555/b', NOW - 1000, 'B'),
        at('proxy/5555/a', NOW, 'A')
      ];
      const merged = pages.reduce(
        (entries, page) => mergeSeen(entries, page, 3, NOW, BASE),
        [] as IRecentProxyEntry[]
      );
      expect(merged.map(e => e.title)).toEqual(['A']);
    });

    it('gives two ports two rows, two named routes two rows, and one named route one row', () => {
      const ports = mergeSeen(
        [at('proxy/5555/a', NOW - 1000)],
        at('proxy/5556/a', NOW),
        3,
        NOW,
        BASE
      );
      expect(ports.map(e => e.url)).toEqual([
        `${base}proxy/5556/a`,
        `${base}proxy/5555/a`
      ]);
      const named = mergeSeen(
        [at('vapp/a', NOW - 1000)],
        at('wapp/a', NOW),
        3,
        NOW,
        BASE
      );
      expect(named).toHaveLength(2);
      const route = mergeSeen(
        [at('vapp/a', NOW - 1000)],
        at('vapp/b', NOW),
        3,
        NOW,
        BASE
      );
      expect(route.map(e => [e.url, e.title])).toEqual([
        [`${base}vapp/a`, 'vapp/b']
      ]);
    });

    it('records an open on a listed port into its row', () => {
      const row: IRecentProxyEntry = {
        ...at('proxy/5555/alpha', NOW - 1000),
        newBrowserTab: true,
        id: 'row-id'
      };
      const recorded = recordRecent(
        [at('proxy/5556/', NOW - 2000), row],
        { ...at('proxy/5555/beta', NOW, 'Beta'), id: 'other-id' },
        3,
        NOW,
        BASE
      );
      expect(recorded).toEqual([
        {
          ...row,
          title: 'Beta',
          openedAt: NOW,
          namedBy: `${base}proxy/5555/beta`
        },
        at('proxy/5556/', NOW - 2000)
      ]);
    });

    it('loads a saved list with several rows of one port as its newest row', async () => {
      const values = new Map<string, unknown>([
        [
          'jupyterlab_bookmarks_manager_extension:recent-proxy',
          [
            at('proxy/5555/beta', NOW, 'Beta'),
            at('proxy/5556/', NOW - 1000),
            at('proxy/5555/alpha', NOW - 2000, 'Alpha')
          ]
        ]
      ]);
      const store = new RecentProxyStore(
        {
          fetch: async (id: string) => values.get(id)
        } as unknown as IStateDB,
        BASE
      );
      await store.load();
      expect(store.entries.map(e => e.title)).toEqual(['Beta', 'proxy/5556/']);
    });
  });

  describe('the URL a page is listed under', () => {
    const base = 'http://lab/user/a/';
    const seen = (uri: string) => new URL(uri, base).href;

    it('is the URL the proxy reports, for a popup page under a base URL', () => {
      for (const [path, uri] of [
        ['', '/user/a/proxy/5555/'],
        ['/x', '/user/a/proxy/5555/x'],
        ['/a b/é', '/user/a/proxy/5555/a%20b/%C3%A9'],
        ['/x?keep=1&token=FAKE', '/user/a/proxy/5555/x?keep=1'],
        ['/x?api_key=FAKE', '/user/a/proxy/5555/x'],
        ['/x#top', '/user/a/proxy/5555/x'],
        ['/x?', '/user/a/proxy/5555/x']
      ]) {
        expect(listedUrl(proxyPageUrl(base, 5555, path))).toBe(seen(uri));
      }
    });

    it('removes the secret keys of the server, and no other parameter', () => {
      expect(
        listedUrl(
          'http://lab/p?OAuth=a&code=b&state=c&_xsrf=d&KEY=e&barcode=f&password=g&keep'
        )
      ).toBe('http://lab/p?password=g&keep');
    });

    it('names a page with no title by its port and path, or its path', () => {
      for (const [uri, name] of [
        ['/user/a/proxy/5555/', 'Proxy :5555'],
        ['/user/a/proxy/5555', 'Proxy :5555'],
        ['/user/a/proxy/5555/x?y=1', 'Proxy :5555/x?y=1'],
        ['/user/a/proxy/absolute/5555/x', 'Proxy :5555/x'],
        ['/user/a/proxy/localhost:5555/x', 'Proxy :5555/x'],
        ['/user/a/proxy/absolute/127.0.0.1:5555/x', 'Proxy :5555/x'],
        ['/user/a/vapp/x', 'vapp/x']
      ]) {
        expect(seenFallbackName(seen(uri), base)).toBe(name);
      }
    });
  });

  describe('the watermark', () => {
    const memoryState = (): IStateDB => {
      const values = new Map<string, unknown>();
      return {
        fetch: async (id: string) => values.get(id),
        save: async (id: string, value: unknown) => {
          values.set(id, value);
        }
      } as unknown as IStateDB;
    };

    it('keeps a removed page out after a reload, and a later open brings it back', async () => {
      const state = memoryState();
      const first = new RecentProxyStore(state, BASE);
      await first.load();
      await first.takeSeen([entry('a', 100), entry('b', 200)], 200, 100000);
      expect(first.taken).toBe(200);
      await first.remove('a');

      const reloaded = new RecentProxyStore(state, BASE);
      await reloaded.load();
      expect(reloaded.entries.map(e => e.url)).toEqual(['b']);
      expect(reloaded.taken).toBe(200);
      const held: IHeldOpen[] = [
        { url: 'a', openedAt: 100, newBrowserTab: null },
        { url: 'b', openedAt: 200, newBrowserTab: null }
      ];
      expect(opensAfter(held, reloaded.taken)).toEqual([]);
      expect(
        opensAfter(
          [...held, { url: 'a', openedAt: 300, newBrowserTab: null }],
          reloaded.taken
        ).map(o => o.openedAt)
      ).toEqual([300]);
    });

    it('stays on the server clock when a row click records a browser time', async () => {
      const store = new RecentProxyStore(memoryState(), BASE);
      await store.load();
      await store.takeSeen([entry('a', 100)], 100, 100000);
      await store.record(store.entries[0], 100000);
      expect(store.taken).toBe(100);
      expect(store.entries[0].openedAt).toBeGreaterThan(100);
    });
  });

  describe('the favicon of a row', () => {
    const page = (path: string, title = path): IRecentProxyEntry =>
      entry(`${BASE}proxy/5555/${path}`, NOW, title);

    // `values` is the state database; passing one again is a reload of the lab page.
    const started = async (
      icons: Record<string, string | undefined>,
      values = new Map<string, unknown>()
    ): Promise<{ store: RecentProxyStore; reads: jest.Mock }> => {
      const reads = jest.fn(async (url: string) => icons[url]);
      const store = new RecentProxyStore(
        {
          fetch: async (id: string) => values.get(id),
          save: async (id: string, value: unknown) => {
            values.set(id, value);
          }
        } as unknown as IStateDB,
        BASE,
        reads
      );
      await store.load();
      return { store, reads };
    };
    const settled = () => new Promise(resolve => setTimeout(resolve));

    it('is read once when the row is added and stored on it; a rename by another page reads none', async () => {
      const { store, reads } = await started({
        [page('a').url]: 'data:image/png;base64,AA'
      });
      await store.takeSeen([page('a', 'A')], 1, 100000);
      await settled();
      expect(store.entries[0].icon).toBe('data:image/png;base64,AA');

      await store.takeSeen([page('b', 'B')], 2, 100000);
      await store.record(store.entries[0], 100000);
      await settled();
      expect(reads.mock.calls).toEqual([[page('a').url]]);
      expect(store.entries).toHaveLength(1);
      expect(store.entries[0]).toMatchObject({
        title: 'B',
        icon: 'data:image/png;base64,AA'
      });
    });

    it('stays absent when the page serves no favicon, so the row shows the web icon', async () => {
      const { store, reads } = await started({});
      await store.record(page('a', 'A'), 100000);
      await settled();
      expect(reads).toHaveBeenCalledTimes(1);
      expect(store.entries[0].icon).toBeUndefined();
    });

    const saved = (row: IRecentProxyEntry) =>
      new Map<string, unknown>([
        ['jupyterlab_bookmarks_manager_extension:recent-proxy', [row]]
      ]);

    it('of a row loaded without one is read once at its next open and kept; a second open reads none', async () => {
      const { store, reads } = await started(
        { [page('a').url]: 'data:image/png;base64,AA' },
        saved(page('a', 'A'))
      );
      await store.record(store.entries[0], 100000);
      await settled();
      expect(store.entries[0].icon).toBe('data:image/png;base64,AA');

      await store.record(store.entries[0], 100000);
      await store.takeSeen([page('b', 'B')], 1, 100000);
      await settled();
      expect(reads.mock.calls).toEqual([[page('a').url]]);
    });

    it('of a row loaded with one is never read', async () => {
      const { store, reads } = await started(
        {},
        saved({ ...page('a', 'A'), icon: 'data:image/png;base64,AA' })
      );
      await store.record(store.entries[0], 100000);
      await store.takeSeen([page('b', 'B')], 1, 100000);
      await settled();
      expect(reads).not.toHaveBeenCalled();
      expect(store.entries[0].icon).toBe('data:image/png;base64,AA');
    });

    it('of a row loaded with one that is no image is dropped, so the row shows the web icon, and read at its next open', async () => {
      const { store, reads } = await started(
        { [page('a').url]: 'data:image/png;base64,AA' },
        saved({ ...page('a', 'A'), icon: 'data:,' })
      );
      expect(store.entries[0].icon).toBeUndefined();

      await store.record(store.entries[0], 100000);
      await settled();
      expect(reads.mock.calls).toEqual([[page('a').url]]);
      expect(store.entries[0].icon).toBe('data:image/png;base64,AA');
    });

    it('that a read missed is read again only in the next lab page load, also when the row moves to another page', async () => {
      const values = saved(page('a', 'A'));
      const first = await started({}, values);
      await first.store.record(first.store.entries[0], 100000);
      await settled();
      await first.store.record(first.store.entries[0], 100000);
      await first.store.takeSeen([page('b', 'B')], 1, 100000);
      await settled();
      expect(first.reads).toHaveBeenCalledTimes(1);

      const reloaded = await started(
        { [page('a').url]: 'data:image/png;base64,AA' },
        values
      );
      await reloaded.store.takeSeen([page('c', 'C')], 2, 100000);
      await settled();
      expect(reloaded.reads.mock.calls).toEqual([[page('a').url]]);
      expect(reloaded.store.entries[0].icon).toBe('data:image/png;base64,AA');
    });
  });
});
