"""GET old-settings: the keys saved under the extension's old npm name."""
import json
from pathlib import Path

import tornado
from jupyter_server.base.handlers import APIHandler

from .cli import settings_dir
from .old_settings import read_old_settings


class OldSettingsHandler(APIHandler):
    """Answers the old file's keys; the frontend applies them through the settings registry."""

    @tornado.web.authenticated
    def get(self) -> None:
        # JupyterLab registers itself here under its extension name, and a lab can move the folder.
        lab = self.settings.get("lab")
        root = Path(lab.user_settings_dir) if lab else settings_dir()
        self.finish(json.dumps(read_old_settings(root)))
