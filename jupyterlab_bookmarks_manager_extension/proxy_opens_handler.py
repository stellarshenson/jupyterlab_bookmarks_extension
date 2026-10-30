"""GET proxy-opens: the pages the proxy tap holds."""
import json

import tornado
from jupyter_server.base.handlers import APIHandler

from .proxy_tap import HELD_OPENS


class ProxyOpensHandler(APIHandler):
    """Lists url, openedAt and newBrowserTab of each held open, oldest first."""

    @tornado.web.authenticated
    def get(self) -> None:
        self.finish(json.dumps(list(self.settings.get(HELD_OPENS, {}).values())))
