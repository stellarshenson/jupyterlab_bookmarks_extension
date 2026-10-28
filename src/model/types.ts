export type SectionKey = 'links' | 'files' | 'sessions';

export interface IFolder {
  kind: 'folder';
  id: string;
  name: string;
  children: Node[];
}

export interface ILink {
  kind: 'link';
  id: string;
  name: string;
  /** Absolute http(s) URL, or a path relative to the lab base URL for a lab-served page. */
  url: string;
  /** Favicon data URL, absent when the page has none or it exceeds the cap. */
  icon?: string;
}

export interface IFileBookmark {
  kind: 'file';
  id: string;
  name: string;
  /** Contents API path, relative to the server root. */
  path: string;
}

export interface ISessionBookmark {
  kind: 'session';
  id: string;
  name: string;
  cwd: string;
  /** Shell-quoted command line; empty for a plain shell. */
  command: string;
  env: Record<string, string>;
}

export type Node = IFolder | ILink | IFileBookmark | ISessionBookmark;

export interface IBookmarks {
  version: 1;
  links: Node[];
  files: Node[];
  sessions: Node[];
}
