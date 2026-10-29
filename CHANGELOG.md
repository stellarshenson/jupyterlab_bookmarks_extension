# Changelog

<!-- <START NEW CHANGELOG ENTRY> -->

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
