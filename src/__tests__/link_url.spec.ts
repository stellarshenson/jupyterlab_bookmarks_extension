import { toAbsoluteUrl, toStoredUrl, withScheme } from '../link/link_url';

const base = 'http://lab.example:8888/user/kj/';

describe('link/link_url', () => {
  it('lab URL stored relative, remote absolute', () => {
    expect(toStoredUrl(`${base}proxy/8501/`, base)).toBe('proxy/8501/');
    expect(toStoredUrl('https://example.com/page', base)).toBe(
      'https://example.com/page'
    );
    // Another port on the same host is another origin, not a lab path.
    expect(toStoredUrl('http://lab.example:9000/user/kj/a', base)).toBe(
      'http://lab.example:9000/user/kj/a'
    );
    expect(toAbsoluteUrl('proxy/8501/', 'https://other.example/user/kj/')).toBe(
      'https://other.example/user/kj/proxy/8501/'
    );
    expect(toAbsoluteUrl('https://example.com/page', base)).toBe(
      'https://example.com/page'
    );
  });

  it('a path typed with a leading slash resolves on the origin', () => {
    expect(toStoredUrl('/user/kj/files/a.html', base)).toBe('files/a.html');
  });

  it('a stored path with a leading slash opens on the origin (DEF-LINK-65-CLI-SLASH)', () => {
    expect(toAbsoluteUrl('/lab/tree/README.md', base)).toBe(
      'http://lab.example:8888/lab/tree/README.md'
    );
  });

  it('a typed host name with no scheme gets https (DEF-LINK-66-NO-SCHEME)', () => {
    expect(withScheme('example.com/page')).toBe('https://example.com/page');
    expect(withScheme('docs.python.org')).toBe('https://docs.python.org');
    // A lab path and a full URL stay as typed.
    expect(withScheme('proxy/8501/')).toBe('proxy/8501/');
    expect(withScheme('/lab/tree/a.md')).toBe('/lab/tree/a.md');
    expect(withScheme('http://example.com/')).toBe('http://example.com/');
  });
});
