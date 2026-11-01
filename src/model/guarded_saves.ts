import { ServerConnection } from '@jupyterlab/services';
import { ISettingRegistry } from '@jupyterlab/settingregistry';
import {
  JSONExt,
  ReadonlyPartialJSONObject,
  ReadonlyPartialJSONValue
} from '@lumino/coreutils';
import { compareAndSet, settingsText } from './settings_write';
import { PLUGIN_ID } from './store';

/** Whether two values of the setting are the same; `undefined` is a setting with no value. */
const sameValue = (
  first: ReadonlyPartialJSONValue | undefined,
  second: ReadonlyPartialJSONValue | undefined
): boolean => JSONExt.deepEqual(first ?? null, second ?? null);

/** The text of a value with its keys sorted, because two values that differ only in key order are the same. */
const sortedText = (value: ReadonlyPartialJSONValue | undefined): string =>
  JSON.stringify(value ?? null, (_, part) => {
    if (!part || typeof part !== 'object' || Array.isArray(part)) {
      return part;
    }
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(part).sort()) {
      sorted[key] = part[key];
    }
    return sorted;
  });

/**
 * A 53-bit digest of a value, so the page keeps a number per read and not a copy of every favicon.
 * The hash is cyrb53; it is not cryptographic, and nothing here defends against a crafted value.
 */
function digest(value: ReadonlyPartialJSONValue | undefined): number {
  const text = sortedText(value);
  let high = 0xdeadbeef;
  let low = 0x41c6ce57;
  for (let index = 0; index < text.length; index++) {
    const code = text.charCodeAt(index);
    high = Math.imul(high ^ code, 2654435761);
    low = Math.imul(low ^ code, 1597334677);
  }
  high = Math.imul(high ^ (high >>> 16), 2246822507);
  high ^= Math.imul(low ^ (low >>> 13), 3266489909);
  low = Math.imul(low ^ (low >>> 16), 2246822507);
  low ^= Math.imul(high ^ (high >>> 13), 3266489909);
  return 4294967296 * (2097151 & low) + (high >>> 0);
}

/**
 * Sends every save of this plugin that does not come from the store through the compare-and-set
 * route: the Settings Editor's form and JSON view and the carry-over. The lab saves the page's whole
 * copy there, so `bookmarks` come from a fresh read, unless they differ from every value this page
 * read: then the user edited them in the JSON view, or removed them with Restore to Defaults. That
 * edit is kept, and a hand edit is refused when the file no longer holds the page's last read,
 * because saving it would delete what another writer saved.
 *
 * The page keeps a digest of every value it read since it loaded, because the form holds its copy
 * while a change waits for its debounce or stays invalid, so a copy can be of any age. A hand edit
 * whose `bookmarks` are exactly a value read before therefore counts as a copy: the fresh value
 * stays, and that edit needs a reload or the panel.
 *
 * The registry has no other point to reach these saves, so this replaces `save` on its connector.
 *
 * @param registry The registry, with the plugin loaded
 * @param serverSettings The server to save to
 */
export function guardSaves(
  registry: ISettingRegistry,
  serverSettings: ServerConnection.ISettings
): void {
  const { connector } = registry;
  const save = connector.save.bind(connector);
  const plugin = () => registry.plugins[PLUGIN_ID]!;
  const reads = new Set([digest(plugin().data.composite.bookmarks)]);
  registry.pluginChanged.connect((_, id) => {
    if (id === PLUGIN_ID) {
      reads.add(digest(plugin().data.composite.bookmarks));
    }
  });

  /** The settings a text holds, parsed by the registry, because the text can hold comments. */
  const parse = (raw: string): ReadonlyPartialJSONObject => {
    const parsed = { ...plugin(), raw };
    if (registry.validator.validateData(parsed)) {
      throw new Error(`${PLUGIN_ID} failed to validate: ${raw}`);
    }
    return parsed.data.user;
  };

  connector.save = (id: string, raw: string): Promise<void> => {
    if (id !== PLUGIN_ID) {
      return save(id, raw);
    }
    const saved = parse(raw);
    const edited =
      saved.bookmarks === undefined
        ? plugin().data.user.bookmarks !== undefined
        : !reads.has(digest(saved.bookmarks));
    return compareAndSet(
      serverSettings,
      () => connector.fetch(PLUGIN_ID) as Promise<ISettingRegistry.IPlugin>,
      fresh => {
        const { bookmarks } = parse(fresh.raw);
        if (sameValue(bookmarks, saved.bookmarks)) {
          return raw;
        }
        if (!edited) {
          return settingsText({ ...saved, bookmarks });
        }
        if (
          saved.bookmarks !== undefined &&
          !sameValue(bookmarks, plugin().data.user.bookmarks)
        ) {
          throw new Error(
            'Bookmarks: the bookmarks changed outside this page, so this edit was not saved. Copy only the part you changed, reload the page and make that change again. Pasting the whole old text deletes the outside change.'
          );
        }
        return raw;
      }
    );
  };
}
