import { JupyterFrontEnd } from '@jupyterlab/application';
import { UUID } from '@lumino/coreutils';
import { Widget } from '@lumino/widgets';
import { SECTION, tabMatches } from './classify/bookmark_match';
import { TabKind } from './classify/tab_kind';
import { storeFavicon } from './link/favicon';
import { toStoredUrl } from './link/link_url';
import { fileName, sessionName } from './model/names';
import { BookmarkStore } from './model/store';
import { addNode, findNode } from './model/tree';
import { Node } from './model/types';
import { filterCapturedEnv } from './session/env_filter';
import { TerminalSnapshot } from './session/terminal_snapshot';

/**
 * Adds the tab as a bookmark of its kind's section, or inside `folderId` when
 * a folder row of that section was the drop target. The tab menu and the drag
 * onto the panel share these checks: a bookmark the section already holds is
 * kept, and a terminal is read again so its recipe is current.
 */
export async function addTabBookmark(
  app: JupyterFrontEnd,
  store: BookmarkStore,
  snapshot: TerminalSnapshot,
  widget: Widget,
  kind: TabKind,
  folderId: string | null = null
): Promise<void> {
  const { baseUrl } = app.serviceManager.serverSettings;
  // Add records the terminal as it runs now, not as the snapshot last saw it.
  const terminals = kind.kind === 'terminal' ? await snapshot.refresh() : [];
  const test = tabMatches(kind, terminals, baseUrl);
  let node: Node;
  if (kind.kind === 'file') {
    node = {
      kind: 'file',
      id: UUID.uuid4(),
      name: fileName(kind.path),
      path: kind.path
    };
  } else if (kind.kind === 'link') {
    node = {
      kind: 'link',
      id: UUID.uuid4(),
      name: widget.title.label,
      url: toStoredUrl(kind.url, baseUrl)
    };
  } else {
    const entry = terminals.find(t => t.name === kind.name);
    if (!entry) {
      return;
    }
    const { cwd, command, env } = entry;
    node = {
      kind: 'session',
      id: UUID.uuid4(),
      name: sessionName(command, cwd),
      cwd,
      command,
      // The setting applies here, where the capture is stored; a typed name is not filtered.
      env: filterCapturedEnv(env, store.sessionEnvExclude)
    };
  }
  await store.update(SECTION[kind.kind], nodes =>
    findNode(nodes, test) ? nodes : addNode(nodes, node, folderId)
  );
  if (node.kind === 'link') {
    await storeFavicon(store, node, app.serviceManager.serverSettings);
  }
}
