import { expect, galata, IJupyterLabPageFixture } from '@jupyterlab/galata';
import {
  bookmarks,
  contextMenu,
  mockBookmarks,
  openPanel,
  PLUGIN_ID,
  plusMenu,
  row,
  sectionLabel,
  tabMark,
  test
} from './helpers';

// Terminals are server-wide and this file is the only one that starts them; its tests run in order
// in one worker, and galata's teardown shuts down every terminal a test started.

/** The settings of every test: the given bookmarks, and screen-reader mode, which puts the terminal screen text in the DOM. */
const settings = (sessions: unknown[] = []) => ({
  ...mockBookmarks({ sessions }),
  '@jupyterlab/terminal-extension:plugin': {
    ...galata.DEFAULT_SETTINGS['@jupyterlab/terminal-extension:plugin'],
    screenReaderMode: true
  }
});

test.use({ mockSettings: settings() });

// A terminal start, a process the server reads from /proc and a screen echo are server round trips.
const TERMINAL_TIMEOUT = 20000;

const SLEEP = 'cd /tmp; export K=v; sleep 300';

const TOGGLE_ITEM =
  '.lm-Menu-item[data-command="jupyterlab_bookmarks_manager_extension:toggle-tab"] .lm-Menu-itemLabel';

interface ITerminalInfo {
  name: string;
  cwd: string;
  command: string;
  env: Record<string, string>;
}

const terminalTab = (page: IJupyterLabPageFixture, name: string) =>
  page
    .getByRole('main')
    .getByRole('tab', { name: `Terminal ${name}`, exact: true });

const terminalTabs = (page: IJupyterLabPageFixture) =>
  page.getByRole('main').getByRole('tab', { name: /^Terminal \d+$/ });

const dialog = (page: IJupyterLabPageFixture) => page.locator('.jp-Dialog');

/** Names of the server's running terminals, from the REST API (galata's route filter does not apply to page.request). */
async function terminalNames(page: IJupyterLabPageFixture): Promise<string[]> {
  const response = await page.request.get('/api/terminals');
  expect(response.ok()).toBe(true);
  return ((await response.json()) as { name: string }[]).map(t => t.name);
}

/** The foreground process of terminal `name` as the extension's server route reads it. */
async function recorded(
  page: IJupyterLabPageFixture,
  name: string
): Promise<ITerminalInfo | undefined> {
  const response = await page.request.get(
    '/jupyterlab-bookmarks-manager-extension/terminals'
  );
  expect(response.ok()).toBe(true);
  const { terminals } = (await response.json()) as {
    terminals: ITerminalInfo[];
  };
  return terminals.find(t => t.name === name);
}

/** Waits for a running terminal that is not in `known`; returns its name. */
async function newTerminal(
  page: IJupyterLabPageFixture,
  known: string[]
): Promise<string> {
  let name = '';
  await expect
    .poll(
      async () => {
        name = (await terminalNames(page)).find(n => !known.includes(n)) ?? '';
        return name;
      },
      { timeout: TERMINAL_TIMEOUT }
    )
    .not.toBe('');
  return name;
}

/** The screen of terminal `name`; screen-reader mode keeps its text in the accessibility tree. */
async function screen(page: IJupyterLabPageFixture, name: string) {
  const id = await terminalTab(page, name).getAttribute('data-id');
  return page.locator(`[id="${id}"] .xterm-accessibility-tree`);
}

/** Types `line` and Enter into terminal `name` once its prompt shows. */
async function typeIn(
  page: IJupyterLabPageFixture,
  name: string,
  line: string
): Promise<void> {
  await expect(await screen(page, name)).toContainText('$', {
    timeout: TERMINAL_TIMEOUT
  });
  const id = await terminalTab(page, name).getAttribute('data-id');
  await page.locator(`[id="${id}"] .xterm-helper-textarea`).focus();
  await page.keyboard.type(line);
  await page.keyboard.press('Enter');
}

/** File > New > Terminal, then `line` typed into it; returns the terminal's name. */
async function startTerminal(
  page: IJupyterLabPageFixture,
  line?: string
): Promise<string> {
  const known = await terminalNames(page);
  await page.menu.clickMenuItem('File>New>Terminal');
  const name = await newTerminal(page, known);
  await expect(terminalTab(page, name)).toHaveClass(/jp-mod-current/);
  if (line) {
    await typeIn(page, name, line);
  }
  return name;
}

