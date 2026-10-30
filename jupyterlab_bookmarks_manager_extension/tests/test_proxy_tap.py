"""The proxy tap against a stub server and against the real jupyter-server-proxy."""
import asyncio
import json
import sys
import time
from types import ModuleType, SimpleNamespace
from unittest.mock import MagicMock

import pytest
import tornado.web
from jupyter_server_proxy.handlers import NamedLocalProxyHandler
from tornado.httpserver import HTTPServer
from tornado.httputil import HTTPHeaders, HTTPServerRequest, RequestStartLine
from tornado.testing import bind_unused_port
from traitlets.config import Config

from jupyterlab_bookmarks_manager_extension import proxy_tap
from jupyterlab_bookmarks_manager_extension.proxy_tap import (
    HELD_MAX,
    HELD_OPENS,
    backend_port,
    classify,
    hold_open,
    install_tap,
    new_browser_tab,
    proxy_prefixes,
    scrub_query,
)

LAB_PORT = 8888
BACKEND_PORT = 5555
PREFIXES = ("/proxy/", "/vapp/")
DOCUMENT = {"Sec-Fetch-Dest": "document"}
PROXY_MODULE = "jupyter_server_proxy.handlers"


@pytest.fixture
def jp_server_config(jp_server_config):
    config = jp_server_config["ServerApp"]
    config["jpserver_extensions"]["jupyter_server_proxy"] = True
    jp_server_config["ServerProxy"] = {
        "servers": {
            "vcommand": {"command": ["true"], "port": 5600},
            "vport": {"port": 5601},
        }
    }
    return jp_server_config


@pytest.fixture
def jp_base_url():
    # At the root, /proxy/<lab port>/api/status reaches a real page of this lab.
    return "/"


def stub_serverapp(previous):
    """A server with only what ``install_tap`` reads."""
    return SimpleNamespace(
        base_url="/",
        port=LAB_PORT,
        config=Config(),
        log=MagicMock(),
        event_logger=MagicMock(),
        web_app=SimpleNamespace(settings={"log_function": previous}),
    )


def verdict(method="GET", status=200, port=BACKEND_PORT, **headers):
    names = {name.replace("_", "-"): value for name, value in headers.items()}
    return classify(method, status, HTTPHeaders(names), port, LAB_PORT, PREFIXES)


@pytest.mark.parametrize(
    "expected, kwargs",
    [
        ("open", {"Sec_Fetch_Dest": "document"}),
        ("open", {"Sec_Fetch_Dest": "iframe"}),
        ("open", {"Sec_Fetch_Dest": "frame", "status": 304}),
        ("open", {"Accept": "text/html,*/*"}),
        ("open", {"Sec_Fetch_Dest": "document", "Referer": "http://lab/lab/tree/a"}),
        ("lab-port", {"Sec_Fetch_Dest": "document", "port": LAB_PORT}),
        ("lab-port", {"method": "POST", "status": 302, "port": LAB_PORT}),
        ("not-get", {"method": "HEAD", "Sec_Fetch_Dest": "document"}),
        ("not-html", {"Accept": "*/*"}),
        ("not-html", {}),
        ("subresource", {"Sec_Fetch_Dest": "image"}),
        ("subresource", {"Sec_Fetch_Dest": "empty", "Accept": "text/html"}),
        ("prerender", {"Sec_Fetch_Dest": "document", "Sec_Purpose": "prefetch"}),
        ("failed", {"Sec_Fetch_Dest": "document", "status": 500}),
        ("not-final", {"Sec_Fetch_Dest": "document", "status": 302}),
        ("not-final", {"Accept": "text/html", "status": 101}),
        ("in-page", {"Sec_Fetch_Dest": "iframe", "Referer": "http://lab/proxy/5555/a"}),
        ("in-page", {"Sec_Fetch_Dest": "document", "Referer": "http://lab/vapp/a"}),
    ],
)
def test_filter_table(expected, kwargs):
    assert verdict(**kwargs) == expected


