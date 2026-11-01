import { ServerConnection } from '@jupyterlab/services';
import { ISettingRegistry } from '@jupyterlab/settingregistry';
import { PartialJSONObject } from '@lumino/coreutils';
import { compareAndSet, settingsText } from './settings_write';
import { IBookmarks, Node, SectionKey } from './types';

export const PLUGIN_ID =
  '@stellarshenson/jupyterlab-bookmarks-manager-extension:plugin';

/**
 * The setting `bookmarks`. Writes run one after another; each reads the setting,
 * applies its change and saves through the compare-and-set route, so a bookmark
 * another lab window or a CLI run saved at any moment is kept.
 */
export class BookmarkStore {
  constructor(
    private _registry: Pick<ISettingRegistry, 'reload'>,
    private _settings: ISettingRegistry.ISettings,
    private _serverSettings: ServerConnection.ISettings
  ) {}

  get bookmarks(): IBookmarks {
    return this._settings.composite.bookmarks as unknown as IBookmarks;
  }

  /** The expressions of the setting `sessionEnvExclude`, read at each capture; the registry updates `composite` on an edit. */
  get sessionEnvExclude(): string[] {
    return (
      (this._settings.composite.sessionEnvExclude as string[] | undefined) ?? []
    );
  }

  /** The setting `recentProxyTtlDays`, read at each record and each render. */
  get recentProxyTtlDays(): number {
    return (
      (this._settings.composite.recentProxyTtlDays as number | undefined) ?? 3
    );
  }

  /** The setting `markColour`, read at each render. */
  get markColour(): string {
    return (
      (this._settings.composite.markColour as string | undefined) ?? 'brand'
    );
  }

  /** Emits after every save and every reload of the setting. */
  get changed(): ISettingRegistry.ISettings['changed'] {
    return this._settings.changed;
  }

  /** Applies `change` to one section of the freshly reloaded setting and saves it; `change` runs again after a refused save. */
  update(
    section: SectionKey,
    change: (nodes: Node[]) => Node[]
  ): Promise<void> {
    const write = this._queue.then(async () => {
      await compareAndSet(
        this._serverSettings,
        () => this._read(),
        ({ user, value }) =>
          settingsText({
            ...user,
            bookmarks: {
              ...value,
              [section]: change(value[section])
            } as unknown as PartialJSONObject
          })
      );
      (await this._registry.reload(PLUGIN_ID)).dispose();
    });
    this._queue = write.catch(reason => {
      console.error('The bookmarks were not saved.', reason);
    });
    return this._queue;
  }

  /** The setting as the server holds it now; the reload also updates `composite`. */
  private async _read() {
    const fresh = await this._registry.reload(PLUGIN_ID);
    const { raw, user } = fresh;
    const value = fresh.composite.bookmarks as unknown as IBookmarks;
    fresh.dispose();
    return { raw, user, value };
  }

  private _queue: Promise<void> = Promise.resolve();
}
