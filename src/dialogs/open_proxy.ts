import { JupyterFrontEnd } from '@jupyterlab/application';
import { MainAreaWidget } from '@jupyterlab/apputils';
import { TranslationBundle } from '@jupyterlab/translation';
import {
  IPageRead,
  listedUrl,
  proxyPageUrl,
  readServiceName,
  RecentProxyStore,
  seenFallbackName,
  SERVER_PROXY_OPEN
} from '../recent/recent';
import { editButtons, formBody, showEditDialog, textInput } from './form';

/**
 * The Open Proxy Page dialog. Open records the page, so a page on a closed port
 * has a row too, and runs `server-proxy:open`. The Name field follows the
 * service name of the entered port and path until the user types a name.
 */
export async function openProxyPage(
  app: JupyterFrontEnd,
  recent: RecentProxyStore,
  ttlDays: number,
  trans: TranslationBundle
): Promise<void> {
  const settings = app.serviceManager.serverSettings;
  const port = textInput('', true);
  port.type = 'number';
  port.min = '1';
  port.max = '65535';
  port.step = '1';
  port.placeholder = '8501';
  const path = textInput('');
  path.placeholder = trans.__('/api/docs');
  const name = textInput('');
  const reset = document.createElement('button');
  // type="button": a footer button would resolve the dialog.
  reset.type = 'button';
  reset.className = 'jp-BookmarksPanel-resetName';
  reset.textContent = trans.__('Reset Name');
  const newTab = document.createElement('input');
  newTab.type = 'checkbox';
  newTab.className = 'jp-BookmarksPanel-checkbox';

  const pageUrl = (): string =>
    proxyPageUrl(settings.baseUrl, port.valueAsNumber, path.value);
  // From the listed form of the URL, so that the name holds no secret of the Path field.
  const pageFallback = (): string =>
    seenFallbackName(listedUrl(pageUrl()), settings.baseUrl);
  let typed = false;
  // The answer for the URL then entered, so that Open need not wait for the same read again.
  let known: { url: string; answer: IPageRead } | undefined;
  const follow = (): void => {
    if (typed) {
      return;
    }
    // Empty during the read, so a name typed now does not join the fallback.
    name.value = '';
    name.placeholder = '';
    if (!port.validity.valid) {
      return;
    }
    const url = pageUrl();
    const fallback = pageFallback();
    name.placeholder = fallback;
    void readServiceName(url, fallback).then(answer => {
      // An answer for a port or path the user has since changed is dropped.
      if (pageUrl() !== url) {
        return;
      }
      known = { url, answer };
      if (!typed) {
        name.value = answer.title;
        // Selected under the caret, so the next key replaces the name and does not join it.
        if (document.activeElement === name) {
          name.select();
        }
      }
    });
  };
  port.addEventListener('change', follow);
  path.addEventListener('change', follow);
  name.addEventListener('input', () => {
    typed = name.value.trim() !== '';
  });
  reset.addEventListener('click', () => {
    typed = false;
    follow();
  });

  const result = await showEditDialog({
    title: trans.__('Open Proxy Page'),
    body: formBody([
      ['Port', port],
      ['Path', path],
      ['Name', name, reset],
      ['New browser tab', newTab]
    ]),
    buttons: editButtons(trans, trans.__('Open')),
    focusNodeSelector: 'input'
  });
  if (!result.button.accept) {
    return;
  }
  const url = pageUrl();
  // No answer for this URL yet: Enter resolves the dialog before a `change` event arrives, and a typed name stops the reads of the fields.
  const answer =
    known?.url === url
      ? known.answer
      : await readServiceName(url, pageFallback());
  const title = typed ? name.value.trim() : answer.title;
  // The page's final URL with no secret, which is the URL the proxy reports, so one open is one row.
  const listed = listedUrl(answer.url);
  const id = `server-proxy:${listed}`;
  // The lab on its own port is not listed, as in the tap's first rule.
  // shortcut: the page's port stands for the lab's, so a lab behind a port map or a hub still gets a row for its real port; upgrade if the server reports its port.
  if (port.valueAsNumber !== Number(new URL(settings.baseUrl).port)) {
    // Not awaited: `window.open` below needs the click's user activation.
    void recent.record(
      { url: listed, title, newBrowserTab: newTab.checked, id },
      ttlDays
    );
  }
  await app.commands.execute(SERVER_PROXY_OPEN, {
    url,
    title,
    newBrowserTab: newTab.checked,
    id
  });
  // The command activates a tab of this id without a new title; the id is on the tab's content.
  // shortcut: a lab reload returns this tab to the title of the first open, because the proxy's tracker saves a tab's restore data only when it adds the tab; upgrade if a rename must survive a reload.
  const open = [...app.shell.widgets('main')].find(
    w => (w as MainAreaWidget).content?.id === id
  );
  if (open) {
    open.title.label = title;
  }
}
