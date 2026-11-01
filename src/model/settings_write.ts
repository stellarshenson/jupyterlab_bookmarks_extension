import { Notification } from '@jupyterlab/apputils';
import { ServerConnection } from '@jupyterlab/services';
import { ReadonlyPartialJSONObject } from '@lumino/coreutils';
import { requestAPI } from '../request';

/** Shown when the server has no route of this extension: a labextension newer than the running server. */
export const RESTART_WARNING =
  'Bookmarks: restart the Jupyter server and reload this page before you add a bookmark.';

/** A refusal means another writer saved, and 32 saves during one write means something writes in a loop. */
export const WRITE_ATTEMPTS = 32;

/** The text the store and a merged save write: plain JSON, two-space indent, final newline. */
export function settingsText(settings: ReadonlyPartialJSONObject): string {
  return `${JSON.stringify(settings, null, 2)}\n`;
}

/** Saves `raw` unless the file no longer holds `base`; false when the server refused it for that. */
async function saveOnBase(
  serverSettings: ServerConnection.ISettings,
  base: string,
  raw: string
): Promise<boolean> {
  try {
    await requestAPI('settings-write', serverSettings, {
      method: 'POST',
      body: JSON.stringify({ base, raw })
    });
    return true;
  } catch (reason) {
    const status = (reason as ServerConnection.ResponseError).response?.status;
    if (status === 409) {
      return false;
    }
    if (status === 404) {
      Notification.warning(RESTART_WARNING, { autoClose: false });
    }
    throw reason;
  }
}

/**
 * Reads the settings, builds the new text from that read and saves it on the read's text. A save
 * the server refuses because another writer saved first reads and builds again, so a text built
 * from the read keeps what the other writer saved.
 *
 * @param serverSettings The server to save to
 * @param read Reads the settings as the server holds them now
 * @param text Builds the text to save from a read; it runs once per attempt
 * @throws When the server refuses the last attempt too, a request fails, or `text` throws
 */
export async function compareAndSet<T extends { raw: string }>(
  serverSettings: ServerConnection.ISettings,
  read: () => Promise<T>,
  text: (fresh: T) => string
): Promise<void> {
  for (let attempt = 0; attempt < WRITE_ATTEMPTS; attempt++) {
    const fresh = await read();
    if (await saveOnBase(serverSettings, fresh.raw, text(fresh))) {
      return;
    }
  }
  const message = `Bookmarks: the settings changed ${WRITE_ATTEMPTS} times during this save, so it was not saved. Try again.`;
  Notification.error(message, { autoClose: false });
  throw new Error(message);
}
