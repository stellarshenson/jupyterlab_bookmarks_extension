import { IStateDB } from '@jupyterlab/statedb';
import { LAST_PRESENT_STATE_ID, LastPresentStore } from '../panel/last_present';

const fakeState = (
  stored: unknown
): IStateDB & { saved: [string, unknown][] } => {
  const saved: [string, unknown][] = [];
  return {
    saved,
    fetch: async () => stored,
    save: async (id: string, value: unknown) => {
      saved.push([id, value]);
    }
  } as unknown as IStateDB & { saved: [string, unknown][] };
};

describe('panel/last_present', () => {
  it('loads the stored times by bookmark id', async () => {
    const store = new LastPresentStore(fakeState({ a: 100, b: 200, c: 'bad' }));
    await store.load();
    expect(store.times.get('a')).toBe(100);
    expect(store.times.get('b')).toBe(200);
    expect(store.times.has('c')).toBe(false);
  });

  it('keeps a time recorded before the read finishes, because it is newer', async () => {
    const store = new LastPresentStore(fakeState({ a: 100 }));
    store.record(['a'], 300);
    await store.load();
    expect(store.times.get('a')).toBe(300);
  });

  it('records every id at the same time and saves under the state key', async () => {
    const state = fakeState(undefined);
    const store = new LastPresentStore(state);
    await store.load();
    store.record(['a', 'b'], 42);
    await store.save();
    expect(state.saved).toEqual([[LAST_PRESENT_STATE_ID, { a: 42, b: 42 }]]);
  });
});
