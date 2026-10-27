# jupyterlab_bookmarks_extension

[![GitHub Actions](https://github.com/stellarshenson/jupyterlab_bookmarks_extension/actions/workflows/build.yml/badge.svg)](https://github.com/stellarshenson/jupyterlab_bookmarks_extension/actions/workflows/build.yml)
[![npm version](https://img.shields.io/npm/v/jupyterlab_bookmarks_extension.svg)](https://www.npmjs.com/package/jupyterlab_bookmarks_extension)
[![PyPI version](https://img.shields.io/pypi/v/jupyterlab-bookmarks-extension.svg)](https://pypi.org/project/jupyterlab-bookmarks-extension/)
[![Total PyPI downloads](https://static.pepy.tech/badge/jupyterlab-bookmarks-extension)](https://pepy.tech/project/jupyterlab-bookmarks-extension)
[![JupyterLab 4](https://img.shields.io/badge/JupyterLab-4-orange.svg)](https://jupyterlab.readthedocs.io/en/stable/)
[![Brought To You By KOLOMOLO](https://img.shields.io/badge/Brought%20To%20You%20By-KOLOMOLO-00ffff?style=flat)](https://kolomolo.com)
[![Donate PayPal](https://img.shields.io/badge/Donate-PayPal-blue?style=flat)](https://www.paypal.com/donate/?hosted_button_id=B4KPBJDLLXTSA)

Bookmarks for JupyterLab in one side panel. Web pages, files and terminal sessions each get their own section, and a right-click on a tab adds it to the bookmarks or removes it.

> [!NOTE]
> The features below are the planned scope, stated in `INTENT.md`. The code is still the template placeholder.

## Features

- **Side panel** - one bookmarks panel in the side bar, on the left by default and movable to the right
- **Three sections** - Webpages, Files and Sessions, each a tree of folders and bookmarks, shown expanded, with folders that fold and unfold
- **Tab menu action** - one item in the context menu of a tab adds the tab to the bookmarks, or removes it when it is bookmarked
- **Webpages** - any web tab, with the page's favicon (cached); the name and the URL can be edited
- **Files** - any file, with the icon of its file type and its location relative to the workspace; the panel shows whether the file exists, and the name can be edited and reset to the file name
- **Sessions** - a terminal that runs a process, with its environment variables, command and parameters; a click switches to the running tab, or opens the session again when no tab runs it

## Requirements

- JupyterLab >= 4.6

## Install

To install the extension, execute:

```bash
pip install jupyterlab_bookmarks_extension
```

## Uninstall

To remove the extension, execute:

```bash
pip uninstall jupyterlab_bookmarks_extension
```
