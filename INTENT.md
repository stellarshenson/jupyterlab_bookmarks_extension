# Intent - jupyterlab_bookmarks_extension

Stated by the Star Colonel on 2026-10-27. This file stays in the repository as the source of the requirements; the acceptance criteria are written from it.

## Purpose

A bookmarks panel in the JupyterLab side bar. It is one more side panel item, on the left by default, and it can be moved to the right. The panel has three sections: Webpages, Files and Sessions.

## Required behaviour

The requirements in the order the Star Colonel gave them.

### All sections

- Each section holds a tree of folders and bookmarks
- The tree is shown expanded, and each folder can be folded and unfolded
- One level of folders for now. The stored format and the tree allow more levels later. The Star Colonel's words: "one level for now, but make provision to have more"

### Webpages

- "Webpages" is a working name; the Star Colonel asked for a better name if there is one
- Any web tab can be added to the list. The Star Colonel's examples: "btop-web local or remote i.e. /tmp/paste-files/paste-20261027-140500.png"
- Each bookmark shows the page's favicon, and favicons are cached
- The tab menu (the context menu of a tab) has an item that adds the tab to the bookmarks, or removes it when it is bookmarked
- In the panel, the visible name and the URL of a bookmark can be edited

### Files

- Any file can be added from its tab menu, and removed the same way, as for webpages
- The bookmark shows the icon of the file type next to the name
- A bookmark has two fields: the name, taken from the file name, and the file location, relative to the workspace
- When a bookmark is added or its location is changed, the panel shows whether the file exists
- The name can be edited, and reset back to the file name

### Sessions

- A session bookmark records a terminal that runs a process: the environment variables and the process running in the terminal, with its command and parameters
- A session can be removed from the bookmarks. The Star Colonel's words: "can be unbookmarked (if sufficiently recognised)"
- A click on the bookmark opens the session. If its tab exists - the process runs with the same setup - the click switches to the running tab
- Edit changes the bookmark name, and also the environment variables and the command with its parameters. The Star Colonel added "if that makes sense": judge it and report the answer

## Open questions

For the project session to investigate and answer; not decided here.

- A better name than "Webpages"
- What counts as a web tab, and how the URL of each kind of tab is read; the examples include a page served in the lab and a local file path
- Where favicons are cached
- Where bookmarks are stored
- What "relative to the workspace" is relative to
- How the environment, the command and the parameters of the process in a terminal are read, and which environment variables a session stores
- What "the same setup" means when the panel looks for a running tab, and how an opened session starts the same process again
- Whether editing the environment variables and the command of a session makes sense

## Session setup

- Write `.claude/settings.json` with `{"worktree": {"bgIsolation": "none"}}` as the first file, then work in place on `main`
- `/home/lab/workspace/.claude/CLAUDE.md` is absent on disk on 2026-10-27 (an unstaged deletion in the workspace repository). Reference it as the init prompt says; do not create or restore it
- Init ends with `make build` and `make test` green; then stop and report. Acceptance criteria, design and implementation wait for the Star Colonel's word
