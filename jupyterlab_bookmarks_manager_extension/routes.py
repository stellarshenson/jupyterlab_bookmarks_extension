"""Registration of the extension's server routes."""
from jupyter_server.utils import url_path_join

from .favicon_handler import FaviconHandler
from .terminals_handler import TerminalsHandler


def setup_route_handlers(web_app) -> None:
    """Register `terminals` and `favicon` under `<base_url>/jupyterlab-bookmarks-manager-extension/`."""
    base = url_path_join(web_app.settings["base_url"], "jupyterlab-bookmarks-manager-extension")
    handlers = [
        (url_path_join(base, "terminals"), TerminalsHandler),
        (url_path_join(base, "favicon"), FaviconHandler),
    ]
    web_app.add_handlers(".*$", handlers)
