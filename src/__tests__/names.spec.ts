import { fileName, sessionName } from '../model/names';

describe('model/names', () => {
  it('file default name', () => {
    expect(fileName('dir/sub/a.ipynb')).toBe('a.ipynb');
  });

  it('session name drops a leading symbol run', () => {
    expect(sessionName('✳ my topic')).toBe('my topic');
    expect(sessionName('⚙  Lab Utils')).toBe('Lab Utils');
    expect(sessionName('sleep 300')).toBe('sleep 300');
    expect(sessionName('✳◐')).toBe('✳◐');
  });
});
