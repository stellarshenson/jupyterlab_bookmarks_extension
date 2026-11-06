"""A real service behind the proxy, for the specs that need the server to see an open.

Usage: python proxy_backend.py <port>... Each port is one service. Any path answers a page titled by its last segment, holding
an image, a fetch and a link `#beta` to the page `beta` beside it. The page marks its body when the image and the fetch
have answered. A path that ends in `embeds` also holds an iframe of the page `embedded` beside it. A path that ends in
`iconic` declares `logo.svg` beside it as its icon, a path that ends in `blankicon` declares `data:,`, an empty data URL
that is no image, and a path that ends in `emptypng` declares `data:image/png;base64,iVBORw0KGgo=`, a PNG signature that
does not decode; no other page declares one. A path that ends in `echo` is a WebSocket
that sends each message back.
"""
import asyncio
import html
import sys
from urllib.parse import unquote

import tornado.web
import tornado.websocket

LOGO = '<svg xmlns="http://www.w3.org/2000/svg" width="4" height="4"><rect width="4" height="4"/></svg>'
ICONS = {
    "iconic": '<link rel="icon" href="logo.svg">',
    "blankicon": '<link rel="icon" href="data:,">',
    "emptypng": '<link rel="icon" href="data:image/png;base64,iVBORw0KGgo=">',
}
REQUESTS = """<a id="beta" href="../beta/">beta</a>
<img id="logo" alt="">
<script>
  Promise.all([
    new Promise(answered => {
      const logo = document.getElementById('logo');
      logo.onload = answered;
      logo.src = 'logo.svg';
    }),
    fetch('feed.json', { headers: { Accept: 'text/html' } })
  ]).then(() => { document.body.dataset.done = 'yes'; });
</script>"""


class PageHandler(tornado.web.RequestHandler):
    """A page titled by the last segment of its path; `untitled` has no title."""

    def get(self) -> None:
        name = unquote(self.request.path.rstrip("/").rpartition("/")[2])
        title = "" if name == "untitled" else f"<title>{html.escape(name)}</title>"
        frame = '<iframe src="../embedded/"></iframe>' if name == "embeds" else ""
        icon = ICONS.get(name, "")
        self.finish(
            f"<!doctype html><html><head>{title}{icon}</head><body>{REQUESTS}{frame}</body></html>"
        )


class RedirectHandler(tornado.web.RequestHandler):
    """Sends the browser to the page `final` beside it."""

    def get(self) -> None:
        self.redirect("final")


class LogoHandler(tornado.web.RequestHandler):
    def get(self) -> None:
        self.set_header("Content-Type", "image/svg+xml")
        self.finish(LOGO)


class FeedHandler(tornado.web.RequestHandler):
    def get(self) -> None:
        self.finish({"ok": True})


class EchoHandler(tornado.websocket.WebSocketHandler):
    def check_origin(self, origin: str) -> bool:
        return True

    def on_message(self, message: str | bytes) -> None:
        self.write_message(message)


async def main(ports: list[int]) -> None:
    """Serve until the process is stopped."""
    routes = [
        (r".*/logo\.svg", LogoHandler),
        (r".*/feed\.json", FeedHandler),
        (r".*/echo", EchoHandler),
        (r".*/moved/?", RedirectHandler),
        (r".*", PageHandler),
    ]
    for port in ports:
        tornado.web.Application(routes).listen(port, address="127.0.0.1")
    await asyncio.Event().wait()


if __name__ == "__main__":
    asyncio.run(main([int(port) for port in sys.argv[1:]]))
