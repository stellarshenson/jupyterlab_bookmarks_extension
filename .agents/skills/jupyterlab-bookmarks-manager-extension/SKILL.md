---
name: jupyterlab-bookmarks-extension
description: Adds a bookmark to the Bookmarks panel of a JupyterLab from the terminal, through the `jupyterlab-bookmarks` CLI of jupyterlab_bookmarks_extension. Use when asked to "add a bookmark to jupyterlab", or to save a web page, a file or a terminal session into the panel's Links, Files or Sessions section.
---

# jupyterlab-bookmarks

Adds through a running lab's settings API when one is found, and writes the panel's settings file otherwise. Read `jupyterlab-bookmarks --help` and `jupyterlab-bookmarks add <kind> --help` first; the flags, environment and exit codes are there.

## Rules

- The lab is named by `JUPYTER_SERVER_URL`, `JUPYTERHUB_SERVICE_PREFIX` or `JUPYTER_PORT`, as a JupyterLab terminal sets them; outside a terminal set `JUPYTER_PORT`. A name matching no running lab is refused, never guessed
- The token comes from `JUPYTERHUB_API_TOKEN` or `JPY_API_TOKEN` first, else the matched lab's own record, else `JUPYTER_TOKEN`. Never put it on the command line or print it; shell history and logs keep a copy
- `--folder` names an existing folder of the panel: an unknown name, or two folders of one name, is refused
- Never edit the settings file by hand; the command merges into it and keeps every other key

<!-- improved 2026-10-28 | body 232→195w / 17→16L | benchmark n/a (not-requested) | via improve-skill -->
