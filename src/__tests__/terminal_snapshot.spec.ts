import { ServerConnection, Terminal } from '@jupyterlab/services';
import {
  findOpenTerminal,
  ITerminalInfo,
  TerminalSnapshot
} from '../session/terminal_snapshot';

const terminal = (
  name: string,
  command: string,
  cwd: string
): ITerminalInfo => ({
  name,
  command,
  cwd,
  env: {},
  bookmark: '',
  pending: false
});

describe('session/terminal_snapshot', () => {
  it('findOpenTerminal matches on command and cwd, not on name', () => {
    const recipe = { command: 'sleep 300', cwd: '/tmp' };
    const terminals = [
      terminal('1', 'sleep 300', '/home'),
      terminal('2', 'sleep 30', '/tmp'),
      terminal('7', 'sleep 300', '/tmp')
    ];
    expect(findOpenTerminal(recipe, terminals, [])?.name).toBe('7');
    expect(findOpenTerminal(recipe, terminals.slice(0, 2), [])).toBeUndefined();
  });

  it('empty command matches any shell in the cwd', () => {
    const terminals = [
      terminal('1', 'sleep 300', '/tmp'),
      terminal('2', '', '/tmp'),
      terminal('3', '', '/tmp')
    ];
    expect(
      findOpenTerminal({ command: '', cwd: '/tmp' }, terminals, [])?.name
    ).toBe('2');
    expect(
      findOpenTerminal({ command: '', cwd: '/home' }, terminals, [])
    ).toBeUndefined();
  });

  it('of two matches, the one with an open tab wins, otherwise the first listed', () => {
    const terminals = [
      terminal('1', 'top', '/tmp'),
      terminal('2', 'top', '/tmp')
    ];
    const recipe = { command: 'top', cwd: '/tmp' };
    expect(findOpenTerminal(recipe, terminals, ['2'])?.name).toBe('2');
    expect(findOpenTerminal(recipe, terminals, ['9'])?.name).toBe('1');
  });

  it('a poll answered 404 leaves no unhandled rejection', async () => {
    const request = jest
      .spyOn(ServerConnection, 'makeRequest')
      .mockResolvedValue({
        ok: false,
        status: 404,
        text: async () => ''
      } as unknown as Response);
    let poll = (): void => undefined;
    const terminals = {
      runningChanged: { connect: (slot: () => void) => (poll = slot) }
    } as unknown as Pick<Terminal.IManager, 'runningChanged'>;
    new TerminalSnapshot(ServerConnection.makeSettings(), terminals);

    poll();
    // An unhandled rejection is reported after the microtasks; jest-circus fails the test on it.
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(request).toHaveBeenCalled();
    request.mockRestore();
  });
});
