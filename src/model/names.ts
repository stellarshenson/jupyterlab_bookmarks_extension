import { PathExt } from '@jupyterlab/coreutils';

/** Default name of a file bookmark: the file name. A link takes its tab title. */
export function fileName(path: string): string {
  return PathExt.basename(path);
}

/** Default name of a session bookmark: `<first word of command or "shell"> - <cwd base name>`. */
export function sessionName(command: string, cwd: string): string {
  const first = command.trim().split(/\s+/)[0] || 'shell';
  return `${first} - ${PathExt.basename(cwd)}`;
}
