import { ServerConnection, Terminal } from '@jupyterlab/services';
import { ISignal, Signal } from '@lumino/signaling';
import { requestAPI } from '../request';

/** One entry of `GET terminals`: a running terminal and its foreground process. */
export interface ITerminalInfo {
  name: string;
  cwd: string;
  command: string;
  env: Record<string, string>;
  /** The terminal's own process is in the foreground and runs a shell of /etc/shells; an empty command without it is a process the server could not read. */
  shell: boolean;
  /** Id of the session bookmark that started the terminal, or `''`. */
  bookmark: string;
  /** The bookmark's recipe line is still to be typed, or waits unread: the shell has not yet read it. */
  pending: boolean;
}

/** What makes two setups the same: command and cwd. */
export type Recipe = Pick<ITerminalInfo, 'command' | 'cwd'>;

/** Same command line and cwd; the terminal name never counts, and an empty command matches only a confirmed shell. */
export function sameSetup(recipe: Recipe, terminal: ITerminalInfo): boolean {
  return (
    recipe.command === terminal.command &&
    recipe.cwd === terminal.cwd &&
    (terminal.command !== '' || terminal.shell)
  );
}

/** The terminal running the recipe: one whose tab is open wins, otherwise the first listed. */
export function findOpenTerminal(
  recipe: Recipe,
  terminals: ITerminalInfo[],
  openNames: string[]
): ITerminalInfo | undefined {
  const matches = terminals.filter(t => sameSetup(recipe, t));
  return matches.find(t => openNames.includes(t.name)) ?? matches[0];
}

/** Reads `GET terminals`, the foreground process of every running terminal. */
export async function fetchTerminals(
  settings: ServerConnection.ISettings
): Promise<ITerminalInfo[]> {
  return (
    await requestAPI<{ terminals: ITerminalInfo[] }>('terminals', settings)
  ).terminals;
}

/**
 * The terminals as last read, for the tab-menu label and the marks only; a
 * click reads them fresh. Refreshes on every poll of the terminal manager.
 */
export class TerminalSnapshot {
  constructor(
    private _settings: ServerConnection.ISettings,
    terminals: Pick<Terminal.IManager, 'runningChanged'>
  ) {
    // The readers only label and mark, so a failed poll is dropped.
    terminals.runningChanged.connect(
      () => void this.refresh().catch(() => undefined)
    );
  }

  terminals: ITerminalInfo[] = [];

  /** Emits after every read. */
  get changed(): ISignal<this, ITerminalInfo[]> {
    return this._changed;
  }

  /** Reads the terminals again, keeps them and emits `changed`. */
  async refresh(): Promise<ITerminalInfo[]> {
    this.terminals = await fetchTerminals(this._settings);
    this._changed.emit(this.terminals);
    return this.terminals;
  }

  private _changed = new Signal<this, ITerminalInfo[]>(this);
}
