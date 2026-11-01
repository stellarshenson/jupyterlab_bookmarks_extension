import { PressGate } from '../panel/press_gate';

const send = (type: string) =>
  document.body.dispatchEvent(new Event(type, { bubbles: true }));

describe('panel/press_gate', () => {
  let render: jest.Mock;
  let gate: PressGate;

  beforeEach(() => {
    render = jest.fn();
    gate = new PressGate(render);
  });

  afterEach(() => {
    // Every gate of this file listens on one document, so each ends here.
    send('pointercancel');
    document.removeEventListener('pointerdown', gate, true);
  });

  it('does not hold a render with no press', () => {
    expect(gate.holds()).toBe(false);
  });

  it('runs a render held by a press after the click of the release', () => {
    send('pointerdown');
    expect(gate.holds()).toBe(true);

    send('pointerup');
    expect(render).not.toHaveBeenCalled();
    expect(gate.holds()).toBe(true);

    send('click');
    expect(render).toHaveBeenCalledTimes(1);
    expect(gate.holds()).toBe(false);
  });

  it.each(['auxclick', 'pointermove'])(
    'runs a render held by a press at the %s after the release',
    type => {
      send('pointerdown');
      gate.holds();
      send('pointerup');
      send(type);
      expect(render).toHaveBeenCalledTimes(1);
    }
  );

  it('runs a render held by a press at once on a cancel', () => {
    send('pointerdown');
    gate.holds();
    send('pointercancel');
    expect(render).toHaveBeenCalledTimes(1);
  });

  it('leaves a held render due through a new press, to the end of that press', () => {
    send('pointerdown');
    gate.holds();
    send('pointerup');
    send('pointerdown');
    expect(render).not.toHaveBeenCalled();

    send('pointerup');
    send('click');
    expect(render).toHaveBeenCalledTimes(1);
  });

  it('runs nothing at a release with no render held', () => {
    send('pointerdown');
    send('pointerup');
    send('click');
    expect(render).not.toHaveBeenCalled();
  });

  it('listens for the end of a press only while one is held', () => {
    const added = jest.spyOn(document, 'addEventListener');
    const removed = jest.spyOn(document, 'removeEventListener');
    send('pointerdown');
    expect(added.mock.calls.map(([type]) => type)).toEqual([
      'pointerup',
      'pointercancel',
      'pointermove'
    ]);

    send('pointerup');
    expect(removed.mock.calls.map(([type]) => type)).toEqual([
      'pointerup',
      'pointercancel',
      'pointermove',
      'click',
      'auxclick'
    ]);
    added.mockRestore();
    removed.mockRestore();
  });
});
