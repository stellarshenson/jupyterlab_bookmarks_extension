import { TranslationBundle } from '@jupyterlab/translation';
import { BookmarkStore } from '../model/store';
import { ISessionBookmark } from '../model/types';
import { formatEnvLines, parseEnvLines } from '../session/shell_quote';
import {
  dialogTitle,
  folderChoice,
  folderSelect,
  saveEdit
} from './folder_select';
import { editButtons, formBody, showEditDialog, textInput } from './form';

/** Edit a session's name, cwd, command, environment and folder; the bookmark changes, no running process does. */
export async function editSession(
  store: BookmarkStore,
  session: ISessionBookmark,
  trans: TranslationBundle
): Promise<void> {
  const name = textInput(session.name, true);
  const cwd = textInput(session.cwd);
  const command = textInput(session.command);
  const env = document.createElement('textarea');
  env.className = 'jp-BookmarksPanel-input';
  env.rows = 3;
  env.spellcheck = false;
  env.value = formatEnvLines(session.env);
  const folder = folderSelect(store.bookmarks.sessions, session.id);
  const initial = folder.value;
  const banner = document.createElement('div');
  banner.className = 'jp-BookmarksPanel-banner';
  banner.setAttribute('role', 'status');
  banner.hidden = parseEnvLines(env.value) !== null;
  banner.textContent = trans.__(
    'Each line must be NAME=value. A name that recording leaves out, such as GITHUB_TOKEN, disables Save.'
  );

  // The dialog checks its fields on `input` and cancels Enter, both in the
  // document's capture phase; a window listener runs before it, so the field
  // is marked before the check and Enter stays a newline.
  const onEnv = (event: Event): void => {
    if (event.target !== env) {
      return;
    }
    if (event.type === 'input') {
      const invalid = parseEnvLines(env.value) === null;
      env.classList.toggle('jp-mod-error', invalid);
      banner.hidden = !invalid;
      env.setAttribute('aria-invalid', String(invalid));
    } else if ((event as KeyboardEvent).key === 'Enter') {
      event.stopPropagation();
    }
  };
  window.addEventListener('input', onEnv, true);
  window.addEventListener('keydown', onEnv, true);
  const result = await showEditDialog({
    title: dialogTitle(store.bookmarks.sessions, session.id),
    body: formBody(
      [
        ['Name', name],
        ['Working directory', cwd],
        ['Command', command],
        ['Environment', env],
        ['Folder', folder]
      ],
      banner
    ),
    buttons: editButtons(trans),
    focusNodeSelector: 'input'
  });
  window.removeEventListener('input', onEnv, true);
  window.removeEventListener('keydown', onEnv, true);
  if (!result.button.accept) {
    return;
  }
  await saveEdit(
    store,
    'sessions',
    {
      kind: 'session',
      id: session.id,
      name: name.value.trim(),
      cwd: cwd.value.trim(),
      command: command.value.trim(),
      // Save is disabled while a line is invalid.
      env: parseEnvLines(env.value) ?? session.env
    },
    folderChoice(folder, initial)
  );
}