@pytest.mark.parametrize(
    "uri, expected",
    [
        ("/proxy/1/x", "/proxy/1/x"),
        ("/proxy/1/x?keep=1", "/proxy/1/x?keep=1"),
        ("/proxy/1/x?token=FAKE", "/proxy/1/x"),
        ("/proxy/1/x?token=FAKE&keep=1&API_KEY=FAKE", "/proxy/1/x?keep=1"),
        ("/proxy/1/x?oauth=a&code=b&state=c&_xsrf=d&keep", "/proxy/1/x?keep"),
        # The match is by substring, as in jupyter_server's own log scrub.
        ("/proxy/1/x?barcode=a&password=b", "/proxy/1/x?password=b"),
    ],
)
def test_scrub_table(uri, expected):
    assert scrub_query(uri) == expected


def test_new_browser_tab_is_unknown_without_fetch_metadata():
    assert new_browser_tab(HTTPHeaders(DOCUMENT)) is True
    assert new_browser_tab(HTTPHeaders({"Sec-Fetch-Dest": "iframe"})) is False
    assert new_browser_tab(HTTPHeaders({})) is None


def test_held_list_has_one_entry_per_url_and_a_bound():
    held = {}
    hold_open(held, "/proxy/1/a?token=FAKE", HTTPHeaders(DOCUMENT))
    hold_open(held, "/proxy/1/b", HTTPHeaders({}))
    hold_open(held, "/proxy/1/a", HTTPHeaders({"Sec-Fetch-Dest": "iframe"}))
    assert list(held) == ["/proxy/1/b", "/proxy/1/a"]
    assert held["/proxy/1/a"]["newBrowserTab"] is False
    assert held["/proxy/1/b"]["newBrowserTab"] is None
    for number in range(HELD_MAX):
        hold_open(held, f"/proxy/2/{number}", HTTPHeaders({}))
    assert len(held) == HELD_MAX
    assert "/proxy/1/a" not in held


def test_prefixes_hold_the_config_and_entry_point_servers(monkeypatch):
    monkeypatch.setattr(
        proxy_tap, "entry_points", lambda group: [SimpleNamespace(name=f"{group}-vep")]
    )
    serverapp = stub_serverapp(print)
    serverapp.base_url = "/user/star/"
    serverapp.config.ServerProxy.servers = {"vapp": {}}
    assert proxy_prefixes(serverapp) == (
        "/user/star/proxy/",
        "/user/star/vapp/",
        "/user/star/jupyter_serverproxy_servers-vep/",
    )
    serverapp.config = Config()
    serverapp.config.ServerProxy.servers.update({"vupdate": {}})
    assert proxy_prefixes(serverapp) == (
        "/user/star/proxy/",
        "/user/star/vupdate/",
        "/user/star/jupyter_serverproxy_servers-vep/",
    )


def test_inert_without_the_proxy(monkeypatch):
    monkeypatch.delitem(sys.modules, PROXY_MODULE, raising=False)
    serverapp = stub_serverapp(print)
    install_tap(serverapp)
    assert serverapp.web_app.settings == {"log_function": print}
    serverapp.log.warning.assert_not_called()


def test_one_warning_when_the_proxy_classes_are_gone(monkeypatch):
    monkeypatch.setitem(sys.modules, PROXY_MODULE, ModuleType(PROXY_MODULE))
    serverapp = stub_serverapp(print)
    install_tap(serverapp)
    assert serverapp.web_app.settings["log_function"] is print
    serverapp.log.warning.assert_called_once()


def test_wrapper_calls_through_and_survives_an_exception(monkeypatch):
    class Proxy:
        path_args = ()

    class Named(Proxy):
        pass

    fake = ModuleType(PROXY_MODULE)
    fake.ProxyHandler = Proxy
    fake.NamedLocalProxyHandler = Named
    monkeypatch.setitem(sys.modules, PROXY_MODULE, fake)
    previous = MagicMock()
    serverapp = stub_serverapp(previous)
    install_tap(serverapp)
    tap = serverapp.web_app.settings["log_function"]

    other = object()
    tap(other)
    previous.assert_called_once_with(other)
    serverapp.log.exception.assert_not_called()

    # path_args is empty, so reading the port raises.
    broken = Proxy()
    tap(broken)
    previous.assert_called_with(broken)
    serverapp.log.exception.assert_called_once()
    assert serverapp.web_app.settings[HELD_OPENS] == {}


