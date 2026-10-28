"""Find and fetch the favicon of a page as a data URL."""
import base64
from html.parser import HTMLParser
from urllib.parse import urljoin

from tornado.httpclient import AsyncHTTPClient, HTTPError

MAX_ICON_CHARS = 32768
MAX_BODY_BYTES = 1024 * 1024
TIMEOUT_SECONDS = 5


class _IconLinkParser(HTMLParser):
    """Keeps the href of the first `<link rel~="icon">`."""

    href: str | None = None

    def handle_starttag(self, tag: str, attrs: list) -> None:
        values = dict(attrs)
        if tag == "link" and self.href is None and values.get("href"):
            if "icon" in (values.get("rel") or "").lower().split():
                self.href = values["href"]


def _acceptable(icon: str) -> str | None:
    return icon if len(icon) <= MAX_ICON_CHARS else None


async def fetch_favicon(page_url: str) -> str | None:
    """Return the page's favicon as a data URL, or None when there is none.

    Every fetch error, non-200 answer, non-image answer or oversize icon gives
    None, because the icon is optional.
    """
    client = AsyncHTTPClient(force_instance=True, max_body_size=MAX_BODY_BYTES)
    try:
        page = await client.fetch(page_url, request_timeout=TIMEOUT_SECONDS)
        parser = _IconLinkParser()
        parser.feed(page.body.decode(errors="replace"))
        if parser.href and parser.href.startswith("data:image/"):
            return _acceptable(parser.href)
        icon_url = urljoin(page.effective_url, parser.href or "favicon.ico")
        icon = await client.fetch(icon_url, request_timeout=TIMEOUT_SECONDS)
    except (HTTPError, OSError, ValueError):
        return None
    finally:
        client.close()
    content_type = icon.headers.get("Content-Type", "").split(";")[0].strip()
    if not content_type.startswith("image/"):
        return None
    encoded = base64.b64encode(icon.body).decode()
    return _acceptable(f"data:{content_type};base64,{encoded}")
