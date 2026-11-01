import { ServerConnection } from '@jupyterlab/services';
import { ISettingRegistry } from '@jupyterlab/settingregistry';
import { Signal } from '@lumino/signaling';
import { guardSaves } from '../model/guarded_saves';
import { settingsText } from '../model/settings_write';
import { PLUGIN_ID } from '../model/store';
import { requestAPI } from '../request';

jest.mock('../request', () => ({ requestAPI: jest.fn() }));
jest.mock('@jupyterlab/apputils', () => ({
  Notification: { warning: jest.fn(), error: jest.fn() }
}));

const serverSettings = {} as ServerConnection.ISettings;
const DEFAULTS = { version: 1, links: [], files: [], sessions: [] };
const value = (...names: string[]) => ({
  ...DEFAULTS,
  links: names.map(name => ({ kind: 'link', id: name, name, url: name }))
});
const text = (settings: Record<string, unknown>) => JSON.stringify(settings);

/** A registry whose `plugin` holds the text `read`, and a server that holds `server.raw`. */
function fakeRegistry(read: Record<string, unknown>) {
  const server = { raw: text(read) };
  const original = jest.fn(async (_id: string, _raw: string) => undefined);
  const dataOf = (raw: string) => {
    const user = JSON.parse(raw.replace(/^\/\/.*$/gm, ''));
    return { user, composite: { bookmarks: DEFAULTS, ...user } };
  };
  const plugin = { id: PLUGIN_ID, raw: server.raw, data: dataOf(server.raw) };
  const pluginChanged = new Signal<unknown, string>({});
  const registry = {
    plugins: { [PLUGIN_ID]: plugin },
    pluginChanged,
    validator: {
      validateData: (parsed: any) => {
        parsed.data = dataOf(parsed.raw);
        return null;
      }
    },
    connector: {
      fetch: async () => ({ raw: server.raw }),
      save: original
    }
  };
  (requestAPI as jest.Mock).mockImplementation(
    async (_end: string, _settings: unknown, init: RequestInit) => {
      const { base, raw } = JSON.parse(init.body as string);
      if (base !== server.raw) {
        throw new ServerConnection.ResponseError({
          status: 409,
          statusText: ''
        } as Response);
      }
      server.raw = raw;
    }
  );
  guardSaves(registry as unknown as ISettingRegistry, serverSettings);
  return {
    server,
    original,
    save: (raw: string, id = PLUGIN_ID) => registry.connector.save(id, raw),
    /** The page reads the file, as a store write or the end of a save does. */
    pageRead: () => {
      plugin.raw = server.raw;
      plugin.data = dataOf(server.raw);
      pluginChanged.emit(PLUGIN_ID);
    }
  };
}

describe('model/guarded_saves', () => {
  beforeEach(() => {
    (requestAPI as jest.Mock).mockReset();
  });

  it('leaves the saves of other plugins to the connector', async () => {
    const { original, save } = fakeRegistry({});

    await save('{"other": 1}', 'other:plugin');
    expect(original).toHaveBeenCalledWith('other:plugin', '{"other": 1}');
    expect(requestAPI).not.toHaveBeenCalled();

    await save('{"markColour": "red"}');
    expect(original).toHaveBeenCalledTimes(1);
    expect(requestAPI).toHaveBeenCalledTimes(1);
  });

  it('takes bookmarks from a fresh read when a save holds the copy this page read', async () => {
    const { server, save } = fakeRegistry({ bookmarks: value('old') });
    server.raw = text({ bookmarks: value('old', 'outside') });

    await save(text({ bookmarks: value('old'), markColour: 'red' }));

    expect(JSON.parse(server.raw)).toEqual({
      bookmarks: value('old', 'outside'),
      markColour: 'red'
    });
  });

  it('keeps the default value out of a file that holds no bookmarks', async () => {
    const { server, save } = fakeRegistry({});

    await save(text({ bookmarks: DEFAULTS, markColour: 'red' }));

    expect(JSON.parse(server.raw)).toEqual({ markColour: 'red' });
  });

  it('saves the text as it is when the fresh read holds the same bookmarks', async () => {
    const { server, save } = fakeRegistry({ bookmarks: value('old') });
    const edited = `// Comment\n${text({ bookmarks: value('old'), markColour: 'red' })}`;

    await save(edited);

    expect(server.raw).toBe(edited);
  });

  it('refuses a hand edit of bookmarks on an old read and leaves the file', async () => {
    const { server, save } = fakeRegistry({ bookmarks: value('old') });
    const outside = text({ bookmarks: value('old', 'outside') });
    server.raw = outside;

    await expect(save(text({ bookmarks: value('typed') }))).rejects.toThrow(
      'changed outside this page'
    );

    expect(server.raw).toBe(outside);
  });

  it('keeps the removal of bookmarks by Restore to Defaults', async () => {
    const { server, save } = fakeRegistry({ bookmarks: value('old') });

    await save('{}');

    expect(server.raw).toBe('{}');
  });

  it('saves Restore to Defaults after an outside write', async () => {
    const { server, save } = fakeRegistry({ bookmarks: value('old') });
    server.raw = text({ bookmarks: value('old', 'outside') });

    await save('{}');

    expect(server.raw).toBe('{}');
  });

  it('does not take a pending form copy, older than the last read, for a hand edit', async () => {
    const { server, save, pageRead } = fakeRegistry({
      bookmarks: value('old')
    });
    // The store saved while the form's change waited for its debounce.
    server.raw = settingsText({ bookmarks: value('old', 'stored') });
    pageRead();

    await save(text({ bookmarks: value('old'), markColour: 'red' }));

    expect(JSON.parse(server.raw)).toEqual({
      bookmarks: value('old', 'stored'),
      markColour: 'red'
    });
  });

  it('takes a copy whose keys are in another order for a copy', async () => {
    const { server, save, pageRead } = fakeRegistry({
      bookmarks: value('old')
    });
    server.raw = settingsText({ bookmarks: value('old', 'stored') });
    pageRead();

    const reordered = {
      sessions: [],
      files: [],
      links: [{ url: 'old', name: 'old', id: 'old', kind: 'link' }],
      version: 1
    };
    await save(text({ bookmarks: reordered, markColour: 'red' }));

    expect(JSON.parse(server.raw)).toEqual({
      bookmarks: value('old', 'stored'),
      markColour: 'red'
    });
  });

  it('takes a copy for a copy however many reads it is behind', async () => {
    const { server, save, pageRead } = fakeRegistry({
      bookmarks: value('old')
    });
    const names = ['old'];
    for (let add = 0; add < 100; add++) {
      names.push(`add ${add}`);
      server.raw = settingsText({ bookmarks: value(...names) });
      // A store write reads twice.
      pageRead();
      pageRead();
    }

    await save(text({ bookmarks: value('old'), markColour: 'red' }));

    expect(JSON.parse(server.raw)).toEqual({
      bookmarks: value(...names),
      markColour: 'red'
    });
  });

  it('builds the text again after a refusal', async () => {
    const { server, save } = fakeRegistry({ bookmarks: value('old') });
    const saveOnce = (requestAPI as jest.Mock).getMockImplementation()!;
    (requestAPI as jest.Mock).mockImplementationOnce(
      async (end: string, settings: unknown, init: RequestInit) => {
        server.raw = text({ bookmarks: value('old', 'outside') });
        return saveOnce(end, settings, init);
      }
    );

    await save(text({ bookmarks: value('old'), markColour: 'red' }));

    expect(JSON.parse(server.raw).bookmarks).toEqual(value('old', 'outside'));
    expect(requestAPI).toHaveBeenCalledTimes(2);
  });
});
