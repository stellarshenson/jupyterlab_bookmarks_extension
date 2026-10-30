# Defects - jupyterlab_bookmarks_extension

Failures found by the verifier or the final gate of a build run, against the criteria in `docs/acc-crit.md`.

## Authors

- `@kj` Konrad Jelen

## Storage `STORE`

The bookmarks setting: saving, reloading and the stored shape

- log: 2026-10-27T20:36:08Z @kj category created

- [x] `DEF-STORE-1-RELOAD` **folder created in Files missing in the full Galata suite** - MEDIUM; after Accept in New Folder in Files the row 'Files folder' did not appear within 5 s; 'Links folder', created just before, did; fails the test of ACC-STORE-76-RELOAD; cause under investigation - a write lost by the reload-modify-write queue or a save slower than 5 s under 5 workers; `src/model/store.ts`
  - evidence: gate run 2026-10-27T21:21Z, full Galata suite, 5 workers: 50 passed, 0 failed (logs/ui-tests-gate-DEF-STORE-1-RELOAD.log); storage.spec.ts:42 'bookmarks survive a reload' and :96 passed; make test, lint check, make install exit 0; verify-1: 4 full runs 50/50, 0 leaked settings requests
  - root-cause: 2026-10-27T20:48:41Z @kj Test harness, not the product: a mocked-settings links.spec test ends while its favicon write (storeFavicon after Add) is in flight; galata's page teardown unrouteAll (fixtures.ts:431) lets that PUT reach the shared server and replace storage.spec's bookmarks. Evidence: logs/ui-tests-def-store-1-repro-1.log trace - links PUT 33.112 reached [::1] 0.3 ms after Unroute, storage GET 33.122 returned its value, storage PUT/GET 10-40 ms
  - related: ACC-STORE-76-RELOAD
  - repro: in ui-tests/: JUPYTER_TEST_PORT=<free port> jlpm playwright test (all specs, 5 workers) - storage.spec.ts:42 'bookmarks survive a reload' failed 1 of 1 (logs/ui-tests-gate-core.log); alone with --repeat-each=8 --workers=1 it passed 8 of 8 (logs/ui-tests-gate-core-repeat-storage.log)
  - test-tags: FUNCTIONAL
  - log: 2026-10-27T20:36:08Z @kj added
  - log: 2026-10-27T20:48:41Z @kj root-cause recorded; reason: the one line carries the request-trace evidence that separates this cause from the two candidates
  - log: 2026-10-27T21:08:33Z @kj fix attempt 1: mocked specs' page fixture (ui-tests/tests/helpers.ts) sets the context offline before galata's unrouteAll. 5 full runs, 5 workers: 0 settings requests reached the server (pre-fix 8 per run); storage.spec.ts:42 and :96 passed 5/5; runs 3-5 50/50; runs 1-2 failed elsewhere (root-listing 404, restored closed tab)
  - log: 2026-10-27T21:23:55Z @kj closed

## Galata Suite `SUITE`

The shared Galata test server, its fixtures and the parallel workers

- log: 2026-10-27T22:09:23Z @kj category created

- [x] `DEF-SUITE-2-ROOT-LISTING` **root folder listing 404 fails a test in the full Galata suite** - MEDIUM; links.spec.ts:137 'added link records the page URL' timed out in Galata waitForCondition behind the dialog 'Directory not found: ""'; third run with this failure, after DEF-STORE-1-RELOAD fix runs 1 and 2 (storage.spec.ts:164, panel.spec.ts:41); fix site not determined
  - evidence: gate run after fix 1: full Galata suite, 6 spec files, 6 workers, 65 passed, 0 failed, 0 root listing 404s, 0 root folder deletes (logs/ui-tests-gate-DEF-SUITE-2-ROOT-LISTING.log); make install 0.1.30, make test and lint check exit 0
  - related: ACC-LINK-21-URL - its test failed
  - repro: in ui-tests/: JUPYTER_TEST_PORT=<free port> jlpm playwright test (all 6 spec files, 6 workers) - links.spec.ts:137 failed, 64 of 65 passed (logs/ui-tests-gate-sessions.log); intermittent
  - test-tags: FUNCTIONAL
  - root-cause: 2026-10-27T22:23:31Z @kj upstream race, not this extension: jupyter_server 2.21.1 AsyncFileContentsManager._dir_model stats each entry, then calls get() on it and catches only OSError, so a sibling folder that Galata's tmpPath fixture deletes in between makes the file browser's root listing (content=1) answer 404, shown as the modal 'Directory not found: ""' that blocks Galata's waitForApplication; the suite reaches it because 6 workers create and delete test folders in the one shared server root; evidence: repro run 3 (logs/ui-tests-def-suite-2-repro-3.log:555-556) root listing 1213 ms, 404 naming tests-storage-setting-accepts-a-folder-inside-a-folder deleted 19 ms before, the same signature in all 4 failing runs (4 different tests) and in no passing run; tmp/workflows/bookmarks-fix/DEF-SUITE-2-ROOT-LISTING/probe.py with no browser and the bookmarks server extension disabled: 61 of 254 root listings 404 (logs/def-suite-2-probe-1.log)
  - root-cause: 2026-10-27T22:09:23Z @kj likely: the page's root listing GET /api/contents took 1281 ms and answered 404 'No such file or directory: tests-files-tab-menu-adds-a-file' - files.spec.ts deleted that test folder at 23:06:10.146, during the listing (logs/ui-tests-gate-sessions.log lines 255-258)
  - log: 2026-10-27T22:09:23Z @kj added
  - log: 2026-10-27T22:09:35Z @kj edited repro "in ui-tests/: JUPYTER_TEST_PORT=<free port> jlpm playwright test (all 7 spec files, 6 workers) - links.spec.ts:137 failed, 64 of 65 passed (logs/ui-tests-gate-sessions.log); intermittent" -> "in ui-tests/: JUPYTER_TEST_PORT=<free port> jlpm playwright test (all 6 spec files, 6 workers) - links.spec.ts:137 failed, 64 of 65 passed (logs/ui-tests-gate-sessions.log); intermittent"
  - log: 2026-10-27T22:23:31Z @kj root-cause overridden; reason: the cause and its evidence in one record, as the root-cause step requires
  - log: 2026-10-27T22:42:33Z @kj fix 1: ui-tests/playwright.config.js use serverFiles 'on', so Galata's tmpPath teardown deletes no test folder in the shared server root during a run; make test, lint check, make install (0.1.28) exit 0; 6 full-suite runs, 6 workers: 0 root listing 404s and 0 root folder deletes in each (65 per run before), 4 runs 65/65, runs 2 and 4 failed only links.spec.ts:182, the separate reload issue (tmp/workflows/bookmarks-fix/DEF-SUITE-2-ROOT-LISTING/fix-runs.txt); reason: the attempt needs its change, gates and per-run evidence on one line
  - log: 2026-10-27T22:58:31Z @kj closed
