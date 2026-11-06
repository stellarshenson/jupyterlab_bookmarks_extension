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

# The settings key of the held list: a dict of url, or url and " in-app", to entry, oldest first.
HELD_OPENS = "jupyterlab_bookmarks_manager_extension_proxy_opens"
# The settings key of the installed tap, so a repeat install replaces its own wrapper.
TAP_INSTALLED = "jupyterlab_bookmarks_manager_extension_proxy_tap"
# Holds the opens made while no lab page reads them, and each first read fetches a title per entry.
HELD_MAX = 100
SCHEMA_ID = "https://github.com/stellarshenson/jupyterlab_bookmarks_extension/events/proxy-open"
SCHEMA_PATH = Path(__file__).parent / "events" / "proxy_open.yaml"

OPEN_DESTS = {"document", "iframe", "frame"}
# The key list of jupyter_server.log._DEFAULT_SCRUB_PARAM_KEYS, matched as substrings.
SECRET_KEYS = ("token", "auth", "key", "code", "state", "xsrf")


def service(path: str, prefixes: tuple[str, ...]) -> str | None:
    """Return the proxied service a path is on: ``<base>proxy/[absolute/]<[host:]port>/`` or a named server's prefix."""
    for prefix in prefixes:
        if path.startswith(prefix):
            if prefix != prefixes[0]:
                return prefix
            parts = path[len(prefix) :].split("/")
            return prefix + "/".join(parts[: 2 if parts[0] == "absolute" else 1]) + "/"
    return None


def classify(
    method: str,
    path: str,
    status: int,
    headers: Mapping[str, str],
    backend_port: int,
    lab_port: int,
    proxy_prefixes: tuple[str, ...],
    response_type: str,
) -> str:
    """Decide whether one proxied request is the open of a page.

    Args:
        method: HTTP method of the request.
        path: Path of the request.
        status: Final status of the response.
        headers: Request headers.
        backend_port: Port the proxy forwarded to.
        lab_port: Port of this lab, read at request time.
        proxy_prefixes: Path prefixes of proxied pages, ``<base>proxy/`` first, for the ``Referer`` check.
        response_type: ``Content-Type`` of the response, empty when it has none.

    Returns:
        ``"open"``, ``"in-app"`` for the next page of an app in a browser tab, or the name of the
        rule that dropped the request.
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
    referer = urlsplit(headers.get("Referer", "")).path
    if referer.startswith(proxy_prefixes):
        # A top-level navigation inside the app in a browser tab opens its next page; a frame never
        # does, since Chromium sends Sec-Fetch-User ?1 also for a frame embedded after a click.
        if (
            dest == "document"
            and service(referer, proxy_prefixes) == service(path, proxy_prefixes)
            # A download or a 204 loads no page; tornado strips Content-Type from a 304.
            and (status == 304 or "text/html" in response_type)
        ):
            return "in-app"
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


def hold_open(
    held: dict[str, dict[str, Any]], uri: str, headers: Mapping[str, str], in_app: bool = False
) -> None:
    """Put one open last in the held list, one entry per URL and kind, the oldest dropped past the bound.

    ``in_app`` marks the next page of an app in a browser tab: it renames a listed row, adds none.
    """
    url = scrub_query(uri)
    key = f"{url} in-app" if in_app else url
    # An in-app page never replaces the open of its URL; an open replaces both.
    held.pop(f"{url} in-app", None)
    held.pop(key, None)
    held[key] = {
        "url": url,
        "openedAt": int(time.time() * 1000),
        "newBrowserTab": new_browser_tab(headers),
        "inApp": in_app,
    }
    if len(held) > HELD_MAX:
        del held[next(iter(held))]


def install_tap(serverapp: Any) -> None:
    """Wrap the ``log_function`` setting, when jupyter-server-proxy is loaded.

    Safe to call again in the same process: a soft reload re-runs the extension's load. A second
    install replaces the wrapper it installed before with a fresh one over the function that
    wrapper wrapped, and keeps the held dict.

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
    previous = settings["log_function"]
    if settings.get(TAP_INSTALLED) is previous and (
        getattr(previous, "__wrapped__", None) is not None
    ):
        previous = previous.__wrapped__
    held: dict[str, dict[str, Any]] = settings.setdefault(HELD_OPENS, {})
    if SCHEMA_ID not in serverapp.event_logger.schemas:
        serverapp.event_logger.register_event_schema(SCHEMA_PATH)
    prefixes = proxy_prefixes(serverapp)

    def tap(handler: Any) -> None:
        previous(handler)
        if not isinstance(handler, proxy_class):
            return
        # An exception here would make tornado finish the request a second time.
        try:
            request = handler.request
            port = backend_port(handler, named_class)
            verdict = classify(
                request.method,
                request.path,
                handler.get_status(),
                request.headers,
                port,
                serverapp.port,
                prefixes,
                handler._headers.get("Content-Type", ""),
            )
            if verdict in ("open", "in-app"):
                hold_open(held, request.uri, request.headers, verdict == "in-app")
                serverapp.event_logger.emit(schema_id=SCHEMA_ID, data={})
        except Exception:
            serverapp.log.exception("The proxy tap failed on one request")

    tap.__wrapped__ = previous
    settings[TAP_INSTALLED] = tap
    settings["log_function"] = tap