def real_handler(serverapp, uri):
    """A handler built the way tornado builds it, from the route the proxy registered for ``uri``."""
    start_line = RequestStartLine("GET", uri, "HTTP/1.1")
    headers = HTTPHeaders({"Host": "localhost"})
    request = HTTPServerRequest(start_line=start_line, headers=headers, connection=MagicMock())
    delegate = serverapp.web_app.find_handler(request)
    handler = delegate.handler_class(serverapp.web_app, request, **delegate.handler_kwargs)
    handler.path_args = delegate.path_args
    return handler


@pytest.mark.parametrize(
    "uri, expected",
    [
        ("/proxy/5555/x", 5555),
        ("/proxy/5555", 5555),
        ("/proxy/absolute/5555/x", 5555),
        ("/proxy/localhost:5555/x", 5555),
        ("/proxy/127.0.0.1:5555/", 5555),
        ("/proxy/absolute/localhost:5555/x", 5555),
        ("/vcommand/x", 5600),
        ("/vport/x", 5601),
    ],
)
def test_port_read_from_the_real_routes(jp_serverapp, uri, expected):
    # An upgrade that moves the captures or renames the classes fails here.
    handler = real_handler(jp_serverapp, uri)
    assert isinstance(handler, sys.modules[PROXY_MODULE].ProxyHandler)
    assert backend_port(handler, NamedLocalProxyHandler) == expected


def test_lab_rule_on_the_real_routes(jp_serverapp):
    lab = jp_serverapp.port
    for uri in (f"/proxy/{lab}/lab", f"/proxy/localhost:{lab}/lab", f"/proxy/127.0.0.1:{lab}/lab"):
        handler = real_handler(jp_serverapp, uri)
        port = backend_port(handler, NamedLocalProxyHandler)
        assert classify("GET", 200, HTTPHeaders(DOCUMENT), port, lab, ()) == "lab-port"
    # A route of the lab itself is not a proxy handler, so the wrapper never classifies it.
    assert not isinstance(
        real_handler(jp_serverapp, "/api/status"), sys.modules[PROXY_MODULE].ProxyHandler
    )


def start_backend():
    """A real service on a free port; the caller stops it."""

    class Page(tornado.web.RequestHandler):
        def get(self, _path):
            self.finish("<title>Page</title>")

    socket, port = bind_unused_port()
    server = HTTPServer(tornado.web.Application([(r"/(.*)", Page)]))
    server.add_sockets([socket])
    return server, port


async def held_opens(jp_fetch):
    response = await jp_fetch("jupyterlab-bookmarks-manager-extension", "proxy-opens")
    return json.loads(response.body)


async def test_real_requests_through_the_proxy(jp_fetch, jp_serverapp):
    # One test: without this extension too, a proxied request in a later test of the process hangs.
    events = []

    async def listener(logger, schema_id, data):
        events.append(schema_id)

    jp_serverapp.event_logger.add_listener(schema_id=proxy_tap.SCHEMA_ID, listener=listener)
    server, port = start_backend()
    before = int(time.time() * 1000)
    try:
        response = await jp_fetch(
            "proxy", str(port), "page", params={"api_key": "FAKE", "keep": "1"}, headers=DOCUMENT
        )
        assert response.code == 200
        await jp_fetch("proxy", str(port), "logo.png", headers={"Sec-Fetch-Dest": "image"})
    finally:
        server.stop()
    # The answer is a real 200, so only the lab rule keeps this page out.
    lab = await jp_fetch("proxy", str(jp_serverapp.port), "api", "status", headers=DOCUMENT)
    assert lab.code == 200
    await asyncio.sleep(0)

    held = await held_opens(jp_fetch)
    assert [entry["url"] for entry in held] == [f"/proxy/{port}/page?keep=1"]
    assert held[0]["newBrowserTab"] is True
    assert before <= held[0]["openedAt"] <= int(time.time() * 1000)
    assert events == [proxy_tap.SCHEMA_ID]


async def test_route_needs_authentication(jp_serverapp, http_server_client):
    response = await http_server_client.fetch(
        "/jupyterlab-bookmarks-manager-extension/proxy-opens", raise_error=False
    )
    assert response.code == 403
