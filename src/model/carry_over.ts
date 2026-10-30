import { ServerConnection } from '@jupyterlab/services';
import { ISettingRegistry } from '@jupyterlab/settingregistry';
import { JSONValue } from '@lumino/coreutils';
import { requestAPI } from '../request';
import { PLUGIN_ID } from './store';

/**
 * Applies the keys saved under the extension's old npm name, one at a time. Await it before
 * anything reads the settings. A key the schema does not declare is skipped, a key with a saved
 * value stays, and a failure is a warning, so a failed carry never stops the panel.
 *
 * shortcut: no marker, so a key removed from the new file (Restore to Defaults) comes back from
 * the old file at the next load; add a marker if a user reports it.
 */
export async function carryOldSettings(
  registry: Pick<ISettingRegistry, 'reload'>,
  settings: ISettingRegistry.ISettings,
  serverSettings: ServerConnection.ISettings
): Promise<void> {
  try {
    const keys = await requestAPI<Record<string, JSONValue>>(
      'old-settings',
      serverSettings
    );
    for (const [key, value] of Object.entries(keys)) {
      if (
        !settings.schema.properties?.[key] ||
        settings.get(key).user !== undefined
      ) {
        continue;
      }
      try {
        await settings.set(key, value);
      } catch (reason) {
        console.warn(`The saved setting ${key} was not carried over.`, reason);
        // The registry keeps a rejected value in its copy of the file, and that copy fails every
        // later save until it is read again.
        (await registry.reload(PLUGIN_ID)).dispose();
      }
    }
  } catch (reason) {
    console.warn('The saved settings were not carried over.', reason);
  }
}