/** Waits until the server reads `process` in the foreground of terminal `name`. */
async function waitForProcess(
  page: IJupyterLabPageFixture,
  name: string,
  process: Partial<ITerminalInfo>
): Promise<void> {
  await expect
    .poll(() => recorded(page, name), { timeout: TERMINAL_TIMEOUT })
    .toMatchObject(process);
}

/** A terminal running SLEEP, added through its tab menu, with the panel open; returns the terminal's name. */
async function addSleepTerminal(page: IJupyterLabPageFixture): Promise<string> {
  const name = await startTerminal(page, SLEEP);
  await waitForProcess(page, name, { cwd: '/tmp', command: 'sleep 300' });
  await contextMenu(page, terminalTab(page, name), 'Add Tab to Bookmarks');
  await openPanel(page);
  await expect(row(page, 'sleep - tmp')).toBeVisible();
  return name;
}

/**
 * Shuts terminal `name` down on the server, as closing its tab would not, and waits for its tab to
 * close. The server then reuses the lowest free name, so the next terminal may get the same name.
 */
async function shutDown(
  page: IJupyterLabPageFixture,
  name: string
): Promise<void> {
  expect((await page.request.delete(`/api/terminals/${name}`)).ok()).toBe(true);
  await expect(terminalTab(page, name)).toHaveCount(0, {
    timeout: TERMINAL_TIMEOUT
  });
}

/** Edit Bookmark... on the row; returns the dialog. */
async function openEdit(page: IJupyterLabPageFixture, name: string) {
  await contextMenu(page, row(page, name), 'Edit Bookmark...');
  await expect(dialog(page)).toBeVisible();
  return dialog(page);
}

/** Edit Bookmark..., the given field values, Save. */
async function saveEdit(
  page: IJupyterLabPageFixture,
  name: string,
  fields: Record<string, string>
): Promise<void> {
  const edit = await openEdit(page, name);
  for (const [label, value] of Object.entries(fields)) {
    await edit.getByLabel(label, { exact: true }).fill(value);
  }
  await edit.locator('.jp-mod-accept').click();
  await expect(dialog(page)).toHaveCount(0);
}

/** The label of the bookmark item in the context menu of terminal `name`'s tab. */
async function tabMenuLabel(page: IJupyterLabPageFixture, name: string) {
  await terminalTab(page, name).click({ button: 'right' });
  return page.locator(TOGGLE_ITEM);
}

test('tab menu adds a terminal', async ({ page }) => {
  const name = await startTerminal(page, SLEEP);
  await waitForProcess(page, name, { cwd: '/tmp', command: 'sleep 300' });
  await openPanel(page);
  await expect(sectionLabel(page, 'sessions')).toHaveText('SESSIONS (0)');

  await contextMenu(page, terminalTab(page, name), 'Add Tab to Bookmarks');
  await expect(sectionLabel(page, 'sessions')).toHaveText('SESSIONS (1)');
  await expect(row(page, 'sleep - tmp')).toHaveAttribute(
    'title',
    '/tmp: sleep 300'
  );
});

test('a bookmarked terminal tab carries the ribbon', async ({ page }) => {
  const name = await startTerminal(page, SLEEP);
  await waitForProcess(page, name, { cwd: '/tmp', command: 'sleep 300' });
  // This case lives here and not in tabmark.spec.ts, because only this file starts terminals.
  const element = terminalTab(page, name);
  await contextMenu(page, element, 'Add Tab to Bookmarks');
  await expect(element).toHaveAttribute('data-bookmark', 'brand');
  await expect
    .poll(async () => (await tabMark(element)).content)
    .not.toBe('none');

  await contextMenu(page, element, 'Remove Tab from Bookmarks');
  await expect(element).not.toHaveAttribute('data-bookmark');
  await expect.poll(async () => (await tabMark(element)).content).toBe('none');
});

test('edit dialog shows the recorded recipe', async ({ page }) => {
  await addSleepTerminal(page);

  const edit = await openEdit(page, 'sleep - tmp');
  await expect(edit.getByLabel('Working directory')).toHaveValue('/tmp');
  await expect(edit.getByLabel('Command')).toHaveValue('sleep 300');
  await expect(edit.getByLabel('Environment')).toHaveValue('K=v');
  await edit.locator('.jp-mod-reject').click();
  await expect(dialog(page)).toHaveCount(0);
});