- [x] `DEF-SUITE-3-RELOAD-TAB` **closed tab restored after a quick reload in links.spec.ts:182** - MEDIUM; links.spec.ts:182 'favicon shows after reload without a fetch' reloads about 70 ms after closing the 'Page' tab; the layout restores the tab, the Launcher is not active and Galata's start-up wait times out; cause under investigation; `ui-tests/tests/links.spec.ts`
  - evidence: gate 2026-10-28: full Galata suite (6 workers, every spec file) 65 of 65 passed, exit 0, including links.spec.ts:183 'favicon shows after reload without a fetch' and the close-then-reload tests files.spec.ts:195 and :296 (logs/ui-tests-gate-DEF-SUITE-3-RELOAD-TAB.log); make install rc 0 (v0.1.35); make test rc 0, Jest 31 of 31, pytest 15 of 15, auth gate passed (logs/make-test-gate-DEF-SUITE-3-RELOAD-TAB.log); lint rc 0, 0 errors, 29 warnings, with the gitignored root-cause probe folder moved out (logs/lint-gate-DEF-SUITE-3-RELOAD-TAB-noprobe.log)
  - root-cause: 2026-10-27T23:24:58Z @kj test harness, not the product: the test reloads 22-27 ms after closing the 'Page' tab, inside JupyterLab 4.6.4's 500 ms workspace-save Debouncer, so the close is never saved; it fails when the save after opening the Bookmarks panel lands before the close (favicon wait 818-825 ms) and passes when open to close takes 278-368 ms; evidence: 13 traces, 2 failed (workspace PUT holding the tab 363 and 367 ms before the close, none after it, reload GET holds the tab; logs/ui-tests-def-suite-3-repro-7.log), 11 passed with no such PUT; tmp/workflows/bookmarks-fix/DEF-SUITE-3-RELOAD-TAB/probe, panel unused: tab restored 3 of 3 when a save lands before the close, 0 of 3 when the close falls inside the save delay or the reload waits 1500 ms (logs/ui-tests-def-suite-3-probe-1.log)
  - related: ACC-LINK-26-FAVICON-CACHE
  - repro: in ui-tests/, JUPYTER_TEST_PORT=<free port> jlpm playwright test (all specs, 6 workers) - links.spec.ts:182 failed 2 of 6 runs (logs/ui-tests-def-suite-2-fix-1-run-2.log and run-4.log)
  - test-tags: FUNCTIONAL
  - log: 2026-10-27T23:00:10Z @kj added
  - log: 2026-10-27T23:24:58Z @kj root-cause recorded; reason: the cause and the trace and probe evidence that separate it from the other candidates in one record
  - log: 2026-10-28T00:00:53Z @kj fix-1: layoutSaved(page) in ui-tests/tests/helpers.ts awaits the workspace PUT after closeTab and before page.reload in links.spec.ts:183 and files.spec.ts:196,296; full suite 6 workers 8 of 8 runs 65 passed, run 3 hit the failing timing and passed; forced timing: old 3 of 3 failed, fixed 3 of 3 passed; reason: the change, the repro-condition result and the forced-timing proof in one record (logs/ui-tests-def-suite-3-fix-1-run-1..8.log, logs/ui-tests-def-suite-3-fix-1-forced.log)
  - log: 2026-10-28T00:20:11Z @kj closed; reason: the fix held in one full-suite gate run and the unit, auth and lint checks are green
