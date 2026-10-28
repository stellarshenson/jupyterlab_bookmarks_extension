import { markValue } from '../mark/marks';

describe('mark/marks', () => {
  it('reads the setting as one of the two offered colours', () => {
    expect(markValue('red')).toBe('red');
    expect(markValue('brand')).toBe('brand');
    // An absent or unknown value is the default, so a hand-edited setting still paints.
    expect(markValue(undefined)).toBe('brand');
    expect(markValue('orange')).toBe('brand');
  });
});
