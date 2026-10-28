import {
  exportLine,
  formatEnvLines,
  parseEnvLines
} from '../session/shell_quote';

describe('session/shell_quote', () => {
  it('exportLine quotes values', () => {
    expect(
      exportLine({ A: 'a b', B: "it's", C: '$HOME', D: '' }, 'sleep 300')
    ).toBe(`export A='a b' B='it'\\''s' C='$HOME' D=''; sleep 300`);
  });

  it('exportLine leaves out an empty part', () => {
    expect(exportLine({}, 'sleep 300')).toBe('sleep 300');
    expect(exportLine({ K: 'v' }, '')).toBe("export K='v'");
    expect(exportLine({}, '')).toBe('');
  });

  it('parseEnvLines accepts K=a=b, rejects 1K=x, GITHUB_TOKEN=x and a line without =', () => {
    expect(parseEnvLines('K=a=b\n\nL=\n_X1=y')).toEqual({
      K: 'a=b',
      L: '',
      _X1: 'y'
    });
    expect(parseEnvLines('1K=x')).toBeNull();
    expect(parseEnvLines('K=v\nGITHUB_TOKEN=x')).toBeNull();
    expect(parseEnvLines('my_password=x')).toBeNull();
    expect(parseEnvLines('PWD=/tmp')).toBeNull();
    expect(parseEnvLines('K')).toBeNull();
  });

  it('formatEnvLines reads back through parseEnvLines', () => {
    const env = { K: 'a b', L: 'x=y' };
    expect(formatEnvLines(env)).toBe('K=a b\nL=x=y');
    expect(parseEnvLines(formatEnvLines(env))).toEqual(env);
  });
});
