import { Notification } from '@jupyterlab/apputils';
import { ServerConnection } from '@jupyterlab/services';
import { BookmarkStore } from '../model/store';
import { settingsText, WRITE_ATTEMPTS } from '../model/settings_write';
import { addNode } from '../model/tree';
import { IBookmarks, Node } from '../model/types';
import { requestAPI } from '../request';

jest.mock('../request', () => ({ requestAPI: jest.fn() }));
jest.mock('@jupyterlab/apputils', () => ({
  Notification: { warning: jest.fn(), error: jest.fn() }
}));

const serverSettings = {} as ServerConnection.ISettings;
const file = (id: string): Node => ({ kind: 'file', id, name: id, path: id });
const ids = (nodes: Node[]): string[] => nodes.map(n => n.id);

const answer = (status: number) =>
  new ServerConnection.ResponseError({
    status,
    statusText: ''
  } as Response);

/**
 * A fake settings server. `reload` returns a settings object read from the saved
 * text; the write route saves after a delay, so a write that did not wait for
 * the previous one would read a stale value, and it refuses a changed base.
 */
function fakeServer() {
  const server = {
    raw: settingsText({
      bookmarks: { version: 1, links: [], files: [], sessions: [] }
    }),
    /** Runs between a writer's read and its write, once. */
    beforeWrite: undefined as (() => void) | undefined,
    get value(): IBookmarks {
      return JSON.parse(server.raw).bookmarks;
    },
    save(value: IBookmarks): void {
      server.raw = settingsText({ bookmarks: value as any });
    },
    settings(): any {
      const user = JSON.parse(server.raw);
      return {
        raw: server.raw,
        user,
        composite: user,
        dispose: () => undefined
      };
    },
    async write(_end: string, _settings: unknown, init: RequestInit) {
      const { base, raw } = JSON.parse(init.body as string);
      server.beforeWrite?.();
      server.beforeWrite = undefined;
      await new Promise(resolve => setTimeout(resolve, 10));
      if (base !== server.raw) {
        throw answer(409);
      }
      server.raw = raw;
    }
  };
  (requestAPI as jest.Mock).mockImplementation(server.write);
  return server;
}

describe('model/store', () => {
  beforeEach(() => {
    (requestAPI as jest.Mock).mockReset();
    (Notification.warning as jest.Mock).mockClear();
    (Notification.error as jest.Mock).mockClear();
  });

  const storeOf = (server: ReturnType<typeof fakeServer>) =>
    new BookmarkStore(
      { reload: async () => server.settings() },
      server.settings(),
      serverSettings
    );

  it('write keeps a bookmark saved by another window', async () => {
    const server = fakeServer();
    const store = storeOf(server);
    // Another window saves after this one has loaded.
    server.save({ ...server.value, files: [file('other')] });

    await store.update('files', nodes => addNode(nodes, file('mine')));

    expect(ids(server.value.files)).toEqual(['other', 'mine']);

    // Two writes started together both land.
    await Promise.all([
      store.update('files', nodes => addNode(nodes, file('a'))),
      store.update('files', nodes => addNode(nodes, file('b')))
    ]);

    expect(ids(server.value.files)).toEqual(['other', 'mine', 'a', 'b']);
  });

  it('applies the change again after another writer saved between its read and its write', async () => {
    const server = fakeServer();
    const store = storeOf(server);
    server.beforeWrite = () =>
      server.save({ ...server.value, files: [file('other')] });

    await store.update('files', nodes => addNode(nodes, file('mine')));

    expect(ids(server.value.files)).toEqual(['other', 'mine']);
    expect(requestAPI).toHaveBeenCalledTimes(2);
  });

  it('keeps every other key of the settings text', async () => {
    const server = fakeServer();
    server.raw = settingsText({ ...JSON.parse(server.raw), markColour: 'red' });
    const store = storeOf(server);

    await store.update('files', nodes => addNode(nodes, file('mine')));

    expect(JSON.parse(server.raw).markColour).toBe('red');
  });

  it('a save refused every time ends with an error and no write', async () => {
    const server = fakeServer();
    const before = server.raw;
    (requestAPI as jest.Mock).mockRejectedValue(answer(409));
    const failed = jest
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);

    await storeOf(server).update('files', nodes =>
      addNode(nodes, file('lost'))
    );

    expect(requestAPI).toHaveBeenCalledTimes(WRITE_ATTEMPTS);
    expect(server.raw).toBe(before);
    expect(Notification.error).toHaveBeenCalledTimes(1);
    expect(failed).toHaveBeenCalled();
    failed.mockRestore();
  });

  it('a server without the route says to restart, once, with no second write', async () => {
    const server = fakeServer();
    (requestAPI as jest.Mock).mockRejectedValue(answer(404));
    const failed = jest
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);

    await storeOf(server).update('files', nodes =>
      addNode(nodes, file('lost'))
    );

    expect(requestAPI).toHaveBeenCalledTimes(1);
    expect(Notification.warning).toHaveBeenCalledTimes(1);
    expect((Notification.warning as jest.Mock).mock.calls[0][0]).toContain(
      'restart the Jupyter server'
    );
    failed.mockRestore();
  });

  it('sessionEnvExclude is read at each capture, so an edit applies without a reload', () => {
    const settings: any = { composite: { sessionEnvExclude: ['JPY_*'] } };
    const store = new BookmarkStore(
      { reload: async () => settings },
      settings,
      serverSettings
    );
    expect(store.sessionEnvExclude).toEqual(['JPY_*']);

    // The registry replaces composite when the setting is edited.
    settings.composite.sessionEnvExclude = ['FILTER_*'];
    expect(store.sessionEnvExclude).toEqual(['FILTER_*']);
  });

  it('a failed write does not stop the next one', async () => {
    const server = fakeServer();
    let fail = true;
    const store = new BookmarkStore(
      {
        reload: async () => {
          if (fail) {
            fail = false;
            throw new Error('offline');
          }
          return server.settings();
        }
      },
      server.settings(),
      serverSettings
    );
    const failed = jest
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);

    await store.update('files', nodes => addNode(nodes, file('lost')));
    await store.update('files', nodes => addNode(nodes, file('kept')));

    expect(ids(server.value.files)).toEqual(['kept']);
    failed.mockRestore();
  });
});