- [x] `DEF-SUITE-18-RELOAD-ACTIVATE` **Bookmarks panel does not activate after a reload** - MEDIUM; After the reload step the Bookmarks tab is present but not current and openPanel times out at 20.9 s; seen in the 23:35 final gate and two targeted runs, while an earlier full run passed. Suspect the layout restore still running when the tab is clicked.
  - evidence: fix: openPanel awaits jupyterapp.restored before the tab click; the same failing test passed 20/20 at --repeat-each=20 (logs/flake-proof-20.log; 19/20 with the same command before the fix); full Galata suite 87/87 passed (logs/flake-full-galata.log); stylelint, eslint and prettier exit 0
  - root-cause: 2026-10-28T23:03:51Z @kj Test harness, not the product: reloadLab returned before LabShell.restoreLayout rehydrated the left area; galata openTab then clicked the tab after the restore made it current, and Lumino treats a click on the current tab as a deselect (allowDeselect), collapsing the side bar. Evidence: failure video shows it collapsed to timeout.
  - repro: from ui-tests: JUPYTER_TEST_PORT=<free> jlpm playwright test tests/recent.spec.ts -g 'survives a reload'
  - test-tags: FUNCTIONAL
  - log: 2026-10-28T22:42:38Z @kj added
  - log: 2026-10-28T23:03:55Z @kj closed

## Files `FILE`

The Files section: bookmarks of files by their path relative to the Jupyter server root

- log: 2026-10-28T00:23:20Z @kj category created

- [x] `DEF-FILE-4-CLICK-STALE` **file deleted after panel load not shown missing on click** - MAJOR; a file deleted while the lab runs keeps its row unmarked, and a click on the row shows no 'File not found' message; cause: _openFile checks the file only when the row is already marked missing; fix: check on every click; `src/panel/bookmarks_panel.ts`
  - evidence: gate-review run 2026-10-28 on 0.1.39: Galata files.spec.ts:296 'click on a missing file opens no tab' (delete, click without reload, File not found dialog, jp-mod-missing) passed (logs/ui-tests-gate-review.log, suite 67 of 67)
  - related: ACC-FILE-81-OPEN-MISSING - its test reloaded before the click
  - repro: bookmark a file, close its tab, delete the file, click the row without a reload: no File not found dialog, row not marked jp-mod-missing
  - test-tags: FUNCTIONAL
  - root-cause: 2026-10-28T00:23:20Z @kj _openFile (bookmarks_panel.ts:129) runs isFileMissing only when this._missing holds true for the path; _trackFiles fills the map once per path, on load or add, so a deletion after that is never seen
  - log: 2026-10-28T00:23:20Z @kj added
  - log: 2026-10-28T00:29:35Z @kj fix attempt 1: _openFile runs isFileMissing on every click, renders only on a state change; files.spec.ts:296 without reload failed on 0.1.35 (no dialog, logs/ui-tests-review-r1-before.log), passed on 0.1.36 in full suite 66 of 66 (logs/ui-tests-review-r1.log); make test, lint rc 0
  - log: 2026-10-28T12:23:31Z @kj closed

## Sessions `SESS`

The Sessions section: bookmarks of terminals, each a launch recipe of working directory, command line and environment

- log: 2026-10-28T00:23:20Z @kj category created

- [x] `DEF-SESS-5-DOUBLE-CLICK` **double-click on a session row starts two terminals** - MAJOR; with no matching terminal running, a double-click on a session row starts two terminals that both run the recipe; breaks the guarantee that a click never starts a second copy of a running session; `src/panel/bookmarks_panel.ts`
  - evidence: gate-review run 2026-10-28 on 0.1.39: Galata sessions.spec.ts:262 'double-click starts the session once' passed (logs/ui-tests-gate-review.log, suite 67 of 67)
  - related: ACC-SESS-66-OPEN-START
  - repro: shut the bookmark's terminal down with DELETE api/terminals/<name>, double-click the row: GET api/terminals lists two new terminals
  - test-tags: FUNCTIONAL
  - root-cause: 2026-10-28T00:23:20Z @kj each click of a double-click calls openSession (open_session.ts:13); both calls await fetchTerminals before either calls TerminalAPI.startNew, so neither sees the other's terminal
  - log: 2026-10-28T00:23:20Z @kj added
  - log: 2026-10-28T00:29:35Z @kj fix attempt 1: panel click handler ignores clicks with event.detail > 1; sessions.spec.ts:262 'double-click starts the session once' failed on 0.1.35 (terminals [1, 2]), passed on 0.1.36 in full suite 66 of 66 (logs/ui-tests-review-r1.log); make test, lint rc 0
  - log: 2026-10-28T12:23:31Z @kj closed
