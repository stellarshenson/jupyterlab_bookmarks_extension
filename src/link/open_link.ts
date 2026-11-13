import { JupyterFrontEnd } from '@jupyterlab/application';
import { MainAreaWidget } from '@jupyterlab/apputils';
import { IFrame, linkIcon } from '@jupyterlab/ui-components';
import { classifyTab } from '../classify/tab_kind';
import { ILink } from '../model/types';
import { isSameOrigin, toAbsoluteUrl } from './link_url';

/**
 * Opens a link: a page on the lab's origin in its own lab tab, activated
 * when that tab is open; a page on another origin in a browser tab, because
 * the lab's Content-Security-Policy blocks it in a frame.
 */
export function openLink(app: JupyterFrontEnd, link: ILink): void {
  const url = toAbsoluteUrl(
    link.url,
    app.serviceManager.serverSettings.baseUrl
  );
  if (!isSameOrigin(url)) {
    window.open(url, '_blank', 'noopener');
    return;
  }
  const id = `bookmarks-link-${link.id}`;
  const widgets = [
    ...app.shell.widgets('main'),
    ...app.shell.widgets('left'),
    ...app.shell.widgets('right'),
    ...app.shell.widgets('down')
  ];
  const open = widgets.find(w => w.id === id) as
    MainAreaWidget<IFrame> | undefined;
  if (open) {
    if (open.content.url !== url) {
      open.content.url = url;
    }
    app.shell.activateById(id);
    return;
  }
  // A tab another command opened on the same page, such as the tab the bookmark was added from.
  const same = widgets.find(w => {
    const kind = classifyTab(w, () => undefined);
    return kind?.kind === 'link' && kind.url === url;
  });
  if (same) {
    app.shell.activateById(same.id);
    return;
  }
  const content = new IFrame({
    sandbox: [
      'allow-same-origin',
      'allow-scripts',
      'allow-popups',
      'allow-forms',
      'allow-downloads',
      'allow-modals'
    ]
  });
  content.url = url;
  const widget = new MainAreaWidget({ content });
  widget.id = id;
  widget.title.label = link.name;
  widget.title.icon = linkIcon;
  widget.title.closable = true;
  app.shell.add(widget, 'main');
}
