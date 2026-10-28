import { Widget } from '@lumino/widgets';
import { classifyTab } from '../classify/tab_kind';

const widgetWith = (html: string): Widget => {
  const widget = new Widget();
  widget.node.innerHTML = html;
  return widget;
};
const noContext = (): undefined => undefined;

describe('classify/tab_kind', () => {
  it('link kind only for one http(s) iframe', () => {
    expect(
      classifyTab(
        widgetWith('<iframe src="http://example.com/a"></iframe>'),
        noContext
      )
    ).toEqual({ kind: 'link', url: 'http://example.com/a' });
    expect(
      classifyTab(
        widgetWith('<iframe src="https://example.com/b"></iframe>'),
        noContext
      )
    ).toEqual({ kind: 'link', url: 'https://example.com/b' });
    expect(
      classifyTab(
        widgetWith(
          '<iframe src="https://a.example/"></iframe><iframe src="https://b.example/"></iframe>'
        ),
        noContext
      )
    ).toBeNull();
    expect(
      classifyTab(
        widgetWith('<iframe src="javascript:void(0)"></iframe>'),
        noContext
      )
    ).toBeNull();
    expect(
      classifyTab(
        widgetWith('<iframe src="file:///tmp/a.png"></iframe>'),
        noContext
      )
    ).toBeNull();
    expect(
      classifyTab(widgetWith('<div>launcher</div>'), noContext)
    ).toBeNull();
  });

  it('link records the address the frame shows, its src when unreadable', () => {
    const moved = widgetWith(
      '<iframe src="http://proxy.example/start"></iframe>'
    );
    Object.defineProperty(moved.node.querySelector('iframe'), 'contentWindow', {
      value: { location: { href: 'http://proxy.example/runs/7' } }
    });
    expect(classifyTab(moved, noContext)).toEqual({
      kind: 'link',
      url: 'http://proxy.example/runs/7'
    });

    const foreign = widgetWith(
      '<iframe src="http://other.example/a"></iframe>'
    );
    Object.defineProperty(
      foreign.node.querySelector('iframe'),
      'contentWindow',
      {
        value: {
          get location(): Location {
            throw new DOMException('Blocked a frame', 'SecurityError');
          }
        }
      }
    );
    expect(classifyTab(foreign, noContext)).toEqual({
      kind: 'link',
      url: 'http://other.example/a'
    });
  });

  it('a document widget gives file, even with an iframe inside', () => {
    const widget = widgetWith('<iframe src="http://example.com/"></iframe>');
    expect(classifyTab(widget, () => ({ path: 'dir/a.html' }))).toEqual({
      kind: 'file',
      path: 'dir/a.html'
    });
  });

  it('a terminal gives terminal', () => {
    const widget = Object.assign(new Widget(), {
      content: { session: { name: '3' } }
    });
    expect(classifyTab(widget, noContext)).toEqual({
      kind: 'terminal',
      name: '3'
    });
  });
});