- [-] `DEF-SESS-6-ARGV-TITLE` **command of a process that rewrites its argv recorded as one quoted word** - MAJOR; a terminal running `npm run dev` is recorded with command `'npm run dev'`, so a click that starts the session types one quoted word and bash finds no such command; `jupyterlab_bookmarks_extension/process_reader.py`
  - related: ACC-SESS-54-COMMAND
  - repro: sleep 3 | bash -c "exec -a 'npm run dev' cat", then read_argv(<pid of cat>) gives ['npm run dev'] and read_terminal command "'npm run dev'"
  - test-tags: UNIT
  - root-cause: 2026-10-28T00:23:20Z @kj npm rewrites its process title, so /proc/<pid>/cmdline holds the whole command line as one element; read_terminal (process_reader.py:71) returns shlex.join(argv), which quotes that element
  - log: 2026-10-28T00:23:20Z @kj added
  - log: 2026-10-28T00:29:36Z @kj fix attempt 1: read_terminal records a one-element argv as is, shlex.join otherwise; test_rewritten_title_is_recorded_unquoted failed before (logs/pytest-review-r1-before.log), passed in make test, pytest 21 of 21 (logs/make-test-review-r1.log); design.md lines 26, 155, 321 amended
  - log: 2026-10-28T00:48:09Z @kj fix attempt 1 reverted in review round 2: with npm 11.19.1, `npm run a -- --port 3000` has the title `npm run a --port 3000`; replaying that title gives the script `3000` and the title `npm run a 3000`, which is never recognised, so every later click starts another running copy; left open, deferred to the Star Colonel; reason: the review plan of round 2 prescribes this wording verbatim; it carries the measured npm titles that justify the revert
  - log: 2026-10-28T09:48:42Z @kj rejected: rejected by the Star Colonel 2026-10-28: processes that rewrite their argv (npm, npx) stay out of scope as docs/design.md states; reason: the process title cannot give back the true command line; quoted recording makes such a recipe fail visibly with 'command not found' instead of running a different command
- [x] `DEF-SESS-7-START-TWICE` **Second click within about 3 s of a session start opens a second terminal** - MAJOR; bash needs about 3 s before a typed recipe is the foreground process; meanwhile the server reports a plain shell, so a second single click starts another terminal with the same recipe. The Star Colonel asked on 2026-10-28 for a research session: a click must match the session it requested
  - evidence: gate-review run 2026-10-28 on 0.1.39: Galata sessions.spec.ts:273 'second click while starting opens no second terminal' passed (logs/ui-tests-gate-review.log, suite 67 of 67); pytest test_marker_and_unread_input_of_a_real_pty passed (logs/make-test-gate-review.log, 16 of 16)
  - test-tags: UNIT, FUNCTIONAL
  - root-cause: 2026-10-28T11:27:41Z @kj A plain shell is reported for about 3 s after a start, so a second click matches nothing; remedy: start via POST api/terminals with extra_env JUPYTERLAB_BOOKMARK=<id>, report that marker plus unread pty input as pending, match marker and (pending or same setup)
  - repro: Bookmark a session whose process is stopped; click its row twice with single clicks more than the double-click interval apart within 3 s; GET api/terminals lists two new terminals running the recipe
  - log: 2026-10-28T11:13:43Z @kj added
  - log: 2026-10-28T11:59:43Z @kj fix attempt 1 (review round 3 fix-1.patch): GET terminals reports the JUPYTERLAB_BOOKMARK marker and unread pty input; openSession starts via POST api/terminals with that marker and matches marker plus pending first; Galata 'second click while starting opens no second terminal' failed before (logs/ui-tests-review-r3-before.log), passed after (logs/ui-tests-review-r3.log); left open
  - log: 2026-10-28T11:59:52Z @kj edited test-tags added "UNIT, FUNCTIONAL"
  - log: 2026-10-28T12:23:31Z @kj closed
- [x] `DEF-SESS-8-ROUTE-MISSING` **Panel logs an uncaught 404 rejection every 10 s when the server part is not loaded** - MEDIUM; With the lab server running without this extension's server part, the terminal snapshot refresh gets 404 on every terminal poll and rejects with no catch; the console shows Uncaught (in promise) with the 404 page about every 10 s. Seen in the Star Colonel's live lab console, 2026-10-28
  - evidence: gate-review run 2026-10-28 on 0.1.39: Jest terminal_snapshot.spec.ts 'a poll answered 404 leaves no unhandled rejection' passed (logs/make-test-gate-review.log, Jest 32 of 32)
  - test-tags: UNIT
  - root-cause: 2026-10-28T11:51:06Z @kj TerminalSnapshot connects runningChanged to 'void this.refresh()' (terminal_snapshot.ts:49); refresh awaits requestAPI, which throws ResponseError on the 404 of a missing server route, and nothing catches the promise, so each poll of the terminal manager (about 10 s) logs Uncaught (in promise)
  - repro: Start the Jupyter server, then make install and reload the page with a terminal open; the console shows GET .../jupyterlab-bookmarks-extension/terminals 404 and Uncaught (in promise) about every 10 s
  - log: 2026-10-28T11:13:47Z @kj added
  - log: 2026-10-28T11:59:43Z @kj fix attempt 1 (review round 3 fix-2.patch): the runningChanged handler of TerminalSnapshot catches the refresh rejection; Jest 'a poll answered 404 leaves no unhandled rejection' failed before (logs/jest-review-r3-fix2-before.log), passed after (logs/make-test-review-r3.log, Jest 32 of 32); left open
  - log: 2026-10-28T11:59:52Z @kj edited test-tags added "UNIT"
  - log: 2026-10-28T12:23:32Z @kj closed
