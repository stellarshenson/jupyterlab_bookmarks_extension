import json
import shutil
from pathlib import Path
from types import SimpleNamespace

import pytest

pytest_plugins = ("pytest_jupyter.jupyter_server", )


@pytest.fixture
def jp_server_config(jp_server_config):
    return {
        "ServerApp": {
            "jpserver_extensions": {"jupyterlab_bookmarks_manager_extension": True},
            # Test against a server which requires authentication on all endpoints
            "allow_unauthenticated_access": False,
        }
    }


@pytest.fixture
def lab(tmp_path, tmp_path_factory, jp_serverapp, monkeypatch):
    """The lab a route reads through `web_app.settings`, with its settings folder at `tmp_path`."""
    name = json.loads(Path(__file__).with_name("package.json").read_text(encoding="utf-8"))["name"]
    schemas = tmp_path_factory.mktemp("schemas")
    (schemas / name).mkdir(parents=True)
    shutil.copy(Path(__file__).with_name("schema") / "plugin.json", schemas / name / "plugin.json")
    namespace = SimpleNamespace(
        user_settings_dir=str(tmp_path),
        app_settings_dir=str(schemas),
        schemas_dir=str(schemas),
        labextensions_path=[],
        extra_labextensions_path=[],
    )
    monkeypatch.setitem(jp_serverapp.web_app.settings, "lab", namespace)
    return namespace
