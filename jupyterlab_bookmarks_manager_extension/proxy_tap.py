"""The proxy tap: a wrapper of tornado's ``log_function`` that sees each open of a proxied page.

Tornado calls the ``log_function`` setting once per finished request, so the wrapper sees every
route that reaches jupyter-server-proxy: a command, a launcher tile, a typed URL, with or without a
lab page open. Without the proxy nothing is installed.
"""
import sys
import time
from collections.abc import Mapping
from importlib.metadata import entry_points
from pathlib import Path
from typing import Any
from urllib.parse import urlsplit, urlunsplit

# The settings key of the held list: a dict of url to entry, oldest first.
HELD_OPENS = "jupyterlab_bookmarks_manager_extension_proxy_opens"
# Holds the opens made while no lab page reads them, and each first read fetches a title per entry.
HELD_MAX = 100
SCHEMA_ID = "https://github.com/stellarshenson/jupyterlab_bookmarks_extension/events/proxy-open"
SCHEMA_PATH = Path(__file__).parent / "events" / "proxy_open.yaml"

OPEN_DESTS = {"document", "iframe", "frame"}
# The key list of jupyter_server.log._DEFAULT_SCRUB_PARAM_KEYS, matched as substrings.
SECRET_KEYS = ("token", "auth", "key", "code", "state", "xsrf")


def classify(
    method: str,
    status: int,
    headers: Mapping[str, str],
    backend_port: int,
    lab_port: int,
    proxy_prefixes: tuple[str, ...],
) -> str:
    """Decide whether one proxied request is the open of a page.

    Args:
        method: HTTP method of the request.
        status: Final status of the response.
        headers: Request headers.
        backend_port: Port the proxy forwarded to.
        lab_port: Port of this lab, read at request time.
        proxy_prefixes: Path prefixes of proxied pages, for the ``Referer`` check.

    Returns:
        ``"open"``, or the name of the rule that dropped the request.
    """
    if backend_port == lab_port:
        return "lab-port"
    if method != "GET":
        return "not-get"
    dest = headers.get("Sec-Fetch-Dest")
    if dest is None:
        if "text/html" not in headers.get("Accept", ""):
            return "not-html"
    elif dest not in OPEN_DESTS:
        return "subresource"
    if headers.get("Sec-Purpose"):
        return "prerender"
    if status >= 400:
        return "failed"
    # Not a finished page: 3xx except a revalidated 304, and a WebSocket's 101.
    if status != 304 and not 200 <= status < 300:
        return "not-final"
    if urlsplit(headers.get("Referer", "")).path.startswith(proxy_prefixes):
        return "in-page"
    return "open"


def scrub_query(uri: str) -> str:
    """Remove the query parameters whose name contains a secret key.

    Removes the parameter instead of masking its value, so that the stored URL still opens.
    """
    parts = urlsplit(uri)
    kept = [
        pair
        for pair in parts.query.split("&")
        if pair and not any(key in pair.partition("=")[0].lower() for key in SECRET_KEYS)
    ]
    return urlunsplit(parts._replace(query="&".join(kept)))


def new_browser_tab(headers: Mapping[str, str]) -> bool | None:
    """Tell a browser tab from a lab tab; None when the browser sent no fetch metadata."""
    dest = headers.get("Sec-Fetch-Dest")
    return None if dest is None else dest == "document"


def proxy_prefixes(serverapp: Any) -> tuple[str, ...]:
    """Return the path prefixes of proxied pages: ``<base>proxy/`` and each named server."""
    base = serverapp.base_url
    # The proxy's own reader: a `servers.update(...)` config stays lazy until a trait reads it.
    names = list(
        sys.modules["jupyter_server_proxy.config"].ServerProxy(config=serverapp.config).servers
    )
    # Names only, so that scanning them runs no third-party code.
    names += [entry.name for entry in entry_points(group="jupyter_serverproxy_servers")]
    return (f"{base}proxy/", *(f"{base}{name}/" for name in names))


def backend_port(handler: Any, named_class: type) -> int:
    """Return the port a proxy handler forwards to, for all three handler shapes."""
    if isinstance(handler, named_class):
        return int(handler.port)
    # Local handlers capture (port, path), remote handlers capture (host, port, path).
    return int(handler.path_args[-2])


def hold_open(held: dict[str, dict[str, Any]], uri: str, headers: Mapping[str, str]) -> None:
    """Put one open last in the held list, one entry per URL, the oldest dropped past the bound."""
    url = scrub_query(uri)
    held.pop(url, None)
    held[url] = {
        "url": url,
        "openedAt": int(time.time() * 1000),
        "newBrowserTab": new_browser_tab(headers),
    }
    if len(held) > HELD_MAX:
        del held[next(iter(held))]


def install_tap(serverapp: Any) -> None:
    """Wrap the ``log_function`` setting, when jupyter-server-proxy is loaded.

    Args:
        serverapp: The running ``ServerApp``.
    """
    proxy_handlers = sys.modules.get("jupyter_server_proxy.handlers")
    if proxy_handlers is None:
        return
    proxy_class = getattr(proxy_handlers, "ProxyHandler", None)
    named_class = getattr(proxy_handlers, "NamedLocalProxyHandler", None)
    if proxy_class is None or named_class is None:
        serverapp.log.warning(
            "The Proxy section of the bookmarks panel lists no pages: jupyter_server_proxy.handlers"
            " has no ProxyHandler or NamedLocalProxyHandler"
        )
        return

    settings = serverapp.web_app.settings
    held: dict[str, dict[str, Any]] = {}
    settings[HELD_OPENS] = held
    serverapp.event_logger.register_event_schema(SCHEMA_PATH)
    prefixes = proxy_prefixes(serverapp)
    previous = settings["log_function"]

    def tap(handler: Any) -> None:
        previous(handler)
        if not isinstance(handler, proxy_class):
            return
        # An exception here would make tornado finish the request a second time.
        try:
            request = handler.request
            port = backend_port(handler, named_class)
            verdict = classify(
                request.method, handler.get_status(), request.headers, port, serverapp.port, prefixes
            )
            if verdict == "open":
                hold_open(held, request.uri, request.headers)
                serverapp.event_logger.emit(schema_id=SCHEMA_ID, data={})
        except Exception:
            serverapp.log.exception("The proxy tap failed on one request")

    settings["log_function"] = tap