- [x] `DEF-SESS-10-WINDOWS-IMPORT` **server extension fails to load on Windows** - MEDIUM; process_reader.py imports fcntl and termios at module level; both are Unix-only, and routes.py imports it through terminals_handler.py, so on a Windows server the whole server extension fails to import and the favicon and terminals routes are missing; found by the README verifier
  - evidence: gate run 2026-10-28T15:27Z: regression test pytest test_process_reader.py::test_package_imports_without_the_unix_only_modules passed, fcntl and termios blocked (logs/make-test-build2-a.log: pytest 19 passed; auth gate green)
  - repro: on a Windows Python, run python -c "import jupyterlab_bookmarks_extension"
  - test-tags: UNIT
  - log: 2026-10-28T12:45:06Z @kj added
  - log: 2026-10-28T15:27:19Z @kj closed
- [x] `DEF-SESS-12-ENV-HINT` **invalid Environment line disables Save with no explanation** - MAJOR; a line that is not NAME=value, such as `1K=x` or `GITHUB_TOKEN=x`, disables Save while the field shows only a red border, so the user cannot tell why; cause the dialog marks `jp-mod-error` and shows no text; `src/dialogs/edit_session.ts`
  - evidence: gate-review run 2026-10-28 on 0.7.62: ui-tests/tests/sessions.spec.ts:428:7 invalid env line disables Save asserts the banner sentence and passed (logs/ui-tests-gate-review.log, 86 passed, 0 failed)
  - repro: Edit a stored session, type `1K=x` into Environment: Save disables and no sentence says what is wrong
  - test-tags: FUNCTIONAL
  - root-cause: 2026-10-28T19:21:49Z @kj `onEnv` only toggles `jp-mod-error`; the dialog has no status text, and the later `:focus` rule overrides the red border while the field has focus
  - log: 2026-10-28T19:21:49Z @kj added
  - log: 2026-10-28T19:31:21Z @kj fix attempt 1: Galata sessions.spec.ts 'invalid env line disables Save' failed on 0.7.58 with no banner element (logs/ui-tests-review-b2-r1-before-sessions.log); passed on 0.7.59 (logs/ui-tests-review-b2-r1.log: 36 passed)
  - log: 2026-10-28T21:01:45Z @kj closed

## Side Panel `PANEL`

The panel top bar, its title and the section bands

- log: 2026-10-28T12:41:05Z @kj category created

- [x] `DEF-PANEL-9-TITLE-SIZE` **BOOKMARKS title smaller than other panel titles** - MINOR; the BOOKMARKS title renders at about 9 px, smaller than its own section labels and the CLAUDE CODE title of the AI code assistants panel (about 11 px); likely cause: --jp-ui-font-size0 is 0.83333em and the title sits inside .jp-SidePanel-header, which applies it too; the reference header is not nested
  - evidence: gate run 2026-10-28T15:27Z: regression test Galata tests/panel.spec.ts:90:5 "title has the size of the section labels" passed (logs/ui-tests-build2-a.log: 75 passed, 0 failed; title computes 10.8333 px, equal to a section label)
  - repro: open the Bookmarks panel and the Claude Code panel side by side, compare the BOOKMARKS and CLAUDE CODE titles
  - test-tags: FUNCTIONAL
  - log: 2026-10-28T12:41:05Z @kj added
  - log: 2026-10-28T12:42:00Z @kj amended title "BOOKMARKS title smaller than section labels" -> "BOOKMARKS title smaller than other panel titles"; text "the panel title renders at about 9 px, the LINKS, FILES and SESSIONS labels at about 11 px; likely cause: --jp-ui-font-size0 is 0.83333em and .jp-BookmarksPanel-title sets it inside .jp-SidePanel-header, which sets it too, so the title shrinks twice; style/base.css" -> "MINOR; the BOOKMARKS title renders at about 9 px, smaller than its own section labels and the CLAUDE CODE title of the AI code assistants panel (about 11 px); likely cause: --jp-ui-font-size0 is 0.83333em and the title sits inside .jp-SidePanel-header, which applies it too; the reference header is not nested"
  - log: 2026-10-28T12:42:01Z @kj edited repro "open the Bookmarks panel, compare the BOOKMARKS title with the LINKS label" -> "open the Bookmarks panel and the Claude Code panel side by side, compare the BOOKMARKS and CLAUDE CODE titles"
  - log: 2026-10-28T15:27:18Z @kj closed
- [x] `DEF-PANEL-13-TOP-BAR` **a tab dropped on the panel top bar adds no bookmark** - MAJOR; a tab dragged onto the panel header or filter releases with no bookmark, though design.md:267 promises every part of the panel takes the drop; cause `dropTarget` requires a `.jp-BookmarksPanel-section` ancestor; `src/panel/tab_drop.ts`
  - evidence: gate-review run 2026-10-28 on 0.7.62: src/__tests__/tab_drop.spec.ts a drop on the panel top bar lands at the tab kind section root passed, Jest 47 of 47 (logs/make-test-gate-review.log)
  - repro: drag a file tab onto the panel header and release: no bookmark is added and no drop mark shows
  - test-tags: UNIT
  - root-cause: 2026-10-28T19:22:37Z @kj the guard asks for a section ancestor; the panel root `.jp-BookmarksPanel` is the boundary, and the header sits outside every section
  - log: 2026-10-28T19:22:37Z @kj added
  - log: 2026-10-28T19:31:21Z @kj fix attempt 1: Jest tab_drop.spec.ts 'a drop on the panel top bar lands at the tab kind section root' failed before the guard (1 failed, 4 passed, logs/jest-review-b2-r1-before-tabdrop.log); passes 5 of 5 after it (make test: Jest 47 of 47)
  - log: 2026-10-28T21:01:45Z @kj closed
