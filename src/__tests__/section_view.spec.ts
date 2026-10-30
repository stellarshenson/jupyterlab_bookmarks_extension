import { nullTranslator } from '@jupyterlab/translation';
import { IViewState } from '../panel/row_view';
import { renderRecentSection } from '../panel/section_view';
import { IRecentProxyEntry } from '../recent/recent';

// The real package loads ES modules that this Jest configuration does not transform.
jest.mock('@jupyterlab/ui-components', () => {
  const icon = { element: () => document.createElement('span') };
  return { addIcon: icon, linkIcon: icon };
});

const render = (
  canOpenProxy: boolean,
  recent: IRecentProxyEntry[] = []
): HTMLElement =>
  renderRecentSection(
    {
      collapsed: new Set(),
      filtering: false,
      recent,
      stops: {},
      now: 0,
      canOpenProxy
    } as unknown as IViewState,
    nullTranslator.load('jest')
  );

describe('panel/section_view renderRecentSection', () => {
  it('names the section Proxy', () => {
    const section = render(true);
    expect(
      section.querySelector('.jp-BookmarksPanel-sectionLabel')?.textContent
    ).toBe('PROXY (0)');
    expect(
      section.querySelector('[role="tree"]')?.getAttribute('aria-label')
    ).toBe('Proxy');
    expect(section.querySelector('.jp-BookmarksPanel-empty')?.textContent).toBe(
      'No proxy pages.'
    );
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
