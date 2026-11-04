# Changelog

<!-- <START NEW CHANGELOG ENTRY> -->

## [0.7.106] - 2026-11-04

### Fixed

- A soft reload of the server extension no longer stops the Proxy section: the tap reuses its held list, registers the proxy-open event schema only once, and replaces its own previous wrapper, so proxy opens keep reaching the panel without a server restart and a later release's tap code runs after a reload

## [0.7.103] - 2026-11-04

### Added

- A bookmark whose tab is not open shows the time since it was last present, updated in place every 30 seconds
- A link added from a tab whose page serves no favicon takes the tab's widget icon; a favicon the page serves wins when it exists

### Changed

- The Proxy section keeps a page that a Links bookmark holds
- The section bands follow the design system: a 1px `--jp-layout-color3` divider between adjacent bands, a count as its own span 6 px after the label, a 21 px band with the + button inside it, and no reserved scrollbar strip beside a row

### Fixed

- The section count sat at the panel's right edge instead of after its label
- A hovered row took the section band's fill, and the current tab's row lost its tint; the hover now takes one fill above the band and the tint stays

## [0.7.100] - 2026-11-04

### Added

- A terminal whose own process is a program, such as Claude Code started with no shell above it, is saved with its command line, its working directory and the variables that a new terminal of the lab does not start with
- The section label, the empty-state text, a depth-0 row's first icon and the panel title share one 12 px left inset

### Changed

- A session bookmark is named with the tab title after a leading run of characters that are neither letters nor digits is removed
- A bookmark with no command matches only a terminal whose own process is a shell that /etc/shells lists

### Fixed

- A terminal whose process cannot be read is not saved, and the panel says so instead of recording an empty recipe
- The session caret is 8 px wide, so the section label and the row icon no longer start 6 px right of the empty-state text

## [0.7.93] - 2026-11-03

### Changed

- The CI link check ignores YouTube links, which answered 429 Too Many Requests to the GitHub runner

## [0.7.92] - 2026-11-03

### Added

- A 1 px line stands above the first section band, so the panel's title band and the first section read as two bands in the dark themes too, with the filter open or closed and while the list scrolls

### Changed

- Build lifecycle on Makefile 1.48
- The test of the shipped agent skill reads the package instead of an installed copy
- The Galata test server serves `/files/` from its own root where the lab's configuration moves that route, and the favicon test clears the browser's resource timing buffer before it looks for the page's own icon read

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
