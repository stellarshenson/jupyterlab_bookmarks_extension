/**
 * Configuration for Playwright using default from @jupyterlab/galata
 */
const baseConfig = require('@jupyterlab/galata/lib/playwright-config');
const { mkdtempSync } = require('fs');
const os = require('os');
const path = require('path');

// Galata pins the test server to 8888 and does not move it when the port is taken.
// JUPYTER_TEST_PORT moves the server (jupyter_server_test_config.py) and this base URL together.
const PORT = process.env.JUPYTER_TEST_PORT || '8888';
const BASE_URL = `http://localhost:${PORT}`;

// One settings folder for the test server and the `jupyterlab-bookmarks` CLIs a test spawns.
// This module runs again in every worker, so the guard makes a worker reuse the folder the main
// process made instead of making one of its own.
const SETTINGS_DIR =
  process.env.JUPYTERLAB_SETTINGS_DIR ||
  mkdtempSync(path.join(os.tmpdir(), 'galata-settings-'));
process.env.JUPYTERLAB_SETTINGS_DIR = SETTINGS_DIR;

module.exports = {
  ...baseConfig,
  // storage.spec.ts and cli.spec.ts share the one real settings file of the test server.
  workers: 1,
  fullyParallel: false,
  // serverFiles 'on' keeps each test folder (tmpPath) in the server root until the server stops:
  // a folder deleted while another worker's file browser lists the root makes jupyter_server
  // answer that listing 404, and the dialog 'Directory not found' blocks the page
  // (DEF-SUITE-2-ROOT-LISTING). Each run starts a server with a new empty root.
  // shortcut: a retry still deletes its failed attempt's folder; revisit if retries are turned on
  use: { ...baseConfig.use, baseURL: BASE_URL, serverFiles: 'on' },
  webServer: {
    command: 'jlpm start',
    url: `${BASE_URL}/lab`,
    timeout: 120 * 1000,
    // Never adopt a server this suite did not start: on 8888 that is a developer's own lab.
    reuseExistingServer: false,
    // Playwright replaces the child environment when `env` is given, so spread it.
    env: { ...process.env, JUPYTERLAB_SETTINGS_DIR: SETTINGS_DIR }
  }
};
