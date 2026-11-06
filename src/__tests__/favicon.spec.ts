import { ServerConnection } from '@jupyterlab/services';
import type { LabIcon } from '@jupyterlab/ui-components';
import { storeFavicon, capIcon, fetchFavicon, ICON_CAP } from '../link/favicon';
import { BookmarkStore } from '../model/store';
import { ILink, Node } from '../model/types';

const PAGE = `${window.location.origin}/files/plain.html`;
const SVG = '<svg viewBox="0 0 16 16"><circle r="8"/></svg>';

/** Applies the store's change to one link and keeps the result. */
function fakeStore(link: ILink) {
  const kept: { node: ILink } = { node: link };
  const store = {
    update: async (
      _section: string,
      change: (nodes: Node[]) => Node[]
    ): Promise<void> => {
      kept.node = change([link])[0] as ILink;
    }
  } as unknown as BookmarkStore;
  return { store, kept };
}

/** Answers the page read, no icon link by default, and the icon read, a 404 by default. */
function mockReads(
  iconAnswer?: object,
  pageHtml = '<html><head><title>Plain</title></head></html>'
) {
  const answers = [
    {
      ok: true,
      url: PAGE,
      headers: { get: () => 'text/html' },
      text: async () => pageHtml
    },
    iconAnswer ?? {
      ok: false,
      blob: async () => new Blob(['<h1>404</h1>'], { type: 'text/html' })
    }
  ];
  const reads = jest.fn<Promise<Response>, [string, RequestInit?]>(
    async () => answers.shift() as unknown as Response
  );
  window.fetch = reads as unknown as typeof fetch;
  return reads;
}

describe('link/favicon', () => {
  it('drops an icon over 32768 characters', () => {
    const prefix = 'data:image/png;base64,';
    const atCap = prefix + 'A'.repeat(ICON_CAP - prefix.length);
    expect(ICON_CAP).toBe(32768);
    expect(capIcon(atCap)).toBe(atCap);
    expect(capIcon(atCap + 'A')).toBeUndefined();
    expect(capIcon(null)).toBeUndefined();
  });

  it('no icon when favicon.ico beside the page answers 404', async () => {
    const reads = mockReads();

    await expect(
      fetchFavicon(PAGE, ServerConnection.makeSettings())
    ).resolves.toBeUndefined();
    expect(reads.mock.calls.map(call => call[0])).toEqual([
      PAGE,
      `${window.location.origin}/files/favicon.ico`
    ]);
  });

  it('a same-origin read sends no Authorization header and does not use makeRequest', async () => {
    const reads = mockReads();
    const request = jest.spyOn(ServerConnection, 'makeRequest');

    await fetchFavicon(
      PAGE,
      ServerConnection.makeSettings({ token: 'lab-token' })
    );

    expect(request).not.toHaveBeenCalled();
    expect(reads).toHaveBeenCalledTimes(2);
    for (const [, init] of reads.mock.calls) {
      expect(new Headers(init?.headers).has('Authorization')).toBe(false);
    }
    request.mockRestore();
  });

  it('no icon when the icon link is a data URL that is no image, such as data:,', async () => {
    mockReads(
      undefined,
      '<html><head><link rel="icon" href="data:,"></head></html>'
    );

    await expect(
      fetchFavicon(PAGE, ServerConnection.makeSettings())
    ).resolves.toBeUndefined();
    expect(capIcon('data:,')).toBeUndefined();
  });

  it('no icon for an image data URL with no data, such as data:image/x-icon;,', () => {
    expect(capIcon('data:image/x-icon;,')).toBeUndefined();
    expect(capIcon('data:image/png;base64,')).toBeUndefined();
    expect(capIcon('data:image/png;base64,QQ==')).toBe(
      'data:image/png;base64,QQ=='
    );
  });

  it('reads the page and the icon with cache: no-store', async () => {
    const reads = mockReads();

    await fetchFavicon(PAGE, ServerConnection.makeSettings());

    expect(reads.mock.calls.map(call => call[1]?.cache)).toEqual([
      'no-store',
      'no-store'
    ]);
  });
});

describe('link/favicon storeFavicon', () => {
  const LINK: ILink = { kind: 'link', id: '1', name: 'L', url: PAGE };
  const TAB_DATA = 'data:image/svg+xml;utf8,%3Csvg%3E%3C%2Fsvg%3E';
  const PAGE_ICON = 'data:image/png;base64,UE5H';

  it('takes the tab icon as a data URL when the page serves none', async () => {
    mockReads();
    const { store, kept } = fakeStore(LINK);

    await storeFavicon(store, LINK, ServerConnection.makeSettings(), TAB_DATA);

    expect(kept.node.icon).toBe(TAB_DATA);
  });

  it('converts a LabIcon SVG source to a data URL', async () => {
    mockReads();
    const { store, kept } = fakeStore(LINK);

    await storeFavicon(store, LINK, ServerConnection.makeSettings(), {
      svgstr: SVG
    } as LabIcon);

    expect(kept.node.icon).toBe(
      `data:image/svg+xml;utf8,${encodeURIComponent(SVG)}`
    );
  });

  it('keeps the page favicon when the page serves one', async () => {
    mockReads(
      undefined,
      `<html><head><link rel="icon" href="${PAGE_ICON}"></head></html>`
    );
    const { store, kept } = fakeStore(LINK);

    await storeFavicon(store, LINK, ServerConnection.makeSettings(), {
      svgstr: SVG
    } as LabIcon);

    expect(kept.node.icon).toBe(PAGE_ICON);
  });

  it('ignores a tab icon string that is not a data URL', async () => {
    mockReads();
    const { store, kept } = fakeStore(LINK);

    await storeFavicon(store, LINK, ServerConnection.makeSettings(), 'plain');

    expect(kept.node.icon).toBeUndefined();
  });
});
