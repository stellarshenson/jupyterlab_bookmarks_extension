"""POST favicon: the favicon of a page, fetched by the server."""
import json

import tornado
from jupyter_server.base.handlers import APIHandler

from .favicon_fetch import fetch_favicon


class FaviconHandler(APIHandler):
    """Answers `{"icon": <data URL or null>}` for `{"url": <http(s) page URL>}`."""

    @tornado.web.authenticated
    async def post(self) -> None:
        try:
            url = json.loads(self.request.body)["url"]
        except (ValueError, KeyError, TypeError):
            raise tornado.web.HTTPError(400, "Body must be JSON with a url")
        if not isinstance(url, str) or not url.startswith(("http://", "https://")):
            raise tornado.web.HTTPError(400, "url must be an http or https URL")
        self.finish(json.dumps({"icon": await fetch_favicon(url)}))
