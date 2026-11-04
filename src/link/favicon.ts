import { ServerConnection } from '@jupyterlab/services';
import { LabIcon } from '@jupyterlab/ui-components';
import { requestAPI } from '../request';
import { BookmarkStore } from '../model/store';
import { updateNode } from '../model/tree';
import { ILink } from '../model/types';
import { isSameOrigin, toAbsoluteUrl } from './link_url';

/** The longest favicon kept in a bookmark, in data-URL characters. */
export const ICON_CAP = 32768;

/** The icon when it fits the cap, else undefined. */
export function capIcon(icon: string | null | undefined): string | undefined {
  return icon && icon.length <= ICON_CAP ? icon : undefined;
}

/** Stores the link's favicon; the page's wins, and `tabIcon` is kept when the page serves none. */
export async function storeFavicon(
  store: BookmarkStore,
  link: ILink,
  settings: ServerConnection.ISettings,
  tabIcon?: string | LabIcon | null
): Promise<void> {
  const url = toAbsoluteUrl(link.url, settings.baseUrl);
  const icon = (await fetchFavicon(url, settings)) ?? tabIconUrl(tabIcon);
  if (icon) {
    // The URL test keeps an icon fetched for an address the user has since changed.
    await store.update('links', nodes =>
      updateNode(nodes, link.id, n =>
        n.kind === 'link' && n.url === link.url ? { ...n, icon } : n
      )
    );
  }
}

/** The tab's widget icon as a data URL: a LabIcon's SVG source, or a string that already is a data URL. */
function tabIconUrl(
  icon: string | LabIcon | null | undefined
): string | undefined {
  if (typeof icon === 'string') {
    return icon.startsWith('data:') ? capIcon(icon) : undefined;
  }
  const svg = icon?.svgstr;
  return typeof svg === 'string'
    ? capIcon(`data:image/svg+xml;utf8,${encodeURIComponent(svg)}`)
    : undefined;
}

/** The page's favicon as a data URL; same origin from the browser, another origin through `POST favicon`. */
export async function fetchFavicon(
  url: string,
  settings: ServerConnection.ISettings
): Promise<string | undefined> {
  try {
    if (isSameOrigin(url)) {
      return capIcon(await sameOriginIcon(url));
    }
    const reply = await requestAPI<{ icon: string | null }>(
      'favicon',
      settings,
      { method: 'POST', body: JSON.stringify({ url }) }
    );
    return capIcon(reply.icon);
  } catch (reason) {
    console.warn(`No favicon for ${url}.`, reason);
    return undefined;
  }
}

/** A plain `fetch`, because the proxy passes the token and XSRF header of `ServerConnection` to whatever listens on the port. */
async function sameOriginIcon(url: string): Promise<string | null> {
  // no-store: a port can serve another service later, and a stored icon stays until the URL changes.
  const page = await fetch(url, { cache: 'no-store' });
  // No icon link: favicon.ico beside the page, never at the origin root.
  let href = 'favicon.ico';
  if (page.ok && page.headers.get('content-type')?.includes('html')) {
    const html = new DOMParser().parseFromString(
      await page.text(),
      'text/html'
    );
    href =
      html.querySelector('link[rel~="icon" i]')?.getAttribute('href') ?? href;
  }
  const iconUrl = new URL(href, page.url || url).href;
  if (iconUrl.startsWith('data:')) {
    return iconUrl;
  }
  const reply = await fetch(iconUrl, { cache: 'no-store' });
  const blob = await reply.blob();
  if (!reply.ok || !blob.type.startsWith('image/') || blob.size > ICON_CAP) {
    return null;
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}