- [x] `DEF-PANEL-19-PROXY-INDENT` **Proxy row icon too far left** - MINOR; the icon of a Proxy section row sits 14 px left of the icons of Links, Files and Sessions rows
  - evidence: Galata recent.spec.ts:254 passed: Proxy row icon has the x of a Links row icon; removing caret() fails it with 37 against 51, the 14 px of the defect; Jest section_view.spec.ts passed
  - repro: with one Links bookmark and one Proxy section page, compare the left edge of the two row icons
  - test-tags: FUNCTIONAL
  - root-cause: 2026-10-30T13:27:48Z @kj renderRecentRow in src/panel/section_view.ts omits the empty caret() spacer that renderRow adds before the icon
  - log: 2026-10-30T13:27:48Z @kj added
  - log: 2026-10-30T15:57:51Z @kj closed: verified at 0.7.82

## Tab Marks `MARK`

The ribbon and the panel dot of a bookmarked tab

- log: 2026-10-28T19:20:19Z @kj category created

- [x] `DEF-MARK-11-DOWN-AREA` **down-area tab loses its ribbon and panel dot** - MAJOR; a bookmarked tab moved to the down area loses its ribbon and its row the open dot, while the tab menu still offers Remove Tab from Bookmarks; cause `TabMarks` reads only `shell.widgets('main')`, and the ribbon rules name `.lm-DockPanel-tabBar`; `src/mark/marks.ts`
  - evidence: gate-review run 2026-10-28 on 0.7.62: ui-tests/tests/tabmark.spec.ts:104:5 a bookmarked tab in the down area carries the ribbon and the row dot passed (logs/ui-tests-gate-review.log, 86 passed, 0 failed)
  - repro: bookmark a file tab, run application:move-widget {area:'down', id:<data-id>}: the ribbon and the row dot are gone
  - test-tags: FUNCTIONAL
  - root-cause: 2026-10-28T19:20:19Z @kj `_sync` loops over main-area widgets only and the four ribbon rules name `.lm-DockPanel-tabBar` as the ancestor; the down stack is a TabPanelSvg whose tab bar carries `.lm-TabPanel-tabBar`
  - log: 2026-10-28T19:20:19Z @kj added
  - log: 2026-10-28T19:31:21Z @kj fix attempt 1: Galata tabmark.spec.ts 'a bookmarked tab in the down area carries the ribbon and the row dot' failed on 0.7.58 with no data-bookmark on the down tab (logs/ui-tests-review-b2-r1-before-tabmark.log); passed on 0.7.59 (logs/ui-tests-review-b2-r1.log: 36 passed)
  - log: 2026-10-28T21:01:45Z @kj closed

## Links `LINK`

Webpage bookmarks: the tab, URL and favicon of a bookmarked page

- log: 2026-10-28T20:01:37Z @kj category created

- [x] `DEF-LINK-14-DOWN-OPEN` **a bookmarked link moved to the down area opens a second copy** - MAJOR; a bookmarked link tab moved to the down area is marked open, but a click on its row opens a second tab of the same page with the same widget id instead of activating the down tab; cause openLink searches the main area only; `src/link/open_link.ts`
  - evidence: gate-review run 2026-10-28 on 0.7.62: ui-tests/tests/links.spec.ts:304:5 a link tab moved out of the main area is reused covers the down area and passed (logs/ui-tests-gate-review.log, 86 passed, 0 failed)
  - repro: bookmark a same-origin link tab, run application:move-widget {area:'down', id:<data-id>}, click the row: a second tab of the page appears in the main area
  - test-tags: FUNCTIONAL
  - root-cause: 2026-10-28T20:01:37Z @kj openLink finds the open tab with Array.from(app.shell.widgets('main')).find(w => w.id === id), so a tab moved to the down area is invisible to it and the create branch adds a second widget with the same id to the main area
  - log: 2026-10-28T20:01:37Z @kj added
  - log: 2026-10-28T20:09:27Z @kj fix attempt 1 (review b2 round 2 fix-2.patch): 'a link tab moved to the down area is reused' failed on 0.7.59, 1 main-dock tab of the id after the click (logs/ui-tests-review-b2-r2-before.log); openLink now searches main and down; passed on 0.7.60, links.spec.ts 16 of 16 (logs/ui-tests-review-b2-r2.log); left open
  - log: 2026-10-28T21:01:45Z @kj closed
