import { fileName, sessionName } from '../model/names';

describe('model/names', () => {
  it('file default name', () => {
    expect(fileName('dir/sub/a.ipynb')).toBe('a.ipynb');
  });

  it('session default name', () => {
    expect(sessionName('python3 -m http.server', '/tmp')).toBe('python3 - tmp');
    expect(sessionName('', '/tmp')).toBe('shell - tmp');
  });
});
