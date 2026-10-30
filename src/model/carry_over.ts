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
    // A second lab page carrying at the same moment saves its older copy of the file over this
    // page's keys, which leaves an empty panel, so a second pass reads the file and sets what is gone.
    if (await setMissingKeys(keys, registry, settings)) {
      (await registry.reload(PLUGIN_ID)).dispose();
      await setMissingKeys(keys, registry, settings);
    }
  } catch (reason) {
    console.warn('The saved settings were not carried over.', reason);
  }
}

/** Sets each declared key with no saved value; removes a rejected key from `keys`; true when a key was set. */
async function setMissingKeys(
  keys: Record<string, JSONValue>,
  registry: Pick<ISettingRegistry, 'reload'>,
  settings: ISettingRegistry.ISettings
): Promise<boolean> {
  let carried = false;
  for (const [key, value] of Object.entries(keys)) {
    if (
      !settings.schema.properties?.[key] ||
      settings.get(key).user !== undefined
    ) {
      continue;
    }
    try {
      await settings.set(key, value);
      carried = true;
    } catch (reason) {
      console.warn(`The saved setting ${key} was not carried over.`, reason);
      delete keys[key];
      // The registry keeps a rejected value in its copy of the file, and that copy fails every
      // later save until it is read again.
      (await registry.reload(PLUGIN_ID)).dispose();
    }
  }
  return carried;
}
