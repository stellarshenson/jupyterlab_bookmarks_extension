import { JupyterFrontEnd } from '@jupyterlab/application';
import { URLExt } from '@jupyterlab/coreutils';
import { ServerConnection, Terminal } from '@jupyterlab/services';
import { terminalName } from '../classify/tab_kind';
import { ISessionBookmark } from '../model/types';
import { exportLine } from './shell_quote';
import { fetchTerminals, findOpenTerminal } from './terminal_snapshot';

/** The open of each bookmark still running, by id; a second click gets the same promise. */
const opening = new Map<string, Promise<void>>();

/**
 * Opens a session bookmark. A terminal this bookmark started whose shell has
 * not yet read the recipe, or a running terminal of the same setup, read fresh
 * from `GET terminals`, gets its tab activated or reopened; otherwise a new
 * terminal starts in the stored cwd and types the recipe.
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
  // `terminal:create-new {cwd}` strips the leading slash of an absolute cwd, so the terminal starts here first.
  // The marker lets a later click find this terminal while its shell has not yet read the recipe.
  const response = await ServerConnection.makeRequest(
    URLExt.join(settings.baseUrl, 'api/terminals'),
    {
      method: 'POST',
      body: JSON.stringify({
        cwd: bookmark.cwd,
        extra_env: { JUPYTERLAB_BOOKMARK: bookmark.id }
      })
    },
    settings
  );
  if (response.status !== 200) {
    throw await ServerConnection.ResponseError.create(response);
  }
  const { name } = (await response.json()) as Terminal.IModel;
  const widget = (await app.commands.execute('terminal:create-new', {
    name
  })) as { content: { session: Terminal.ITerminalConnection } };
  const line = exportLine(bookmark.env, bookmark.command);
  if (line) {
    // Queued until the connection opens.
    widget.content.session.send({ type: 'stdin', content: [line + '\r'] });
  }
}
