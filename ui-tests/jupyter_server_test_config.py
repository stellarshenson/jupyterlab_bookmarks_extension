"""Server configuration for integration tests.

!! Never use this configuration in production because it
opens the server to the world and provide access to JupyterLab
JavaScript objects through the global window variable.
"""
import os
from tempfile import mkdtemp

from jupyterlab.galata import configure_jupyter_server

configure_jupyter_server(c)

# A deleted scratch folder is removed, not sent to the platform trash: the server root is under
# /tmp on this machine's overlay filesystem, where send2trash targets /.Trash-1000, which the lab
# user cannot create, and the DELETE then answers 400. The workstation image sets the trash on
# all three contents managers in /opt/conda/etc/jupyter/jupyter_lab_config.py.
c.FileContentsManager.delete_to_trash = False
c.AsyncFileContentsManager.delete_to_trash = False
c.AsyncLargeFileManager.delete_to_trash = False

# configure_jupyter_server moves the workspaces and the server root, not the user settings;
# without this a settings write to the test server lands in ~/.jupyter/lab/user-settings.
# playwright.config.js names the folder so the `jupyterlab-bookmarks` CLI a test spawns writes
# the same settings file the test server reads.
c.LabApp.user_settings_dir = os.environ.get("JUPYTERLAB_SETTINGS_DIR") or mkdtemp(
    prefix="galata-settings-"
)

# A terminal a session bookmark starts carries JUPYTERLAB_BOOKMARK and waits 3 s before its prompt,
# as a slow login shell does, so 'second click while starting opens no second terminal' can fail;
# every other terminal starts at once. configure_jupyter_server's shell is bash --rcfile <rcfile>
with open(c.ServerApp.terminado_settings["shell_command"][-1], "a") as rcfile:
    rcfile.write('[ -n "$JUPYTERLAB_BOOKMARK" ] && sleep 3\n')

# `or`, not a get() default: JavaScript's `||` reads "" as absent and falls back, so an
# exported-but-empty JUPYTER_TEST_PORT must fall back here too (playwright.config.js)
c.ServerApp.port = int(os.environ.get("JUPYTER_TEST_PORT") or "8888")

# The GalaxaHub message-of-the-day tab keeps the Launcher inactive and hangs every test in
# page.goto(); traitlets ignores the line where that extension is not installed, as on CI
c.GalaxaHubMotd.open_on_start = False

# Uncomment to set server log level to debug level
# c.ServerApp.log_level = "DEBUG"