- [x] `DEF-LINK-16-SIDE-OPEN` **a bookmarked link moved to a side panel opens a second copy** - MAJOR; a bookmarked link tab moved to the left or right sidebar is marked open, but a click on its row adds a second tab of the page with the same widget id instead of activating the sidebar tab; cause openLink searches the main and down areas only; `src/link/open_link.ts`
  - evidence: gate-review run 2026-10-28 on 0.7.62: ui-tests/tests/links.spec.ts:304:5 a link tab moved out of the main area is reused covers the left and right areas and passed (logs/ui-tests-gate-review.log, 86 passed, 0 failed)
  - repro: bookmark a same-origin link tab, run application:move-widget {area:"left", id:<data-id>}, click the row: a second tab of the page appears in the main area
  - test-tags: FUNCTIONAL
  - root-cause: 2026-10-28T20:33:23Z @kj openLink finds the open tab among shell.widgets('main') and shell.widgets('down') only, so a tab moved to the left or right sidebar is invisible and the create branch adds a second widget with the same id to the main area
  - log: 2026-10-28T20:33:23Z @kj added
  - log: 2026-10-28T20:37:36Z @kj fix attempt 1 (review b2 round 3 fix-1.patch): 'a link tab moved out of the main area is reused' failed on 0.7.60 after the move to the left sidebar, 1 main-dock tab of the id after the row click (logs/ui-tests-review-b2-r3-before.log); openLink now searches main, left, right and down; passed on 0.7.61, links.spec.ts 16 of 16 (logs/ui-tests-review-b2-r3.log); left open; reason: the log records the before and after runs with their log paths, which the next reader needs
  - log: 2026-10-28T21:01:45Z @kj closed

## Accessibility `ARIA`

Screen-reader cues: status messages and announcements

- log: 2026-10-28T20:01:43Z @kj category created

- [x] `DEF-ARIA-15-BANNER-STATUS` **error banner is never announced to screen readers** - MINOR; the session Environment and the File not found banners are plain divs with no live-region role, so a screen-reader user who types an invalid line hears the field's invalid state but not the sentence that says what is wrong; cause the banners carry no role=status; `src/dialogs/edit_session.ts`, `src/dialogs/edit_file.ts`
  - evidence: gate-review run 2026-10-28 on 0.7.62: the role=status pins in ui-tests/tests/sessions.spec.ts:428:7 and ui-tests/tests/files.spec.ts:213:5 passed (logs/ui-tests-gate-review.log, 86 passed, 0 failed)
  - repro: with a screen reader, edit a session and type 1K=x into Environment: the banner appears and nothing is announced
  - test-tags: FUNCTIONAL
  - root-cause: 2026-10-28T20:01:43Z @kj both banner divs are created without a live-region role, so revealing the hidden element adds no status message an assistive technology announces
  - log: 2026-10-28T20:01:43Z @kj added
  - log: 2026-10-28T20:09:21Z @kj fix attempt 1 (review b2 round 2 fix-3.patch): the role=status pins in 'invalid env line disables Save' and 'missing location shows the banner' failed on 0.7.59 with the attribute null (logs/ui-tests-review-b2-r2-before.log); both banners carry role=status; both cases passed on 0.7.60 (logs/ui-tests-review-b2-r2.log); left open
  - log: 2026-10-28T21:01:45Z @kj closed

## Build and Tooling `BUILD`

The build, lint and CI checks over the repository

- log: 2026-10-28T20:56:37Z @kj category created

- [x] `DEF-BUILD-17-TRACKER-PRETTIER` **lint check fails on docs/acc-crit.md because prettier rewrites its wildcards** - MAJOR; `jlpm run lint:check` exits 1 in its prettier:check stage on `docs/acc-crit.md`, the same check CI runs; prettier reads the `NAME_*` wildcards in the mechanism and evidence lines as emphasis and would rewrite six lines, `JPY_*` to `JPY__` and `src/__tests__` to `src/**tests**`; fix unknown; `docs/acc-crit.md`
  - evidence: .prettierignore now ignores docs/acc-crit*.md, docs/defects*.md, docs/pm-hand-edits.md, .agents/JOURNAL.md; logs/lint-gatefix-stylelint.log exit 0, logs/lint-gatefix-eslint.log exit 0 (0 errors, 43 warnings), logs/lint-gatefix-prettier.log exit 0; trackers and journal byte-identical after the run (cmp)
  - repro: PATH=$PWD/.nodeenv/bin:$PATH jlpm run lint:check; node_modules/.bin/prettier --check docs/acc-crit.md exits 1 naming the file (logs/lint-gate-review.log)
  - test-tags: MANUAL
  - root-cause: 2026-10-28T20:56:37Z @kj .prettierignore lists neither `docs/acc-crit*.md` nor `docs/defects*.md`, so jlpm prettier formats the pm-tools trackers and its markdown emphasis parsing consumes the wildcard asterisks; make install runs the same write on every build
  - log: 2026-10-28T20:56:37Z @kj added
  - log: 2026-10-28T20:59:01Z @kj closed

## Proxy Section `PROXY`

The Proxy section of the panel, its tap and its popup

- log: 2026-10-30T19:45:12Z @kj category created

