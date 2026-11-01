"""POST settings-write: save the panel's settings text only while the file holds the writer's base."""
import json
from typing import Any

import tornado
from jupyter_server.base.handlers import APIHandler

PLUGIN_ID = "@stellarshenson/jupyterlab-bookmarks-manager-extension:plugin"


def saved_raw(lab: Any) -> str:
    """The panel's settings text as the lab's settings API answers it.

    Args:
        lab: The lab application, from `web_app.settings["lab"]`.

    Returns:
        The file's text, or `{}` when the file is absent, empty or rejected by the schema.
    """
    # jupyterlab_server comes with the lab; the package itself imports without it.
    from jupyterlab_server.settings_utils import get_settings

    result, _warnings = get_settings(
        lab.app_settings_dir,
        lab.schemas_dir,
        lab.user_settings_dir,
        schema_name=PLUGIN_ID,
        labextensions_path=lab.extra_labextensions_path + lab.labextensions_path,
    )
    return result["raw"]


class SettingsWriteHandler(APIHandler):
    """Saves `{"base": <text read>, "raw": <new text>}`: 204 saved, 409 the file holds another text.

    The lab's own PUT has no such check, so two writers that read the same text lose one write.
    The method is synchronous: no other request of this server runs between the compare and the
    write.
    """

    @tornado.web.authenticated
    def post(self) -> None:
        from jsonschema import ValidationError
        from jupyterlab_server.settings_utils import save_settings

        try:
            body = json.loads(self.request.body)
            base, raw = body["base"], body["raw"]
        except (ValueError, KeyError, TypeError):
            raise tornado.web.HTTPError(400, "Body must be JSON with base and raw")
        if not isinstance(base, str) or not isinstance(raw, str):
            raise tornado.web.HTTPError(400, "base and raw must be strings")
        lab = self.settings["lab"]
        if saved_raw(lab) != base:
            self.set_status(409)
            self.finish()
            return
        try:
            # save_settings opens the file for writing before it encodes, which would empty the file.
            raw.encode("utf-8")
            save_settings(
                lab.schemas_dir,
                lab.user_settings_dir,
                PLUGIN_ID,
                raw,
                {},
                lab.extra_labextensions_path + lab.labextensions_path,
            )
        except (ValueError, ValidationError) as error:
            raise tornado.web.HTTPError(400, f"The settings text was refused: {error}")
        self.set_status(204)
        self.finish()
