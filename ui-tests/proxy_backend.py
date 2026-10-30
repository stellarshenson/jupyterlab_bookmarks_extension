"""A real service behind the proxy, for the specs that need the server to see an open.

Usage: python proxy_backend.py <port>. Any path answers a page titled by its last segment, holding
an image, a fetch and a WebSocket. The page marks its body when all three have answered.
"""
import asyncio
import html
import sys
from urllib.parse import unquote

import tornado.web
import tornado.websocket

LOGO = '<svg xmlns="http://www.w3.org/2000/svg" width="4" height="4"><rect width="4" height="4"/></svg>'
REQUESTS = """<img id="logo" src="logo.svg" alt="">
<script>
  const socketUrl = new URL('echo', location.href);
  socketUrl.protocol = socketUrl.protocol.replace('http', 'ws');
  socketUrl.search = '';
  const socket = new WebSocket(socketUrl);
  socket.onopen = () => socket.send('ping');
  Promise.all([
    new Promise(answered => { socket.onmessage = answered; }),
    new Promise(answered => { document.getElementById('logo').onload = answered; }),
    fetch('feed.json', { headers: { Accept: 'text/html' } })
  ]).then(() => { document.body.dataset.done = 'yes'; });
</script>"""


class PageHandler(tornado.web.RequestHandler):
    """A page titled by the last segment of its path; `untitled` has no title."""

    def get(self) -> None:
        name = unquote(self.request.path.rstrip("/").rpartition("/")[2])
        title = "" if name == "untitled" else f"<title>{html.escape(name)}</title>"
        self.finish(f"<!doctype html><html><head>{title}</head><body>{REQUESTS}</body></html>")


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


async def main(port: int) -> None:
    """Serve until the process is stopped."""
    routes = [
        (r".*/logo\.svg", LogoHandler),
        (r".*/feed\.json", FeedHandler),
        (r".*/echo", EchoHandler),
        (r".*/moved/?", RedirectHandler),
        (r".*", PageHandler),
    ]
    tornado.web.Application(routes).listen(port, address="127.0.0.1")
    await asyncio.Event().wait()


if __name__ == "__main__":
    asyncio.run(main(int(sys.argv[1])))
