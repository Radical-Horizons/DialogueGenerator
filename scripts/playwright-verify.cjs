/**
 * Full Playwright run with CI-style server lifecycle.
 *
 * Sets CI=true so playwright.config.ts uses reuseExistingServer: false and owns
 * API + Vite. Avoids ERR_CONNECTION_REFUSED when a stale external dev server on
 * :3000 dies mid-suite (reuseExistingServer true + external process).
 */
'use strict'

const { spawnSync } = require('node:child_process')

process.env.CI = 'true'

const result = spawnSync('npx', ['playwright', 'test', '--reporter=list'], {
  stdio: 'inherit',
  env: process.env,
  shell: true,
})

const code = result.status
process.exit(code === null ? 1 : code)
