const ABSOLUTE = /^https?:\/\//i;

/**
 * The stored form of a link URL: relative to the lab base URL when it lies
 * under it, so it survives a change of host name; absolute otherwise.
 */
export function toStoredUrl(url: string, baseUrl: string): string {
  const absolute = new URL(url, baseUrl).href;
  return absolute.startsWith(baseUrl)
    ? absolute.slice(baseUrl.length)
    : absolute;
}

/** The absolute URL of a stored link URL. */
export function toAbsoluteUrl(stored: string, baseUrl: string): string {
  if (ABSOLUTE.test(stored)) {
    return stored;
  }
  // The command line stores `/path` as typed: a page on the lab's origin, not under the base URL.
  return /^\/(?!\/)/.test(stored)
    ? new URL(stored, baseUrl).href
    : baseUrl + stored;
}

/**
 * The typed address with `https://` in front when it has no scheme and starts with a host name,
 * such as `example.com/page`, as a browser's address bar reads it; a lab path stays as typed.
 */
export function withScheme(typed: string): string {
  return /^[\w-]+(\.[\w-]+)+(:\d+)?(\/|$)/.test(typed)
    ? `https://${typed}`
    : typed;
}

export function isSameOrigin(url: string): boolean {
  return new URL(url).origin === window.location.origin;
}
