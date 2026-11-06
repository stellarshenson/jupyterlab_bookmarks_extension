import { nullTranslator } from '@jupyterlab/translation';
import { Node } from '../model/types';
import { IViewState } from '../panel/row_view';
import {
  renderRecentSection,
  renderSection,
  WEB_ICON
} from '../panel/section_view';
import { IRecentProxyEntry } from '../recent/recent';

// The real package loads ES modules that this Jest configuration does not transform.
// `resolve` returns a registered icon, else a placeholder holding the refresh SVG, as the real one does.
jest.mock('@jupyterlab/ui-components', () => {
  class LabIcon {
    static registered = new Map<string, LabIcon>();
    static resolve = ({ icon }: { icon: string }): LabIcon =>
      LabIcon.registered.get(icon) ??
      new LabIcon({ name: icon, svgstr: 'refresh' });
    name: string;
    svgstr: string;
    constructor({ name, svgstr }: { name: string; svgstr: string }) {
      this.name = name;
      this.svgstr = svgstr;
    }
    element = (): HTMLElement => {
      const span = document.createElement('span');
      span.dataset.icon = this.name;
      return span;
    };
  }
  const icon = (name: string, svgstr = name) => new LabIcon({ name, svgstr });
  return {
    LabIcon,
    addIcon: icon('add'),
    eraserIcon: icon('eraser'),
    linkIcon: icon('link'),
    refreshIcon: icon('refresh')
  };
});

const NOW = 10_000_000;

const view = (overrides: Partial<IViewState> = {}): IViewState =>
  ({
    collapsed: new Set(),
    filtering: false,
    recent: [],
    stops: {},
    now: NOW,
    open: new Set(),
    lastPresent: new Map(),
    canOpenProxy: true,
    ...overrides
  }) as unknown as IViewState;

const render = (
  canOpenProxy: boolean,
  recent: IRecentProxyEntry[] = []
): HTMLElement =>
  renderRecentSection(
    view({ canOpenProxy, recent }),
    nullTranslator.load('jest')
  );

const LINK: Node = { kind: 'link', id: 'a', name: 'A', url: 'https://x/' };

describe('panel/section_view renderRecentSection', () => {
  it('names the section Proxy in a label span and a count span', () => {
    const section = render(true);
    expect(
      section.querySelector('.jp-BookmarksPanel-sectionLabel')?.textContent
    ).toBe('Proxy');
    expect(
      section.querySelector('.jp-BookmarksPanel-sectionCount')?.textContent
    ).toBe('(0)');
    expect(
      section.querySelector('[role="tree"]')?.getAttribute('aria-label')
    ).toBe('Proxy');
    expect(section.querySelector('.jp-BookmarksPanel-empty')?.textContent).toBe(
      'No proxy pages.'
    );
  });

  it('counts the rows shown', () => {
    const entry = {
      url: 'http://lab/p',
      title: 'P',
      newBrowserTab: false,
      openedAt: 0
    };
    expect(
      render(false, [entry]).querySelector('.jp-BookmarksPanel-sectionCount')
        ?.textContent
    ).toBe('(1)');
  });

  it('enables the + button while the command exists', () => {
    const plus = render(true).querySelector<HTMLButtonElement>(
      '.jp-BookmarksPanel-plus'
    );
    expect(plus?.disabled).toBe(false);
    expect(plus?.title).toBe('Open Proxy Page');
    expect(plus?.getAttribute('aria-label')).toBe('Open Proxy Page');
    expect(plus?.getAttribute('aria-haspopup')).toBe('dialog');
  });

  it('disables the + button with a tooltip while the command does not exist', () => {
    const plus = render(false).querySelector<HTMLButtonElement>(
      '.jp-BookmarksPanel-plus'
    );
    expect(plus?.disabled).toBe(true);
    expect(plus?.title).toBe('Open Proxy Page needs jupyter-server-proxy');
    expect(plus?.getAttribute('aria-label')).toBe('Open Proxy Page');
  });

  it('puts the caret spacer before the icon of a row', () => {
    const row = render(false, [
      { url: 'http://lab/p', title: 'P', newBrowserTab: false, openedAt: 0 }
    ]).querySelector('.jp-BookmarksPanel-row');
    expect(row?.firstElementChild?.className).toBe('jp-BookmarksPanel-caret');
    expect(row?.firstElementChild?.textContent).toBe('');
  });

  describe('the icon of a row', () => {
    const entry = {
      url: 'http://lab/p',
      title: 'P',
      newBrowserTab: false,
      openedAt: 0
    };
    const icon = (recent: IRecentProxyEntry): Element | null | undefined =>
      render(false, [recent]).querySelector('.jp-BookmarksPanel-row')
        ?.children[1];

    it('is the stored favicon, drawn as a Links row draws it', () => {
      const shown = icon({ ...entry, icon: 'data:image/png;base64,AA' });
      expect(shown?.tagName).toBe('IMG');
      expect(shown?.getAttribute('src')).toBe('data:image/png;base64,AA');
    });

    it('is the web icon once the stored favicon fails to decode', () => {
      const section = render(false, [
        { ...entry, icon: 'data:image/png;base64,iVBORw0KGgo=' }
      ]);
      const row = section.querySelector('.jp-BookmarksPanel-row');
      expect(row?.children[1].tagName).toBe('IMG');
      row?.children[1].dispatchEvent(new Event('error'));
      const shown = row?.children[1] as HTMLElement;
      expect(shown.tagName).toBe('SPAN');
      expect(shown.dataset.icon).toBe(
        (icon(entry) as HTMLElement).dataset.icon
      );
    });

    it('is the link icon while no extension registers the web icon', () => {
      expect((icon(entry) as HTMLElement).dataset.icon).toBe('link');
    });

    it('is the web icon of a proxied lab tab once registered', () => {
      const { LabIcon } = jest.requireMock('@jupyterlab/ui-components');
      LabIcon.registered.set(
        WEB_ICON,
        new LabIcon({ name: WEB_ICON, svgstr: '<svg/>' })
      );
      expect((icon(entry) as HTMLElement).dataset.icon).toBe(WEB_ICON);
    });
  });

  it('puts the name and the URL in the tooltip of a row', () => {
    const row = render(false, [
      { url: 'http://lab/p', title: 'P', newBrowserTab: false, openedAt: 0 }
    ]).querySelector<HTMLElement>('.jp-BookmarksPanel-row');
    expect(row?.title).toBe('P\nhttp://lab/p');
  });
});

