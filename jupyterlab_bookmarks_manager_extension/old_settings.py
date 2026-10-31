"""The settings saved under the npm name the extension had before it took its scope."""
import logging
from pathlib import Path

import json5

# The file JupyterLab keeps for `jupyterlab_bookmarks_manager_extension:plugin`. Nothing writes it.
OLD_SETTINGS_PATH = Path("jupyterlab_bookmarks_manager_extension", "plugin.jupyterlab-settings")
# Inside the settings folder, so a lab or a test server with its own folder has its own marker.
CARRIED_MARKER_PATH = OLD_SETTINGS_PATH.with_name("carried")

_log = logging.getLogger(__name__)


def read_old_settings(settings_dir: Path) -> dict:
    """The keys of the old settings file under `settings_dir`.

    Args:
        settings_dir: JupyterLab's user-settings folder.

    Returns:
        The parsed keys; empty when the carried marker exists or the file is absent, and with a
        warning when it cannot be read or holds no settings object, because a failed carry must
        not stop the panel.
    """
    if (settings_dir / CARRIED_MARKER_PATH).exists():
        return {}
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


def mark_carried(settings_dir: Path) -> None:
    """Write the marker that stops later reads of the old file, which stays as it is.

    Args:
        settings_dir: JupyterLab's user-settings folder. With no old file it stays untouched, so a
            fresh install has no marker folder.
    """
    if (settings_dir / OLD_SETTINGS_PATH).exists():
        (settings_dir / CARRIED_MARKER_PATH).touch()
