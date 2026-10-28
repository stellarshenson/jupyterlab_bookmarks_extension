import http.server
import json
import threading

import pytest

PNG = b"\x89PNG\r\n\x1a\n" + b"0" * 20
PAGES = {
    "/rel/": ('<html><head><link rel="shortcut icon" href="icons/a.png"></head></html>', "text/html"),
    "/rel/icons/a.png": (PNG, "image/png"),
    "/data/": ('<link rel="icon" href="data:image/png;base64,QQ==">', "text/html"),
    "/app/": ("<html></html>", "text/html"),
    "/app/favicon.ico": (PNG, "image/x-icon"),
    "/favicon.ico": (b"root", "image/x-icon"),
    "/none/": ("<html></html>", "text/html"),
    "/big/": ('<link rel="icon" href="big.png">', "text/html"),
    "/big/big.png": (b"0" * 30000, "image/png"),
}


class _Handler(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        body, content_type = PAGES.get(self.path, (None, None))
        if body is None:
            self.send_error(404)
            return
        body = body.encode() if isinstance(body, str) else body
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *args):
        pass


@pytest.fixture(scope="module")
def site():
    server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), _Handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    yield f"http://127.0.0.1:{server.server_port}"
    server.shutdown()
    server.server_close()


async def _icon(jp_fetch, url):
    response = await jp_fetch(
        "jupyterlab-bookmarks-extension", "favicon", method="POST", body=json.dumps({"url": url})
    )
    assert response.code == 200
    return json.loads(response.body)["icon"]


async def test_link_rel_icon(jp_fetch, site):
    assert await _icon(jp_fetch, site + "/rel/") == "data:image/png;base64,iVBORw0KGgowMDAwMDAwMDAwMDAwMDAwMDAwMA=="
    assert await _icon(jp_fetch, site + "/data/") == "data:image/png;base64,QQ=="


async def test_favicon_ico_beside_page(jp_fetch, site):
    icon = await _icon(jp_fetch, site + "/app/")
    assert icon.startswith("data:image/x-icon;base64,")
    assert icon != "data:image/x-icon;base64,cm9vdA=="


async def test_missing_icon_gives_null(jp_fetch, site):
    assert await _icon(jp_fetch, site + "/none/") is None


async def test_oversize_icon_gives_null(jp_fetch, site):
    assert await _icon(jp_fetch, site + "/big/") is None


@pytest.mark.parametrize("body", ["not json", "{}", '{"url": "ftp://x/"}', '{"url": 5}'])
async def test_bad_request_gives_400(jp_fetch, body):
    response = await jp_fetch(
        "jupyterlab-bookmarks-extension", "favicon", method="POST", body=body, raise_error=False
    )
    assert response.code == 400
