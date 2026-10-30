"""The settings saved under the npm name the extension had before it took its scope."""
import logging
from pathlib import Path

import json5

# The file JupyterLab keeps for `jupyterlab_bookmarks_manager_extension:plugin`. Nothing writes it.
OLD_SETTINGS_PATH = Path("jupyterlab_bookmarks_manager_extension", "plugin.jupyterlab-settings")

_log = logging.getLogger(__name__)


def read_old_settings(settings_dir: Path) -> dict:
    """The keys of the old settings file under `settings_dir`.

    Args:
        settings_dir: JupyterLab's user-settings folder.

    Returns:
        The parsed keys; empty when the file is absent, and with a warning when it cannot be read
        or holds no settings object, because a failed carry must not stop the panel.
    """
    path = settings_dir / OLD_SETTINGS_PATH
    try:
        settings = json5.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        return {}
    except (OSError, ValueError) as error:
        _log.warning("The old settings file %s was not read: %s", path, error)
        return {}
    if not isinstance(settings, dict):
        _log.warning("The old settings file %s does not hold a settings object", path)
        return {}
    return settings
