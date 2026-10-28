import {
  formatAgo,
  IRecentProxyEntry,
  pruneRecent,
  recordRecent,
  recentWithoutBookmarks
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
});
