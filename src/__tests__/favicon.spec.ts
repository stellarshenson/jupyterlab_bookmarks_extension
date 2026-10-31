import { ServerConnection } from '@jupyterlab/services';
import { capIcon, fetchFavicon, ICON_CAP } from '../link/favicon';

const PAGE = `${window.location.origin}/files/plain.html`;

/** Answers the page read with a page that has no icon link, and the icon read with a 404. */
function mockReads() {
  const answers = [
    {
      ok: true,
      url: PAGE,
      headers: { get: () => 'text/html' },
      text: async () => '<html><head><title>Plain</title></head></html>'
    },
    {
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
});
