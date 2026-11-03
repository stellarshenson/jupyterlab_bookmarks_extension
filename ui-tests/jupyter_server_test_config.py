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

# jupyter_lab_config.py points c.ContentsManager.files_handler_params at ~/workspace, so every
# GET /files/ of a test answers 404 against the temporary root; without that file this is the
# default. A setting on the subclass wins over the one on its parent.
c.AsyncLargeFileManager.files_handler_params = {"path": c.ServerApp.root_dir}

# configure_jupyter_server moves the workspaces and the server root, not the user settings;
# without this a settings write to the test server lands in ~/.jupyter/lab/user-settings.
# playwright.config.js names the folder so the `jupyterlab-bookmarks` CLI a test spawns writes
# the same settings file the test server reads.
c.LabApp.user_settings_dir = os.environ.get("JUPYTERLAB_SETTINGS_DIR") or mkdtemp(
    prefix="galata-settings-"
)

# While sessions.spec.ts keeps the file shell-hold in the settings folder, a new terminal's shell stays
# in its rc file, as a slow login shell does, so 'second click while starting opens no second terminal'
# clicks while the recipe is unread, on any machine. configure_jupyter_server's shell is bash --rcfile <rcfile>
hold = os.path.join(c.LabApp.user_settings_dir, "shell-hold")
with open(c.ServerApp.terminado_settings["shell_command"][-1], "a") as rcfile:
    rcfile.write(f'while [ -e "{hold}" ]; do sleep 0.05; done\n')

# `or`, not a get() default: JavaScript's `||` reads "" as absent and falls back, so an
# exported-but-empty JUPYTER_TEST_PORT must fall back here too (playwright.config.js)
c.ServerApp.port = int(os.environ.get("JUPYTER_TEST_PORT") or "8888")

# The GalaxaHub message-of-the-day tab keeps the Launcher inactive and hangs every test in
# page.goto(); traitlets ignores the line where that extension is not installed, as on CI
c.GalaxaHubMotd.open_on_start = False

# Uncomment to set server log level to debug level
# c.ServerApp.log_level = "DEBUG"