- [x] `DEF-PROXY-20-SERVERS-UPDATE` **Tap does not load with servers.update** - MAJOR; c.ServerProxy.servers.update(...) in the server config: extension fails to load with TypeError, no page is ever listed
  - evidence: Real lab with c.ServerProxy.servers.update: extension loads, page and named server get rows; assignment form, no config, base URL pass; no proxy stays inert. Old read logs TypeError, no row. pytest test_prefixes_hold_the_config_and_entry_point_servers passes, fails without the fix. Galata 118 of 118
  - repro: set c.ServerProxy.servers.update({'x': {...}}), start the server, open /proxy/<port>/: proxy-opens stays []
  - test-tags: UNIT
  - root-cause: 2026-10-30T19:45:12Z @kj proxy_prefixes iterates the unresolved LazyConfigValue of serverapp.config.ServerProxy.servers
  - log: 2026-10-30T19:45:12Z @kj added
  - log: 2026-10-30T20:36:40Z @kj closed
- [x] `DEF-PROXY-21-SECOND-TAB` **Row click opens a second lab tab after the page moved** - MAJOR; a page opened in a lab tab with an id other than server-proxy:<url>, whose address then changed: row click opens a duplicate tab at the start page; HEAD reused the tab
  - evidence: Real lab: tab id tile-1 after pushState, launcher card tab after a link click: row click keeps 1 tab, current; without the fix 2 tabs. Galata recent.spec.ts:426 passes, fails without the fix at :458. Residual: tab from another route that redirected then navigated gets one duplicate
  - repro: server-proxy:open with id tile-1, history.pushState in the frame, click the row: two tabs
  - test-tags: FUNCTIONAL
  - root-cause: 2026-10-30T19:45:13Z @kj openRecent compares only the frame's live address with entry.url, and the feed's generated id is not the opening route's id
  - log: 2026-10-30T19:45:13Z @kj added
  - log: 2026-10-30T20:36:40Z @kj closed
- [x] `DEF-PROXY-22-TWO-ROWS` **One popup open gives two rows on a redirect** - MEDIUM; typed name, no finished read, a page that redirects: rows for the entered URL and the final URL, for one open and one tab
  - evidence: Real lab: Name first, redirecting Path, Open: 1 row with the typed name at the final URL, 1 tab; without the fix 2 rows. Popup blocker on, slow page: page opens, 3,048 ms at most. Galata proxy.spec.ts:642 passes, fails without the fix at :672
  - repro: popup, Name first, then Port and a Path that redirects, Open: PROXY (2)
  - test-tags: FUNCTIONAL
  - root-cause: 2026-10-30T19:45:13Z @kj the typed arm of openProxyPage skips the read, so the row holds the entered URL while the proxy reports the final URL
  - log: 2026-10-30T19:45:13Z @kj added
  - log: 2026-10-30T20:36:40Z @kj closed
- [x] `DEF-PROXY-23-PORT-CUE` **Port error cue wrong in both states** - MINOR; Port 70000 with the caret in the field shows the normal focus ring; an untouched empty Port goes red when left
  - evidence: Real lab: Port 70000 under the caret red, untouched empty Port not red, valid Port brand ring; 5 edit dialogs, 72 computed states identical. Galata proxy.spec.ts:248 passes, fails without the fix at :262
  - repro: popup: type 70000, computed border is the brand ring; empty Port, press Tab: red
  - test-tags: FUNCTIONAL
  - root-cause: 2026-10-30T19:45:13Z @kj the :focus rule overrides :invalid in style/base.css, only .jp-mod-error has a red focus rule, and :invalid matches an empty required field
  - log: 2026-10-30T19:45:13Z @kj added
  - log: 2026-10-30T20:36:40Z @kj closed
- [x] `DEF-PROXY-24-ROW-TOOLTIP` **Long page title unreadable on its row** - MINOR; a Proxy row ends in an ellipsis and its tooltip shows the URL only, while names now come from page titles
  - evidence: Real lab: 84-character title cut by the ellipsis, tooltip holds name and URL, typed name too. Jest 'puts the name and the URL in the tooltip of a row' passes. No mutation run
  - repro: 84-character page title in the default panel width: tooltip is the URL alone
  - test-tags: UNIT
  - root-cause: 2026-10-30T19:45:13Z @kj renderRecentRow sets row.title to entry.url
  - log: 2026-10-30T19:45:13Z @kj added
  - log: 2026-10-30T20:36:40Z @kj closed
- [ ] `DEF-PROXY-25-BROWSER-CHECK` **Plugin fails to activate in the CI browser check** - CRITICAL; commit 1854fbe, CI job build, python -m jupyterlab.browser_check: Plugin 'jupyterlab_bookmarks_manager_extension:plugin' failed to activate; JupyterLab 4.6.5, jupyter-server-proxy 4.6.0; cause unknown, local gates ran 4.6.4; 0.7.84 is not published
  - root-cause: 2026-10-30T21:57:52Z @kj JupyterLab 4.6.5 bundles fast-uri 3.1.8, which throws 'URI scheme is malformed' on the underscore in the plugin id; the settings registry's load rejects, shown as i.forEach is not a function, and activation stops; dc85385 fails the same on 4.6.5, its green run was on 4.6.4
  - repro: CI-equal environment: jupyterlab>=4.6,<5 plus the wheel with its test extra, then python -m jupyterlab.browser_check
  - test-tags: FUNCTIONAL
  - log: 2026-10-30T21:33:10Z @kj added
  - log: 2026-10-30T21:57:52Z @kj Star Colonel ordered the scoped rename; a version cap is against the skill's rule