test('the default filter leaves a listed name out of a capture', async ({
  page
}) => {
  const name = await startTerminal(
    page,
    'cd /tmp; export JPY_ONE=x K=v; sleep 300'
  );
  await waitForProcess(page, name, { cwd: '/tmp', command: 'sleep 300' });
  // The server reports JPY_ONE; the setting's default `JPY_*` drops it where the capture is stored.
  await contextMenu(page, terminalTab(page, name), 'Add Tab to Bookmarks');
  await openPanel(page);
  const edit = await openEdit(page, 'sleep - tmp');
  await expect(edit.getByLabel('Environment')).toHaveValue('K=v');
});

test.describe('with a filter entry saved in the settings', () => {
  test.use({
    mockSettings: {
      ...settings(),
      [PLUGIN_ID]: { bookmarks: bookmarks(), sessionEnvExclude: ['FILTER_*'] }
    }
  });

  test('the filter setting leaves the name out of a capture', async ({
    page
  }) => {
    const name = await startTerminal(
      page,
      'cd /tmp; export FILTER_ONE=x K=v; sleep 300'
    );
    await waitForProcess(page, name, { cwd: '/tmp', command: 'sleep 300' });
    await contextMenu(page, terminalTab(page, name), 'Add Tab to Bookmarks');
    await openPanel(page);
    const edit = await openEdit(page, 'sleep - tmp');
    await expect(edit.getByLabel('Environment')).toHaveValue('K=v');
  });
});

test('recognised terminal offers remove', async ({ page }) => {
  const name = await startTerminal(page, SLEEP);
  await waitForProcess(page, name, { cwd: '/tmp', command: 'sleep 300' });
  const item = await tabMenuLabel(page, name);
  await expect(item).toHaveText('Add Tab to Bookmarks');
  await item.click();

  await expect(await tabMenuLabel(page, name)).toHaveText(
    'Remove Tab from Bookmarks',
    { timeout: 2000 }
  );
  await page.keyboard.press('Escape');
});

test('tab menu removes a session', async ({ page }) => {
  const name = await addSleepTerminal(page);
  await expect(sectionLabel(page, 'sessions')).toHaveText('SESSIONS (1)');

  await contextMenu(page, terminalTab(page, name), 'Remove Tab from Bookmarks');
  await expect(sectionLabel(page, 'sessions')).toHaveText('SESSIONS (0)');
  await expect(row(page, 'sleep - tmp')).toHaveCount(0);
});

test('click activates the running terminal', async ({ page }) => {
  const name = await addSleepTerminal(page);
  const known = await terminalNames(page);
  await page.activity.activateTab('Launcher');
  await expect(terminalTab(page, name)).not.toHaveClass(/jp-mod-current/);

  await row(page, 'sleep - tmp').click();
  await expect(terminalTab(page, name)).toHaveClass(/jp-mod-current/);
  await expect(terminalTabs(page)).toHaveCount(1);
  expect(await terminalNames(page)).toEqual(known);
});

test('click starts the session in a new terminal', async ({ page }) => {
  const name = await addSleepTerminal(page);
  await shutDown(page, name);

  await row(page, 'sleep - tmp').click();
  const started = await newTerminal(page, []);
  await expect(terminalTab(page, started)).toHaveClass(/jp-mod-current/);
  await expect(await screen(page, started)).toContainText(
    "export K='v'; sleep 300",
    { timeout: TERMINAL_TIMEOUT }
  );
  await waitForProcess(page, started, { cwd: '/tmp', command: 'sleep 300' });
});

test('double-click starts the session once', async ({ page }) => {
  const name = await addSleepTerminal(page);
  await shutDown(page, name);
  const known = await terminalNames(page);

  await row(page, 'sleep - tmp').dblclick();
  const started = await newTerminal(page, known);
  await waitForProcess(page, started, { cwd: '/tmp', command: 'sleep 300' });
  expect(await terminalNames(page)).toHaveLength(known.length + 1);
});

test('second click while starting opens no second terminal', async ({
  page
}) => {
  const name = await addSleepTerminal(page);
  await shutDown(page, name);
  const known = await terminalNames(page);

  await row(page, 'sleep - tmp').click();
  const started = await newTerminal(page, known);
  // The line has reached the terminal, and its shell is still starting (jupyter_server_test_config.py).
  await expect(await screen(page, started)).toContainText(
    "export K='v'; sleep 300",
    { timeout: TERMINAL_TIMEOUT }
  );
  expect((await recorded(page, started))?.command).not.toBe('sleep 300');

  await row(page, 'sleep - tmp').click();
  await waitForProcess(page, started, { cwd: '/tmp', command: 'sleep 300' });
  expect(await terminalNames(page)).toHaveLength(known.length + 1);
  await expect(terminalTabs(page)).toHaveCount(1);
});