describe('panel/section_view renderSection', () => {
  const renderLinks = (overrides: Partial<IViewState> = {}): HTMLElement =>
    renderSection(
      'links',
      [LINK],
      view(overrides),
      nullTranslator.load('jest')
    );

  it('renders the label and the count as two spans', () => {
    const section = renderLinks();
    expect(
      section.querySelector('.jp-BookmarksPanel-sectionLabel')?.textContent
    ).toBe('LINKS');
    expect(
      section.querySelector('.jp-BookmarksPanel-sectionCount')?.textContent
    ).toBe('(1)');
  });

  it('keeps the count while the section is folded', () => {
    const section = renderLinks({ collapsed: new Set(['links']) });
    expect(
      section.querySelector('.jp-BookmarksPanel-sectionCount')?.textContent
    ).toBe('(1)');
    expect(section.querySelector('.jp-BookmarksPanel-sectionBody')).toBeNull();
  });

  it('shows the time since the tab was last present when it is not open', () => {
    const row = renderLinks({
      lastPresent: new Map([['a', NOW - 2 * 60 * 60_000]])
    }).querySelector<HTMLElement>('.jp-BookmarksPanel-row');
    expect(row?.querySelector('.jp-BookmarksPanel-rowTime')?.textContent).toBe(
      '2h ago'
    );
    expect(row?.getAttribute('aria-label')).toBe('A, 2h ago');
  });

  it('shows the dot, not the time, while the tab is open', () => {
    const row = renderLinks({
      open: new Set(['a']),
      lastPresent: new Map([['a', NOW - 2 * 60 * 60_000]])
    }).querySelector<HTMLElement>('.jp-BookmarksPanel-row');
    expect(row?.querySelector('.jp-BookmarksPanel-rowMark')).not.toBeNull();
    expect(row?.querySelector('.jp-BookmarksPanel-rowTime')).toBeNull();
    expect(row?.getAttribute('aria-label')).toBe('A, open');
  });

  it('draws the link icon for a saved icon that is no image, such as data:,', () => {
    const icon = renderSection(
      'links',
      [{ ...LINK, icon: 'data:,' }],
      view(),
      nullTranslator.load('jest')
    ).querySelector('.jp-BookmarksPanel-row')?.children[1] as HTMLElement;
    expect(icon.tagName).toBe('SPAN');
    expect(icon.dataset.icon).toBe('link');
  });

  it('draws the link icon once a saved icon fails to decode', () => {
    const row = renderSection(
      'links',
      [{ ...LINK, icon: 'data:image/png;base64,iVBORw0KGgo=' }],
      view(),
      nullTranslator.load('jest')
    ).querySelector('.jp-BookmarksPanel-row');
    expect(row?.children[1].tagName).toBe('IMG');
    row?.children[1].dispatchEvent(new Event('error'));
    const icon = row?.children[1] as HTMLElement;
    expect(icon.tagName).toBe('SPAN');
    expect(icon.dataset.icon).toBe('link');
  });

  it('shows no time for a bookmark whose tab was never present', () => {
    const row = renderLinks().querySelector<HTMLElement>(
      '.jp-BookmarksPanel-row'
    );
    expect(row?.querySelector('.jp-BookmarksPanel-rowTime')).toBeNull();
    expect(row?.getAttribute('aria-label')).toBe('A');
  });
});
