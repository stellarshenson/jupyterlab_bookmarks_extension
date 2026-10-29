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
