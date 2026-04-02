/**
 * Lance Vitest avec VITEST_FULL=1 pour inclure les tests exclus du chemin "rapide".
 * Usage (depuis la racine du repo) : node scripts/run-vitest-full.cjs [args...]
 * Ex. : npm run test:full (script défini dans frontend/package.json avec cwd frontend)
 */
const { spawnSync } = require('child_process')
const path = require('path')

const frontendDir = path.join(__dirname, '..', 'frontend')
const extraArgs = process.argv.slice(2)

process.env.VITEST_FULL = '1'

const result = spawnSync(
  process.platform === 'win32' ? 'npx.cmd' : 'npx',
  ['vitest', 'run', ...extraArgs],
  {
    cwd: frontendDir,
    env: process.env,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  }
)

process.exit(result.status === null ? 1 : result.status)
