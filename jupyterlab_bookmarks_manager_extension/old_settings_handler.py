"""GET and POST old-settings: the keys saved under the old npm name, and their marker."""
import json
from pathlib import Path

import tornado
from jupyter_server.base.handlers import APIHandler

from .old_settings import mark_carried, read_old_settings
from .settings_write_handler import saved_raw


class OldSettingsHandler(APIHandler):
    """Answers the old file's keys, which the frontend applies, and marks them carried.

    The answer also holds the settings text, read in the same turn as the marker: a page compares
    it with its own earlier read, so a page that read before another page saved and posted sees
    that in this one answer, and a page with nothing to carry sends no further request.
    """

    def _settings_dir(self) -> Path:
        # JupyterLab registers itself here under its extension name, and a lab can move the folder.
        return Path(self.settings["lab"].user_settings_dir)

    @tornado.web.authenticated
    def get(self) -> None:
        keys = read_old_settings(self._settings_dir())
        self.finish(json.dumps({"keys": keys, "raw": saved_raw(self.settings["lab"])}))

    @tornado.web.authenticated
    def post(self) -> None:
        mark_carried(self._settings_dir())
        self.set_status(204)
        self.finish()
