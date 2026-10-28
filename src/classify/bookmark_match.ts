import { toAbsoluteUrl } from '../link/link_url';
import { Node, SectionKey } from '../model/types';
import { ITerminalInfo, sameSetup } from '../session/terminal_snapshot';
import { TabKind } from './tab_kind';

/** The section a tab kind's bookmarks live in. */
export const SECTION: Record<TabKind['kind'], SectionKey> = {
  link: 'links',
  file: 'files',
  terminal: 'sessions'
};

/**
 * The bookmark that records the tab: the same file path, the same resolved
 * URL, or the terminal's command and cwd.
 */
export function tabMatches(
  kind: TabKind,
  terminals: ITerminalInfo[],
  baseUrl: string
): (node: Node) => boolean {
  switch (kind.kind) {
    case 'file':
      return node => node.kind === 'file' && node.path === kind.path;
    case 'link':
      return node =>
        node.kind === 'link' && toAbsoluteUrl(node.url, baseUrl) === kind.url;
    case 'terminal': {
      const entry = terminals.find(t => t.name === kind.name);
      return node =>
        node.kind === 'session' && !!entry && sameSetup(node, entry);
    }
  }
}
