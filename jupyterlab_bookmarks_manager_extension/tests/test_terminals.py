import asyncio
import json

import pytest


@pytest.fixture
def jp_server_config(jp_server_config):
    config = jp_server_config["ServerApp"]
    config["jpserver_extensions"]["jupyter_server_terminals"] = True
    config["terminado_settings"] = {"shell_command": ["/bin/sh"]}
    return jp_server_config


async def test_unauthenticated_request_is_refused(jp_base_url, jp_serverapp, http_server_client):
    response = await http_server_client.fetch(
        f"{jp_base_url}jupyterlab-bookmarks-manager-extension/terminals", raise_error=False
    )
    assert response.code == 403


async def test_lists_foreground_process(jp_fetch, jp_serverapp, tmp_path):
    cwd = str(tmp_path.resolve())
    response = await jp_fetch("api", "terminals", method="POST", body=json.dumps({"cwd": cwd}))
    name = json.loads(response.body)["name"]
    manager = jp_serverapp.web_app.settings["terminal_manager"]
    manager.terminals[name].ptyproc.write("export K=v; sleep 30\r")
    try:
        entry = None
        for _ in range(50):
            listing = await jp_fetch("jupyterlab-bookmarks-manager-extension", "terminals")
            entry = next(t for t in json.loads(listing.body)["terminals"] if t["name"] == name)
            if entry["command"] == "sleep 30":
                break
            await asyncio.sleep(0.1)
        assert entry["command"] == "sleep 30"
        assert entry["cwd"] == cwd
        assert entry["env"]["K"] == "v"
    finally:
        await manager.terminate(name, force=True)


def type_line(jp_fetch, body):
    """POST `body` to the extension's `terminals` route and return the answer."""
    return jp_fetch(
        "jupyterlab-bookmarks-manager-extension",
        "terminals",
        method="POST",
        body=json.dumps(body),
        raise_error=False,
    )


async def test_post_writes_the_line_to_the_pty_before_it_answers(jp_fetch, jp_serverapp, monkeypatch):
    response = await jp_fetch("api", "terminals", method="POST", body="{}")
    name = json.loads(response.body)["name"]
    manager = jp_serverapp.web_app.settings["terminal_manager"]
    written = []
    monkeypatch.setattr(manager.terminals[name].ptyproc, "write", written.append)
    try:
        response = await type_line(jp_fetch, {"name": name, "line": "sleep 30\r"})
        assert response.code == 204
        assert written == ["sleep 30\r"]
    finally:
        monkeypatch.undo()
        await manager.terminate(name, force=True)


async def listed(jp_fetch, name):
    """The entry of terminal `name` in GET terminals."""
    listing = await jp_fetch("jupyterlab-bookmarks-manager-extension", "terminals")
    return next(t for t in json.loads(listing.body)["terminals"] if t["name"] == name)


async def test_a_marked_terminal_is_pending_until_its_line_is_written(
    jp_fetch, jp_serverapp, monkeypatch
):
    response = await jp_fetch(
        "api",
        "terminals",
        method="POST",
        body=json.dumps({"extra_env": {"JUPYTERLAB_BOOKMARK": "b1"}}),
    )
    name = json.loads(response.body)["name"]
    manager = jp_serverapp.web_app.settings["terminal_manager"]
    # A write that leaves no unread input, so the answer below comes from the record of the write.
    monkeypatch.setattr(manager.terminals[name].ptyproc, "write", lambda _line: None)
    try:
        entry = await listed(jp_fetch, name)
        assert entry["bookmark"] == "b1"
        assert entry["pending"] is True

        response = await type_line(jp_fetch, {"name": name, "line": "sleep 30\r"})
        assert response.code == 204
        assert (await listed(jp_fetch, name))["pending"] is False
    finally:
        monkeypatch.undo()
        await manager.terminate(name, force=True)


async def test_a_terminal_without_the_marker_is_not_pending(jp_fetch, jp_serverapp):
    response = await jp_fetch("api", "terminals", method="POST", body="{}")
    name = json.loads(response.body)["name"]
    manager = jp_serverapp.web_app.settings["terminal_manager"]
    try:
        assert (await listed(jp_fetch, name))["pending"] is False
    finally:
        await manager.terminate(name, force=True)


async def test_post_names_no_running_terminal(jp_fetch, jp_serverapp):
    response = await type_line(jp_fetch, {"name": "none", "line": "sleep 30\r"})
    assert response.code == 404
    assert "none" not in jp_serverapp.web_app.settings["terminal_manager"].terminals


@pytest.mark.parametrize(
    "body", [{"line": "x"}, {"name": "1"}, {"name": 1, "line": "x"}, {"name": "1", "line": 1}]
)
async def test_post_refuses_a_malformed_body(jp_fetch, body):
    response = await type_line(jp_fetch, body)
    assert response.code == 400


async def test_post_asks_for_the_permission_the_terminal_socket_asks_for(
    jp_fetch, jp_serverapp, monkeypatch
):
    response = await jp_fetch("api", "terminals", method="POST", body="{}")
    name = json.loads(response.body)["name"]
    manager = jp_serverapp.web_app.settings["terminal_manager"]
    written = []
    asked = []

    def refuse(_handler, _user, action, resource):
        asked.append((action, resource))
        return False

    monkeypatch.setattr(manager.terminals[name].ptyproc, "write", written.append)
    monkeypatch.setattr(jp_serverapp.web_app.settings["authorizer"], "is_authorized", refuse)
    try:
        response = await type_line(jp_fetch, {"name": name, "line": "sleep 30\r"})
        assert response.code == 403
        assert asked == [("execute", "terminals")]
        assert written == []
    finally:
        monkeypatch.undo()
        await manager.terminate(name, force=True)


async def test_post_needs_authentication(jp_base_url, jp_serverapp, http_server_client, monkeypatch):
    monkeypatch.setitem(jp_serverapp.web_app.settings, "allow_unauthenticated_access", True)
    response = await http_server_client.fetch(
        f"{jp_base_url}jupyterlab-bookmarks-manager-extension/terminals",
        method="POST",
        body=json.dumps({"name": "1", "line": "x"}),
        headers={"Cookie": "_xsrf=abcd", "X-XSRFToken": "abcd"},
        raise_error=False,
    )
    assert response.code == 403
