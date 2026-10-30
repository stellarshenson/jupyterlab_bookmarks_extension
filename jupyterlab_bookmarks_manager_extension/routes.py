"""Registration of the extension's server routes."""
from jupyter_server.utils import url_path_join

from .favicon_handler import FaviconHandler
from .old_settings_handler import OldSettingsHandler
from .proxy_opens_handler import ProxyOpensHandler
from .terminals_handler import TerminalsHandler


def setup_route_handlers(web_app) -> None:
    """Register `terminals`, `favicon`, `proxy-opens` and `old-settings` under `<base_url>/jupyterlab-bookmarks-manager-extension/`."""
    base = url_path_join(web_app.settings["base_url"], "jupyterlab-bookmarks-manager-extension")
    handlers = [
        (url_path_join(base, "terminals"), TerminalsHandler),
        (url_path_join(base, "favicon"), FaviconHandler),
        (url_path_join(base, "proxy-opens"), ProxyOpensHandler),
        (url_path_join(base, "old-settings"), OldSettingsHandler),
    ]
    web_app.add_handlers(".*$", handlers)
