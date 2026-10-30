"""Tests of the route that reads the settings saved under the extension's old npm name."""
import json
import logging
from pathlib import Path
from types import SimpleNamespace

import pytest
from jupyterlab_server.settings_utils import _path

from jupyterlab_bookmarks_manager_extension.cli import settings_file

REPO = Path(__file__).resolve().parents[2]
ROUTE = ("jupyterlab-bookmarks-manager-extension", "old-settings")


def saved_file(settings_dir: Path, name: str) -> Path:
    """The file JupyterLab keeps for the npm name `name`, built by JupyterLab's own path logic."""
    return Path(
        _path(str(settings_dir), f"{name}:plugin", make_dirs=True, extension=".jupyterlab-settings")
    )


@pytest.fixture
def old_file(tmp_path, monkeypatch):
    """The old settings file of a lab whose folder `JUPYTERLAB_SETTINGS_DIR` names; not written."""
    monkeypatch.setenv("JUPYTERLAB_SETTINGS_DIR", str(tmp_path))
    return saved_file(tmp_path, "jupyterlab_bookmarks_manager_extension")


async def answer(jp_fetch) -> dict:
    return json.loads((await jp_fetch(*ROUTE)).body)


def test_cli_settings_file_is_where_jupyterlab_saves_the_package(tmp_path, monkeypatch):
    # A fixture built from the CLI's own constant would pass whatever that constant says.
    name = json.loads((REPO / "package.json").read_text(encoding="utf-8"))["name"]
    monkeypatch.setenv("JUPYTERLAB_SETTINGS_DIR", str(tmp_path))
    assert settings_file() == saved_file(tmp_path, name)


async def test_unauthenticated_request_is_refused(jp_base_url, jp_serverapp, http_server_client):
    response = await http_server_client.fetch(f"{jp_base_url}{'/'.join(ROUTE)}", raise_error=False)
    assert response.code == 403


async def test_answers_the_keys_of_a_file_with_comments(jp_fetch, old_file):
    text = (
        "{\n"
        "    // Bookmarks\n"
        '    "bookmarks": {"version": 1, "links": [], "files": [], "sessions": []},\n'
        "    /* Proxy days */\n"
        '    "recentProxyTtlDays": 9,\n'
        "}\n"
    )
    old_file.write_text(text, encoding="utf-8")
    assert await answer(jp_fetch) == {
        "bookmarks": {"version": 1, "links": [], "files": [], "sessions": []},
        "recentProxyTtlDays": 9,
    }
    assert old_file.read_text(encoding="utf-8") == text


async def test_an_absent_file_answers_nothing_and_stays_silent(jp_fetch, old_file, caplog):
    assert await answer(jp_fetch) == {}
    assert not old_file.exists()
    assert "old settings" not in caplog.text


@pytest.mark.parametrize("text", ["{ not settings", "[1, 2]", ""])
async def test_a_broken_file_answers_nothing_with_a_warning(jp_fetch, old_file, caplog, text):
    old_file.write_text(text, encoding="utf-8")
    with caplog.at_level(logging.WARNING):
        assert await answer(jp_fetch) == {}
    assert str(old_file) in caplog.text
    assert old_file.read_text(encoding="utf-8") == text


async def test_the_folder_of_the_running_lab_comes_first(
    jp_fetch, jp_serverapp, old_file, tmp_path, monkeypatch
):
    old_file.write_text('{"recentProxyTtlDays": 1}', encoding="utf-8")
    moved = tmp_path / "moved"
    saved_file(moved, "jupyterlab_bookmarks_manager_extension").write_text(
        '{"recentProxyTtlDays": 2}', encoding="utf-8"
    )
    lab = SimpleNamespace(user_settings_dir=str(moved))
    monkeypatch.setitem(jp_serverapp.web_app.settings, "lab", lab)
    assert await answer(jp_fetch) == {"recentProxyTtlDays": 2}
