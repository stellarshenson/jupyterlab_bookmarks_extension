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
  pruneRecent,
  RecentProxyStore,
  recordRecent,
  recentWithoutBookmarks,
  seenFallbackName
} from '../recent/recent';
import { Node } from '../model/types';

const DAY = 24 * 60 * 60 * 1000;
// A fixed clock: the expiry test reads the same `now` for every age.
const NOW = Date.UTC(2026, 9, 28, 12, 0, 0);

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
      recordRecent(entries, entry('a', NOW), 3, NOW).map(e => e.url)
    ).toEqual(['a', 'b']);
    expect(recordRecent(entries, entry('a', NOW), 3, NOW)).toHaveLength(2);
  });

  it('leaves out a page a link bookmarks, at the root or in a folder', () => {
    const links: Node[] = [
      { kind: 'link', id: '1', name: 'Proxy', url: 'proxy/8501/' },
      {
        kind: 'folder',
        id: '2',
        name: 'Apps',
        children: [
          {
            kind: 'link',
            id: '3',
            name: 'Remote',
            url: 'https://example.com/page'
          }
        ]
      }
    ];
    const entries = [
      entry('http://lab/proxy/8501/', NOW),
      entry('https://example.com/page', NOW),
      entry('http://lab/proxy/9999/', NOW)
    ];
    expect(
      recentWithoutBookmarks(entries, links, 'http://lab/').map(e => e.url)
    ).toEqual(['http://lab/proxy/9999/']);
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
      const merged = mergeSeen(entries, entry('a', NOW, 'Title'), 3, NOW);
      expect(merged.map(e => e.url)).toEqual(['a', 'b']);
      expect(merged[0]).toEqual({ ...typed, openedAt: NOW });
    });

    it('does not overwrite a newer browser-side time with an older observation', () => {
      const merged = mergeSeen([typed], entry('a', NOW - 9000), 3, NOW);
      expect(merged[0].openedAt).toBe(NOW - 5000);
    });

    it('lists a new page first, and the same observation twice as one row', () => {
      const once = mergeSeen([typed], entry('new', NOW, 'Title'), 3, NOW);
      expect(once.map(e => e.url)).toEqual(['new', 'a']);
      expect(once[0].title).toBe('Title');
      expect(mergeSeen(once, entry('new', NOW), 3, NOW)).toEqual(once);
    });

    it('shows no negative age when the server clock runs ahead', () => {
      expect(formatAgo(-5 * 60_000)).toBe('now');
      expect(pruneRecent([entry('ahead', NOW + DAY)], 3, NOW)).toHaveLength(1);
    });

    it('shows the age of the open from the server time, however late it is taken', () => {
      const late = mergeSeen([], entry('late', NOW - 3 * 60_000), 3, NOW);
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

    it('lets a link bookmark hide the page', () => {
      const links: Node[] = [
        { kind: 'link', id: '1', name: 'Page', url: 'proxy/8501/x' }
      ];
      expect(
        recentWithoutBookmarks(
          [entry(seen('/user/a/proxy/8501/x'), NOW)],
          links,
          base
        )
      ).toEqual([]);
    });

    it('lets a link whose URL holds a secret hide the page', () => {
      const links: Node[] = [
        {
          kind: 'link',
          id: '1',
          name: 'Page',
          url: 'proxy/8501/x?token=FAKE&keep=1'
        }
      ];
      expect(
        recentWithoutBookmarks(
          [entry(seen('/user/a/proxy/8501/x?keep=1'), NOW)],
          links,
          base
        )
      ).toEqual([]);
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
      const first = new RecentProxyStore(state);
      await first.load();
      await first.takeSeen([entry('a', 100), entry('b', 200)], 100000);
      expect(first.taken).toBe(200);
      await first.remove('a');

      const reloaded = new RecentProxyStore(state);
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
      const store = new RecentProxyStore(memoryState());
      await store.load();
      await store.takeSeen([entry('a', 100)], 100000);
      await store.record(store.entries[0], 100000);
      expect(store.taken).toBe(100);
      expect(store.entries[0].openedAt).toBeGreaterThan(100);
    });
  });
});
