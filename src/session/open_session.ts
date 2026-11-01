import { JupyterFrontEnd } from '@jupyterlab/application';
import { MainAreaWidget, Notification } from '@jupyterlab/apputils';
import { URLExt } from '@jupyterlab/coreutils';
import { ServerConnection, Terminal } from '@jupyterlab/services';
import { Widget } from '@lumino/widgets';
import { terminalName } from '../classify/tab_kind';
import { ISessionBookmark } from '../model/types';
import { requestAPI } from '../request';
import { exportLine } from './shell_quote';
import { fetchTerminals, findOpenTerminal } from './terminal_snapshot';

/** Shown when `POST terminals` is refused as an unknown verb: a labextension newer than the running server. */
const RESTART_WARNING =
  'Bookmarks: restart the Jupyter server and reload this page before you open a session bookmark.';

/** The open of each bookmark still running, by id; a second click gets the same promise. */
const opening = new Map<string, Promise<void>>();

/** The lab's terminal widget, as far as this file reads it; the type keeps @jupyterlab/terminal out of the dependencies. */
interface ITerminalContent extends Widget {
  ready: Promise<void>;
  session: Terminal.ITerminalConnection;
}

/**
 * Opens a session bookmark. A terminal this bookmark started whose shell has
 * not yet read the recipe, or a running terminal of the same setup, read fresh
 * from `GET terminals`, gets its tab activated or reopened; otherwise a new
 * terminal starts in the stored cwd, its tab opens and connects, and then the
 * recipe is typed.
 */
export function openSession(
  app: JupyterFrontEnd,
  bookmark: ISessionBookmark
): Promise<void> {
  let open = opening.get(bookmark.id);
  if (!open) {
    open = activateOrStart(app, bookmark).finally(() =>
      opening.delete(bookmark.id)
    );
    opening.set(bookmark.id, open);
  }
  return open;
}

/**
 * Waits for the tab's terminal and its socket, so a program the line starts reads the tab's size: the
 * widget sends a fit it queued before the session emits `connected`, and when the socket connected
 * first the lab's message loop runs the fit a microtask after `ready`, ahead of this function's return.
 *
 * @param terminal The tab's terminal widget
 * @throws When the session gives up connecting, after the lab's own attempts
 */
async function tabConnected(terminal: ITerminalContent): Promise<void> {
  await terminal.ready;
  const { session } = terminal;
  await new Promise<void>((resolve, reject) => {
    const onStatus = () => {
      const status = session.connectionStatus;
      if (status === 'connecting') {
        return;
      }
      session.connectionStatusChanged.disconnect(onStatus);
      if (status === 'connected') {
        resolve();
      } else {
        reject(new Error(`Terminal ${session.name} did not connect.`));
      }
    };
    session.connectionStatusChanged.connect(onStatus);
    onStatus();
  });
}

/**
 * Types the recipe line into terminal `name` through the server: when this resolves the line is on
 * the pty, and the server no longer answers `pending` for a line still to come.
 */
async function typeLine(
  settings: ServerConnection.ISettings,
  name: string,
  line: string
): Promise<void> {
  try {
    await requestAPI('terminals', settings, {
      method: 'POST',
      body: JSON.stringify({ name, line: `${line}\r` })
    });
  } catch (reason) {
    if ((reason as ServerConnection.ResponseError).response?.status === 405) {
      Notification.warning(RESTART_WARNING, { autoClose: false });
    }
    throw reason;
  }
}

async function activateOrStart(
  app: JupyterFrontEnd,
  bookmark: ISessionBookmark
): Promise<void> {
  const settings = app.serviceManager.serverSettings;
  const openNames: string[] = [];
  for (const area of ['main', 'down']) {
    for (const widget of app.shell.widgets(area)) {
      const name = terminalName(widget);
      if (name !== undefined) {
        openNames.push(name);
      }
    }
  }
  const terminals = await fetchTerminals(settings);
  const match =
    terminals.find(t => t.bookmark === bookmark.id && t.pending) ??
    findOpenTerminal(bookmark, terminals, openNames);
  if (match) {
    // Activates the terminal's tab, or opens one on the running terminal.
    await app.commands.execute('terminal:open', { name: match.name });
    return;
  }
  const line = exportLine(bookmark.env, bookmark.command);
  // `terminal:create-new {cwd}` strips the leading slash of an absolute cwd, so the terminal starts here first.
  // The marker makes the server answer `pending` until the line is typed, so a click in another lab page attaches
  // to this terminal; a bookmark with no line has nothing to wait for and carries no marker.
  const response = await ServerConnection.makeRequest(
    URLExt.join(settings.baseUrl, 'api/terminals'),
    {
      method: 'POST',
      body: JSON.stringify({
        cwd: bookmark.cwd,
        ...(line && { extra_env: { JUPYTERLAB_BOOKMARK: bookmark.id } })
      })
    },
    settings
  );
  if (response.status !== 200) {
    throw await ServerConnection.ResponseError.create(response);
  }
  const { name } = (await response.json()) as Terminal.IModel;
  const tab = (await app.commands.execute('terminal:create-new', {
    name
  })) as MainAreaWidget<ITerminalContent>;
  if (line) {
    await tabConnected(tab.content);
    await typeLine(settings, name, line);
  }
}
