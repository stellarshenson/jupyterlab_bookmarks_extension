import { BookmarkStore } from '../model/store';
import { addNode } from '../model/tree';
import { IBookmarks, Node } from '../model/types';

const file = (id: string): Node => ({ kind: 'file', id, name: id, path: id });
const ids = (nodes: Node[]): string[] => nodes.map(n => n.id);

/**
 * A fake settings server. `reload` returns a settings object whose composite
 * is the value saved at that moment; `set` saves after a delay, so a write
 * that did not wait for the previous one would read a stale value.
 */
function fakeServer() {
  const server = {
    value: {
      version: 1,
      links: [],
      files: [],
      sessions: []
    } as IBookmarks,
    settings(): any {
      return {
        composite: { bookmarks: server.value },
        set: async (_key: string, value: IBookmarks) => {
          await new Promise(resolve => setTimeout(resolve, 10));
          server.value = value;
        },
        dispose: () => undefined
      };
    }
  };
  return server;
}

describe('model/store', () => {
  it('write keeps a bookmark saved by another window', async () => {
    const server = fakeServer();
    const store = new BookmarkStore(
      { reload: async () => server.settings() },
      server.settings()
    );
    // Another window saves after this one has loaded.
    server.value = { ...server.value, files: [file('other')] };

    await store.update('files', nodes => addNode(nodes, file('mine')));

    expect(ids(server.value.files)).toEqual(['other', 'mine']);

    // Two writes started together both land.
    await Promise.all([
      store.update('files', nodes => addNode(nodes, file('a'))),
      store.update('files', nodes => addNode(nodes, file('b')))
    ]);

    expect(ids(server.value.files)).toEqual(['other', 'mine', 'a', 'b']);
  });

  it('sessionEnvExclude is read at each capture, so an edit applies without a reload', () => {
    const settings: any = { composite: { sessionEnvExclude: ['JPY_*'] } };
    const store = new BookmarkStore({ reload: async () => settings }, settings);
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
      server.settings()
    );
    jest.spyOn(console, 'error').mockImplementation(() => undefined);

    await store.update('files', nodes => addNode(nodes, file('lost')));
    await store.update('files', nodes => addNode(nodes, file('kept')));

    expect(ids(server.value.files)).toEqual(['kept']);
  });
});
