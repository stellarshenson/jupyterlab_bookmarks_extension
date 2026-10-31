import { Notification } from '@jupyterlab/apputils';
import { ServerConnection } from '@jupyterlab/services';
import { ISettingRegistry } from '@jupyterlab/settingregistry';
import { JSONValue } from '@lumino/coreutils';
import { requestAPI } from '../request';
import { PLUGIN_ID } from './store';

/**
 * Applies the keys saved under the extension's old npm name, one at a time, once: a post after the
 * passes stops later answers of the route. Await it before anything reads the settings. A key the
 * schema does not declare is skipped, a key with a saved value stays, and a failure is a warning,
 * so a failed carry never stops the panel.
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
    // Counted before the passes, which remove a rejected key: that value will never pass either.
    const answered = Object.keys(keys).length > 0;
    // A second lab page carrying at the same moment saves its older copy of the file over this
    // page's keys, which leaves an empty panel, so a second pass reads the file and sets what is gone.
    if (await setMissingKeys(keys, registry, settings)) {
      (await registry.reload(PLUGIN_ID)).dispose();
      await setMissingKeys(keys, registry, settings);
    }
    if (answered) {
      await requestAPI('old-settings', serverSettings, { method: 'POST' });
    }
  } catch (reason) {
    console.warn('The saved settings were not carried over.', reason);
    Notification.warning(
      'Bookmarks: restart the Jupyter server before you add a bookmark. Your saved bookmarks load after the restart.',
      { autoClose: false }
    );
  }
}

/** Sets each declared key with no saved value; removes a rejected key from `keys`; rethrows a failed request; true when a key was set. */
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
      // A failed request says nothing about the value, so the next load must carry again. The
      // settings validator raises a plain Error.
      if (
        reason instanceof ServerConnection.ResponseError ||
        reason instanceof ServerConnection.NetworkError
      ) {
        throw reason;
      }
    }
  }
  return carried;
}
