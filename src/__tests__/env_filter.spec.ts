import { filterCapturedEnv, matchesEnvName } from '../session/env_filter';

describe('session/env_filter', () => {
  it('matches * any run, ? one character and [...] one of a set, case kept', () => {
    expect(matchesEnvName('JUPYTERLAB_DIR', ['JUPYTER*'])).toBe(true);
    expect(matchesEnvName('MY_JUPYTER', ['JUPYTER*'])).toBe(false);
    expect(matchesEnvName('PS1', ['PS?'])).toBe(true);
    expect(matchesEnvName('PS10', ['PS?'])).toBe(false);
    expect(matchesEnvName('ABC_1', ['[A-C]*_[0-9]'])).toBe(true);
    // Case is kept, and a dot is a dot.
    expect(matchesEnvName('abc_1', ['[A-C]*_[0-9]'])).toBe(false);
    expect(matchesEnvName('ABCD', ['A.D'])).toBe(false);
    expect(matchesEnvName('AXD', ['A.D'])).toBe(false);
  });

  it('keeps the names no expression matches', () => {
    const env = {
      JUPYTER_ONE: '1',
      PS2: '$ ',
      VIRTUAL_ENV_PROMPT: 'v',
      SHELL: '/bin/bash',
      LANG: 'C',
      K: 'v'
    };
    expect(
      filterCapturedEnv(env, ['JUPYTER*', 'PS?', 'VIRTUAL_ENV_*'])
    ).toEqual({ SHELL: '/bin/bash', LANG: 'C', K: 'v' });
    expect(filterCapturedEnv(env, [])).toEqual(env);
  });
});
