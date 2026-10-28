import { Widget } from '@lumino/widgets';

export type TabKind =
  | { kind: 'link'; url: string }
  | { kind: 'file'; path: string }
  | { kind: 'terminal'; name: string };

const WEB = /^https?:/i;

/**
 * What a tab shows: a document's path, a terminal's name, or the address of
 * its one http(s) iframe; null for any other tab.
 */
export function classifyTab(
  widget: Widget,
  contextForWidget: (widget: Widget) => { path: string } | undefined
): TabKind | null {
  const context = contextForWidget(widget);
  if (context) {
    return { kind: 'file', path: context.path };
  }
  const name = terminalName(widget);
  if (name !== undefined) {
    return { kind: 'terminal', name };
  }
  const frames = widget.node.querySelectorAll('iframe');
  if (frames.length !== 1) {
    return null;
  }
  const url = frameUrl(frames[0]);
  return WEB.test(url) ? { kind: 'link', url } : null;
}

/** The session name of a terminal tab, else undefined. */
export function terminalName(widget: Widget): string | undefined {
  // Duck typing keeps @jupyterlab/terminal out of the dependencies.
  const name = (widget as any).content?.session?.name;
  return typeof name === 'string' ? name : undefined;
}

/** The address the frame shows; its src when the page is on another origin or not loaded yet. */
function frameUrl(frame: HTMLIFrameElement): string {
  try {
    const href = frame.contentWindow?.location.href ?? '';
    if (WEB.test(href)) {
      return href;
    }
  } catch {
    // A cross-origin frame refuses access to its location.
  }
  return frame.src;
}
