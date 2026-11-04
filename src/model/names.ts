import { PathExt } from '@jupyterlab/coreutils';

/** Default name of a file bookmark: the file name. A link and a session take their tab title. */
export function fileName(path: string): string {
  return PathExt.basename(path);
}

/**
 * Session bookmark name: the tab title with a leading run of characters that
 * are neither letters nor digits removed; a title made only of such characters
 * is kept unchanged.
 */
export function sessionName(label: string): string {
  return label.replace(/^[^\p{L}\p{N}]+/u, '') || label;
}
