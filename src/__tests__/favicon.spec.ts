import { ServerConnection } from '@jupyterlab/services';
import { capIcon, fetchFavicon, ICON_CAP } from '../link/favicon';

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
    const page = `${window.location.origin}/files/plain.html`;
    const answers = [
      {
        ok: true,
        url: page,
        headers: { get: () => 'text/html' },
        text: async () => '<html><head><title>Plain</title></head></html>'
      },
      {
        ok: false,
        blob: async () => new Blob(['<h1>404</h1>'], { type: 'text/html' })
      }
    ];
    const request = jest
      .spyOn(ServerConnection, 'makeRequest')
      .mockImplementation(async () => answers.shift() as unknown as Response);

    await expect(
      fetchFavicon(page, ServerConnection.makeSettings())
    ).resolves.toBeUndefined();
    expect(request.mock.calls.map(call => call[0])).toEqual([
      page,
      `${window.location.origin}/files/favicon.ico`
    ]);
    request.mockRestore();
  });
});