test('plain shell bookmark reopens in its cwd', async ({ page }) => {
  const name = await startTerminal(page, 'cd /tmp');
  await waitForProcess(page, name, { cwd: '/tmp', command: '' });
  await contextMenu(page, terminalTab(page, name), 'Add Tab to Bookmarks');
  await openPanel(page);
  await expect(row(page, 'shell - tmp')).toHaveAttribute('title', '/tmp: ');
  await shutDown(page, name);

  await row(page, 'shell - tmp').click();
  const started = await newTerminal(page, []);
  await typeIn(page, started, 'pwd');
  // The server root is a galata-test- folder under /tmp, so only an exact line proves /tmp.
  await expect(
    (await screen(page, started)).getByText('/tmp', { exact: true })
  ).toHaveCount(1, { timeout: TERMINAL_TIMEOUT });
});

// The Sessions part of New Bookmark (Links and Files: tree.spec.ts); only this file starts terminals.
test('new bookmark in Sessions', async ({ page }) => {
  await openPanel(page);
  await plusMenu(page, 'Sessions', 'New Bookmark...');
  const add = dialog(page);
  const field = (label: string) => add.getByLabel(label, { exact: true });
  const save = add.locator('.jp-mod-accept');
  await expect(add.locator('.jp-Dialog-header')).toHaveText('New Bookmark');
  for (const label of ['Name', 'Working directory', 'Command', 'Environment']) {
    await expect(field(label)).toHaveValue('');
  }
  await field('Name').fill('Typed session');
  await field('Working directory').fill('/tmp');
  await field('Command').fill('sleep 300');
  // A secret name is refused, as in an edit.
  await field('Environment').fill('GITHUB_TOKEN=x');
  await expect(save).toBeDisabled();
  await field('Environment').fill('K=v');
  await expect(save).toBeEnabled();
  await save.click();
  await expect(dialog(page)).toHaveCount(0);
  const typed = row(page, 'Typed session');
  await expect(typed).toHaveAttribute('aria-level', '1');
  await expect(typed).toHaveAttribute('title', '/tmp: sleep 300');
  await expect(sectionLabel(page, 'sessions')).toHaveText('SESSIONS (1)');

  const known = await terminalNames(page);
  await typed.click();
  const started = await newTerminal(page, known);
  await expect(await screen(page, started)).toContainText(
    "export K='v'; sleep 300",
    { timeout: TERMINAL_TIMEOUT }
  );
  await waitForProcess(page, started, { cwd: '/tmp', command: 'sleep 300' });
});

test.describe('with a stored session', () => {
  test.use({
    mockSettings: settings([
      {
        kind: 'session',
        id: 's1',
        name: 'sleep - tmp',
        cwd: '/tmp',
        command: 'sleep 300',
        env: { K: 'v' }
      }
    ])
  });

  test('edit changes the session name', async ({ page }) => {
    await openPanel(page);
    await saveEdit(page, 'sleep - tmp', { Name: 'My session' });
    await expect(row(page, 'My session')).toBeVisible();
    await expect(row(page, 'sleep - tmp')).toHaveCount(0);
    await expect(sectionLabel(page, 'sessions')).toHaveText('SESSIONS (1)');
  });

  test('invalid env line disables Save', async ({ page }) => {
    await openPanel(page);
    const edit = await openEdit(page, 'sleep - tmp');
    const save = edit.locator('.jp-mod-accept');
    const env = edit.getByLabel('Environment');
    const banner = edit.locator('.jp-BookmarksPanel-banner');
    await expect(save).toBeEnabled();
    await expect(banner).toBeHidden();

    await env.fill('1K=x');
    await expect(save).toBeDisabled();
    await expect(banner).toBeVisible();
    await expect(banner).toHaveAttribute('role', 'status');
    await expect(banner).toHaveText(
      'Each line must be NAME=value. A name that recording leaves out, such as GITHUB_TOKEN, disables Save.'
    );
    await expect(env).toHaveAttribute('aria-invalid', 'true');
    await env.fill('K=x');
    await expect(save).toBeEnabled();
    await expect(banner).toBeHidden();
    await expect(env).toHaveAttribute('aria-invalid', 'false');
    await env.fill('GITHUB_TOKEN=x');
    await expect(save).toBeDisabled();
    await edit.locator('.jp-mod-reject').click();
    await expect(dialog(page)).toHaveCount(0);
  });

  test('a filtered name typed in the dialog is exported', async ({ page }) => {
    await openPanel(page);
    // PATH is on the default filter list; a typed name is kept and exported on the next start.
    await saveEdit(page, 'sleep - tmp', { Environment: 'PATH=/opt/tool/bin' });
    const known = await terminalNames(page);
    await row(page, 'sleep - tmp').click();
    const started = await newTerminal(page, known);
    await expect(await screen(page, started)).toContainText(
      "export PATH='/opt/tool/bin'; sleep 300",
      { timeout: TERMINAL_TIMEOUT }
    );
    // The shell prints the value itself, so the export took effect.
    await typeIn(page, started, 'echo $PATH');
    await expect(
      (await screen(page, started)).getByText('/opt/tool/bin', { exact: true })
    ).toHaveCount(1, { timeout: TERMINAL_TIMEOUT });
  });
});

