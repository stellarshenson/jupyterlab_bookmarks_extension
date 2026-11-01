# Changelog

<!-- <START NEW CHANGELOG ENTRY> -->

## [0.7.89] - 2026-11-01

### Changed

- Require Python 3.12
- Release notes and journal for 0.7.88

## [0.7.88] - 2026-11-01

### Fixed

- A bookmark saved by a CLI run, a lab page or the Settings Editor form is no longer lost when another writer saves at the same time: a save built on an old read is refused, and the writer reads again and applies its change
- A hand edit of the bookmarks in the JSON view of the settings on an old read is refused with a message instead of deleting a bookmark another writer saved
- A settings text that cannot be encoded is refused before the file is opened, so a non-UTF-8 CLI argument no longer empties the file
- A session bookmark's command line is typed after the terminal tab connects, so a second click after that attaches to the same terminal instead of starting a second one
- A panel update during a press or a drag follows the release instead of a timer
- A Proxy row removed while a read is running stays removed
- The CLI waits up to 60 seconds for the lab's server list; a timeout refuses the add with nothing written

### Changed

- The Galata suite waits on conditions instead of fixed delays, and its test page no longer carries a WebSocket whose failure Chromium leaves unexplained
- Check Release raises the mock PyPI multipart limit, so the release sdist is accepted

## [0.7.87] - 2026-10-31

### Fixed

- Reading the favicon of a link to a page behind the server proxy no longer sends the lab's token and XSRF header to the service on that port; the service still receives the login cookie, as it does when the page opens

## [0.7.86] - 2026-10-31

### Added

- The Proxy section lists any page opened through the lab's server proxy, however it was opened; the lab itself is left out
- The + button of the Proxy section opens a dialog with Port, Path, Name and New browser tab; Name follows the service name unless a name is typed
- Bookmarks saved under the former npm name carry over once, at the first page load, and the old file is left as it is
- A lab page whose server still runs the old code shows a warning to restart the server and reload the page

### Changed

- The npm package is now `@stellarshenson/jupyterlab-bookmarks-manager-extension`; the PyPI name and the Python module stay
- The Recent Proxy section is now named Proxy
- Extension template v4.6.5 and Makefile 1.46

### Fixed

- The panel did not appear on JupyterLab 4.6.5, which refuses the underscore in the old plugin id
- The icon of a Proxy row sat too far to the left

## [0.7.81] - 2026-10-29

### Changed

- No content change from 0.7.80; re-released on request

## [0.7.80] - 2026-10-29

### Changed

- No content change from 0.7.79; re-released on request

## [0.7.79] - 2026-10-29

### Changed

- The wheel no longer ships the test package; the sdist keeps it

### Fixed

- The integration tests install `jupyter-server-proxy`, which the Recent Proxy tests need
- The tab mark test asserts the extension's own mark instead of a third-party extension's colour

## [0.7.78] - 2026-10-29

### Changed

- Extension renamed to `jupyterlab_bookmarks_manager_extension`, published on PyPI as `jupyterlab-bookmarks-manager-extension`; the GitHub repository keeps its previous name
- Bookmarks saved under the previous extension id are not read until the settings file is copied into the new settings folder
- Panel, dialogs and commands take their text from one translation bundle; the displayed text is unchanged

## [0.7.75] - 2026-10-29

### Added

- Side panel with Links, Files and Sessions sections, one level of folders, edit dialogs, Refresh and Filter
- Add a bookmark from a tab's context menu, from a section's + menu, or by dragging a main-area tab onto the panel
- Recent Proxy section listing pages opened through the server proxy, with a `recentProxyTtlDays` setting
- Ribbon on a bookmarked tab and open mark on its row, with a `markColour` setting
- Session bookmarks capturing command, working directory and environment, with a `sessionEnvExclude` setting and a Windows-safe import
- `jupyterlab-bookmarks` CLI adding a link, file or session through the running lab's settings API, with token discovery and an XSRF handshake for tokenless labs, falling back to the local settings file when no lab runs
- Agent skill `jupyterlab-bookmarks-extension`, shipped in the wheel

<!-- <END NEW CHANGELOG ENTRY> -->
