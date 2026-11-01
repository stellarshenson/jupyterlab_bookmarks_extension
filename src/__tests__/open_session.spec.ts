import { JupyterFrontEnd } from '@jupyterlab/application';
import { ServerConnection } from '@jupyterlab/services';
import { Signal } from '@lumino/signaling';
import { ISessionBookmark } from '../model/types';
import { requestAPI } from '../request';
import { openSession } from '../session/open_session';

jest.mock('../request', () => ({ requestAPI: jest.fn() }));
jest.mock('@jupyterlab/apputils', () => ({
  Notification: { warning: jest.fn() }
}));

const BOOKMARK: ISessionBookmark = {
  kind: 'session',
  id: 'b1',
  name: 'sleep',
  cwd: '/tmp',
  command: 'sleep 300',
  env: {}
};

/** Lets every step a resolved promise allows run. */
const settle = () => new Promise(resolve => setTimeout(resolve));

/** An app whose `terminal:create-new` gives a tab with a session still connecting. */
function fakeApp() {
  const session = {
    name: '1',
    connectionStatus: 'connecting',
    connectionStatusChanged: new Signal<unknown, string>({})
  };
  const execute = jest.fn(async () => ({
    content: { ready: Promise.resolve(), session }
  }));
  const app = {
    serviceManager: { serverSettings: { baseUrl: '/' } },
    shell: { widgets: () => [] },
    commands: { execute }
  } as unknown as JupyterFrontEnd;
  const setStatus = (status: string) => {
    session.connectionStatus = status;
    session.connectionStatusChanged.emit(status);
  };
  return { app, execute, setStatus };
}

const typedLines = () =>
  (requestAPI as jest.Mock).mock.calls.filter(
    ([, , init]) => init?.method === 'POST'
  );

describe('session/open_session', () => {
  let started: jest.SpyInstance;

  beforeEach(() => {
    (requestAPI as jest.Mock).mockReset();
    (requestAPI as jest.Mock).mockImplementation(
      async (_end, _settings, init) =>
        init?.method === 'POST' ? undefined : { terminals: [] }
    );
    started = jest.spyOn(ServerConnection, 'makeRequest').mockResolvedValue({
      status: 200,
      json: async () => ({ name: '1' })
    } as Response);
  });

  afterEach(() => started.mockRestore());

  it('opens the tab, and types the line only once its session is connected', async () => {
    const { app, execute, setStatus } = fakeApp();
    const open = openSession(app, BOOKMARK);
    await settle();
    expect(execute).toHaveBeenCalledWith('terminal:create-new', { name: '1' });
    expect(typedLines()).toHaveLength(0);

    setStatus('connected');
    await open;
    expect(typedLines()).toHaveLength(1);
  });

  it('gives a second click the promise of the first until the line has its answer', async () => {
    const { app, setStatus } = fakeApp();
    const open = openSession(app, BOOKMARK);
    await settle();
    expect(openSession(app, BOOKMARK)).toBe(open);

    let answer!: () => void;
    (requestAPI as jest.Mock).mockImplementationOnce(
      () => new Promise<void>(resolve => (answer = resolve))
    );
    setStatus('connected');
    await settle();
    expect(openSession(app, BOOKMARK)).toBe(open);

    answer();
    await open;
    expect(openSession(app, BOOKMARK)).not.toBe(open);
    await settle();
  });

  it('fails the open, with no line typed, for a tab that cannot connect', async () => {
    const { app, setStatus } = fakeApp();
    const open = openSession(app, BOOKMARK);
    await settle();

    setStatus('disconnected');
    await expect(open).rejects.toThrow('Terminal 1 did not connect.');
    expect(typedLines()).toHaveLength(0);
  });

  it('starts a bookmark with no line with no marker, and does not wait for its session', async () => {
    const { app, execute } = fakeApp();
    await openSession(app, { ...BOOKMARK, id: 'plain', command: '' });

    const [, init] = started.mock.calls[0];
    expect(JSON.parse(init.body)).toEqual({ cwd: '/tmp' });
    expect(execute).toHaveBeenCalledWith('terminal:create-new', { name: '1' });
    expect(typedLines()).toHaveLength(0);
  });

  it('carries the marker for a bookmark with a line', async () => {
    const { app, setStatus } = fakeApp();
    const open = openSession(app, BOOKMARK);
    await settle();
    setStatus('connected');
    await open;

    const [, init] = started.mock.calls[0];
    expect(JSON.parse(init.body).extra_env).toEqual({
      JUPYTERLAB_BOOKMARK: 'b1'
    });
  });
});