test('edit changes the command and the environment', async ({ page }) => {
  const name = await addSleepTerminal(page);
  await saveEdit(page, 'sleep - tmp', {
    Command: 'sleep 301',
    Environment: 'K2=w x'
  });
  await shutDown(page, name);

  await row(page, 'sleep - tmp').click();
  const started = await newTerminal(page, []);
  await expect(await screen(page, started)).toContainText(
    "export K2='w x'; sleep 301",
    { timeout: TERMINAL_TIMEOUT }
  );
});

test('edit changes the working directory', async ({ page }) => {
  const name = await startTerminal(page, 'cd /usr');
  await waitForProcess(page, name, { cwd: '/usr', command: '' });
  await contextMenu(page, terminalTab(page, name), 'Add Tab to Bookmarks');
  await openPanel(page);
  await saveEdit(page, 'shell - usr', { 'Working directory': '/tmp' });
  await expect(row(page, 'shell - usr')).toHaveAttribute('title', '/tmp: ');
  await shutDown(page, name);

  await row(page, 'shell - usr').click();
  const started = await newTerminal(page, []);
  await typeIn(page, started, 'pwd');
  await expect(
    (await screen(page, started)).getByText('/tmp', { exact: true })
  ).toHaveCount(1, { timeout: TERMINAL_TIMEOUT });
});

test('edit leaves the running terminal alone', async ({ page }) => {
  const name = await addSleepTerminal(page);
  await saveEdit(page, 'sleep - tmp', { Command: 'sleep 301' });
  await expect(row(page, 'sleep - tmp')).toHaveAttribute(
    'title',
    '/tmp: sleep 301'
  );

  await expect(terminalTab(page, name)).toHaveCount(1);
  expect(await recorded(page, name)).toMatchObject({
    cwd: '/tmp',
    command: 'sleep 300'
  });
});

test('edited recipe is used for recognition', async ({ page }) => {
  const name = await addSleepTerminal(page);
  await expect(await tabMenuLabel(page, name)).toHaveText(
    'Remove Tab from Bookmarks'
  );
  await page.keyboard.press('Escape');

  await saveEdit(page, 'sleep - tmp', { Command: 'sleep 301' });
  await expect(await tabMenuLabel(page, name)).toHaveText(
    'Add Tab to Bookmarks'
  );
  await page.keyboard.press('Escape');
});

test('click reopens a running terminal without a tab', async ({ page }) => {
  const name = await addSleepTerminal(page);
  const known = await terminalNames(page);
  await terminalTab(page, name).locator('.lm-TabBar-tabCloseIcon').click();
  await expect(terminalTab(page, name)).toHaveCount(0);
  expect(await terminalNames(page)).toEqual(known);

  await row(page, 'sleep - tmp').click();
  await expect(terminalTab(page, name)).toHaveCount(1);
  await expect(terminalTab(page, name)).toHaveClass(/jp-mod-current/);
  await expect(terminalTabs(page)).toHaveCount(1);
  expect(await terminalNames(page)).toEqual(known);
});

test('click after Ctrl-C starts the session', async ({ page }) => {
  const name = await addSleepTerminal(page);
  const id = await terminalTab(page, name).getAttribute('data-id');
  await page.locator(`[id="${id}"] .xterm-helper-textarea`).focus();
  await page.keyboard.press('Control+c');
  await expect(await screen(page, name)).toContainText('^C');

  await row(page, 'sleep - tmp').click();
  const started = await newTerminal(page, [name]);
  await expect(terminalTabs(page)).toHaveCount(2);
  await expect(await screen(page, started)).toContainText(
    "export K='v'; sleep 300",
    { timeout: TERMINAL_TIMEOUT }
  );
});
