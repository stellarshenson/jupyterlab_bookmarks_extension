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
  return ABSOLUTE.test(stored) ? stored : baseUrl + stored;
}

export function isSameOrigin(url: string): boolean {
  return new URL(url).origin === window.location.origin;
}
