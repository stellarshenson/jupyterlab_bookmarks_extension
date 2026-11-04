import { IStateDB } from '@jupyterlab/statedb';
import { ReadonlyPartialJSONValue } from '@lumino/coreutils';

/** The state database key of each bookmark's last-present time; the state database is per lab page. */
export const LAST_PRESENT_STATE_ID =
  'jupyterlab_bookmarks_manager_extension:last-present';

/** How often an open bookmark's last-present time is written while its tab stays open. */
export const PRESENT_TICK_MS = 30_000;

/**
 * Each bookmark's last-present time, by bookmark id. It is written while the
 * bookmark's tab is open, so a row whose tab has closed shows the time since
 * its tab was last present.
 */
export class LastPresentStore {
  constructor(private _state: IStateDB) {}

  get times(): Map<string, number> {
    return this._times;
  }

  /** The stored times; a time recorded before the read finishes stays, because it is newer. */
  async load(): Promise<void> {
    const stored = await this._state.fetch(LAST_PRESENT_STATE_ID);
    if (!stored || typeof stored !== 'object' || Array.isArray(stored)) {
      return;
    }
    for (const [id, time] of Object.entries(stored)) {
      if (typeof time === 'number' && !this._times.has(id)) {
        this._times.set(id, time);
      }
    }
  }

  record(ids: Iterable<string>, now: number): void {
    for (const id of ids) {
      this._times.set(id, now);
    }
  }

  save(): Promise<void> {
    const value: Record<string, number> = {};
    this._times.forEach((time, id) => (value[id] = time));
    return this._state.save(
      LAST_PRESENT_STATE_ID,
      value as ReadonlyPartialJSONValue
    );
  }

  private _times = new Map<string, number>();
}
