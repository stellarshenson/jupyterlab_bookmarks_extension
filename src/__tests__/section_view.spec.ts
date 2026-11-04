import { nullTranslator } from '@jupyterlab/translation';
import { Node } from '../model/types';
import { IViewState } from '../panel/row_view';
import { renderRecentSection, renderSection } from '../panel/section_view';
import { IRecentProxyEntry } from '../recent/recent';

// The real package loads ES modules that this Jest configuration does not transform.
jest.mock('@jupyterlab/ui-components', () => {
  const icon = { element: () => document.createElement('span') };
  return { addIcon: icon, linkIcon: icon };
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

  it('shows no time for a bookmark whose tab was never present', () => {
    const row = renderLinks().querySelector<HTMLElement>(
      '.jp-BookmarksPanel-row'
    );
    expect(row?.querySelector('.jp-BookmarksPanel-rowTime')).toBeNull();
    expect(row?.getAttribute('aria-label')).toBe('A');
  });
});
