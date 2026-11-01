"""Tests of the route that saves the settings text only while the file holds the writer's base."""
import json

import pytest

ROUTE = ("jupyterlab-bookmarks-manager-extension", "settings-write")
SCOPED_FOLDER = "@stellarshenson/jupyterlab-bookmarks-manager-extension"
FIRST = '// As JupyterLab writes it, with a comment\n{"markColour": "red"}\n'
SECOND = '{"markColour": "brand"}\n'


@pytest.fixture
def settings_file(tmp_path, lab):
    """The panel's settings file of the lab; not written."""
    return tmp_path / SCOPED_FOLDER / "plugin.jupyterlab-settings"


def write_file(path, text):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")


async def post(jp_fetch, body) -> int:
    response = await jp_fetch(*ROUTE, method="POST", body=json.dumps(body), raise_error=False)
    return response.code


async def test_saves_while_the_base_is_the_file_text(jp_fetch, settings_file):
    write_file(settings_file, FIRST)
    assert await post(jp_fetch, {"base": FIRST, "raw": SECOND}) == 204
    assert settings_file.read_text(encoding="utf-8") == SECOND


async def test_refuses_a_changed_base(jp_fetch, settings_file):
    write_file(settings_file, FIRST)
    assert await post(jp_fetch, {"base": FIRST, "raw": SECOND}) == 204
    # A second writer that read before the first one saved.
    assert await post(jp_fetch, {"base": FIRST, "raw": FIRST}) == 409
    assert settings_file.read_text(encoding="utf-8") == SECOND


async def test_an_absent_file_has_the_base_the_settings_api_answers(jp_fetch, settings_file):
    assert await post(jp_fetch, {"base": "{}", "raw": SECOND}) == 204
    assert settings_file.read_text(encoding="utf-8") == SECOND


async def test_a_file_the_schema_rejects_has_the_base_the_settings_api_answers(
    jp_fetch, settings_file
):
    # The settings API answers "{}" for this file, so a writer can only send that as its base.
    write_file(settings_file, '{"markColour": 5}')
    assert await post(jp_fetch, {"base": "{}", "raw": SECOND}) == 204
    assert settings_file.read_text(encoding="utf-8") == SECOND


@pytest.mark.parametrize(
    "raw",
    [
        '{"markColour": 5}',
        "{ not settings",
        # Passes the schema, and UTF-8 cannot encode it: a CLI argument with a non-UTF-8 byte.
        '{"sessionEnvExclude": ["caf\udce9"]}',
    ],
)
async def test_refuses_a_text_it_cannot_save(jp_fetch, settings_file, raw):
    write_file(settings_file, FIRST)
    assert await post(jp_fetch, {"base": FIRST, "raw": raw}) == 400
    assert settings_file.read_text(encoding="utf-8") == FIRST


@pytest.mark.parametrize(
    "body", [{"raw": SECOND}, {"base": FIRST}, {"base": 1, "raw": SECOND}, {"base": FIRST, "raw": 1}]
)
async def test_refuses_a_malformed_body(jp_fetch, settings_file, body):
    write_file(settings_file, FIRST)
    assert await post(jp_fetch, body) == 400
    assert settings_file.read_text(encoding="utf-8") == FIRST


async def test_unauthenticated_post_is_refused(
    jp_base_url, jp_serverapp, http_server_client, settings_file, monkeypatch
):
    write_file(settings_file, FIRST)
    # With the server's default and a pair that passes the XSRF check, only the decorator refuses.
    monkeypatch.setitem(jp_serverapp.web_app.settings, "allow_unauthenticated_access", True)
    response = await http_server_client.fetch(
        f"{jp_base_url}{'/'.join(ROUTE)}",
        method="POST",
        body=json.dumps({"base": FIRST, "raw": SECOND}),
        headers={"Cookie": "_xsrf=abcd", "X-XSRFToken": "abcd"},
        raise_error=False,
    )
    assert response.code == 403
    assert settings_file.read_text(encoding="utf-8") == FIRST
