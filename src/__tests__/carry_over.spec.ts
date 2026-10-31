import { Notification } from '@jupyterlab/apputils';
import { ServerConnection } from '@jupyterlab/services';
import { ISettingRegistry } from '@jupyterlab/settingregistry';
import { carryOldSettings } from '../model/carry_over';
import { PLUGIN_ID } from '../model/store';
import { requestAPI } from '../request';

jest.mock('../request', () => ({ requestAPI: jest.fn() }));
jest.mock('@jupyterlab/apputils', () => ({
  Notification: { warning: jest.fn() }
}));

const serverSettings = {} as ServerConnection.ISettings;
const POST = ['old-settings', serverSettings, { method: 'POST' }];

/** The calls of the route that write the marker. */
const posts = (): unknown[][] =>
  (requestAPI as jest.Mock).mock.calls.filter(call => call.length > 2);

describe('model/carry_over', () => {
  let saved: Record<string, unknown>;
  let set: jest.Mock;
  let reload: jest.Mock;
  let warn: jest.SpyInstance;

  const carry = (old: Record<string, unknown> | Error): Promise<void> => {
    const answer = old instanceof Error ? Promise.reject(old) : old;
    (requestAPI as jest.Mock).mockReturnValue(answer);
    const settings = {
      schema: { properties: { first: {}, second: {}, third: {} } },
      get: (key: string) => ({ user: saved[key] }),
      set
    } as unknown as ISettingRegistry.ISettings;
    return carryOldSettings({ reload }, settings, serverSettings);
  };

  beforeEach(() => {
    (requestAPI as jest.Mock).mockClear();
    (Notification.warning as jest.Mock).mockClear();
    saved = {};
    set = jest.fn(async (key: string, value: unknown) => {
      saved[key] = value;
    });
    reload = jest.fn(async () => ({ dispose: () => undefined }));
    warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    warn.mockRestore();
  });

  it('asks the old-settings route', async () => {
    await carry({});
    expect(requestAPI).toHaveBeenCalledWith('old-settings', serverSettings);
  });

  it('stays silent when nothing is saved under the old name', async () => {
    await carry({});
    expect(set).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
  });

  it('applies each declared key', async () => {
    await carry({ first: 1, second: [2] });
    expect(set.mock.calls).toEqual([
      ['first', 1],
      ['second', [2]]
    ]);
  });

  it('skips a key the schema does not declare', async () => {
    await carry({ dropped: true, first: 1 });
    expect(set.mock.calls).toEqual([['first', 1]]);
  });

  it('keeps a key with a saved value, even a falsy one', async () => {
    saved = { first: 0 };
    await carry({ first: 1, second: 2 });
    expect(set.mock.calls).toEqual([['second', 2]]);
  });

  it('reads the file again after a rejection and carries the rest', async () => {
    set.mockRejectedValueOnce(new Error('rejected'));
    await carry({ first: 'bad', second: 2 });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(reload).toHaveBeenCalledWith(PLUGIN_ID);
    expect(set).toHaveBeenLastCalledWith('second', 2);
    // The later save must see the copy of the file read again.
    expect(reload.mock.invocationCallOrder[0]).toBeLessThan(
      set.mock.invocationCallOrder[1]
    );
  });

  it('sets again a key that another lab page saved over', async () => {
    // The first save of `first` does not reach this page's copy of the file.
    set.mockImplementationOnce(async () => undefined);
    await carry({ first: 1, second: 2 });
    expect(set.mock.calls).toEqual([
      ['first', 1],
      ['second', 2],
      ['first', 1]
    ]);
    expect(reload).toHaveBeenCalledTimes(1);
    expect(reload.mock.invocationCallOrder[0]).toBeLessThan(
      set.mock.invocationCallOrder[2]
    );
  });

  it('reads the file once more after a carry, and not when nothing is carried', async () => {
    await carry({ first: 1 });
    expect(reload).toHaveBeenCalledTimes(1);
    expect(set).toHaveBeenCalledTimes(1);

    reload.mockClear();
    set.mockClear();
    await carry({ first: 1 });
    expect(reload).not.toHaveBeenCalled();
    expect(set).not.toHaveBeenCalled();
  });

  it('warns once about a rejected key', async () => {
    set.mockRejectedValueOnce(new Error('rejected'));
    await carry({ first: 'bad', second: 2 });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(set.mock.calls.filter(([key]) => key === 'first')).toHaveLength(1);
  });

  it('resolves with a warning when the route fails', async () => {
    await expect(carry(new Error('404'))).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(set).not.toHaveBeenCalled();
    expect(posts()).toEqual([]);
  });

  it('tells the person to restart the server when the route fails', async () => {
    await carry(new Error('404'));
    expect(Notification.warning).toHaveBeenCalledTimes(1);
    expect(Notification.warning).toHaveBeenCalledWith(
      'Bookmarks: restart the Jupyter server and reload this page before you add a bookmark.',
      { autoClose: false }
    );
  });

  it('shows no notification after a carry', async () => {
    await carry({ first: 1 });
    expect(Notification.warning).not.toHaveBeenCalled();
  });

  it('posts once after the passes when a key was answered', async () => {
    await carry({ first: 1 });
    expect(posts()).toEqual([POST]);
    // A page that loads at the same moment must get the keys before this page stops the route.
    const calls = (requestAPI as jest.Mock).mock.invocationCallOrder;
    expect(calls[calls.length - 1]).toBeGreaterThan(
      Math.max(
        ...set.mock.invocationCallOrder,
        ...reload.mock.invocationCallOrder
      )
    );
  });

  it('posts when every key already had a saved value', async () => {
    saved = { first: 0 };
    await carry({ first: 1 });
    expect(set).not.toHaveBeenCalled();
    expect(posts()).toEqual([POST]);
  });

  it('posts when the settings validator rejected the only key', async () => {
    // The text and the plain Error of `_save` in @jupyterlab/settingregistry.
    set.mockRejectedValueOnce(
      new Error(`${PLUGIN_ID} failed to validate; check console.`)
    );
    await carry({ first: 'bad' });
    expect(posts()).toEqual([POST]);
    expect(Notification.warning).not.toHaveBeenCalled();
  });

  it.each([
    [
      'ResponseError',
      new ServerConnection.ResponseError({
        status: 500,
        statusText: 'Internal Server Error'
      } as Response)
    ],
    [
      'NetworkError',
      new ServerConnection.NetworkError(new TypeError('offline'))
    ]
  ])('a %s from a save gives no post and the warning', async (_, failure) => {
    set.mockRejectedValueOnce(failure);
    await expect(carry({ first: 1, second: 2 })).resolves.toBeUndefined();
    expect(set.mock.calls).toEqual([['first', 1]]);
    expect(reload).toHaveBeenCalledWith(PLUGIN_ID);
    expect(posts()).toEqual([]);
    expect(Notification.warning).toHaveBeenCalledTimes(1);
  });

  it('posts when the only key is undeclared', async () => {
    await carry({ dropped: true });
    expect(posts()).toEqual([POST]);
  });

  it('does not post when no key was answered', async () => {
    await carry({});
    expect(posts()).toEqual([]);
  });

  it('resolves with a warning when the post fails', async () => {
    (requestAPI as jest.Mock)
      .mockResolvedValueOnce({ first: 1 })
      .mockRejectedValueOnce(new Error('405'));
    await expect(carry({})).resolves.toBeUndefined();
    expect(saved).toEqual({ first: 1 });
    expect(Notification.warning).toHaveBeenCalledTimes(1);
  });

  it('resolves with a warning when the reload fails too', async () => {
    set.mockRejectedValueOnce(new Error('rejected'));
    reload.mockRejectedValueOnce(new Error('offline'));
    await expect(carry({ first: 'bad' })).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledTimes(2);
  });
});
