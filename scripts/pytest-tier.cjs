/**
 * Lance pytest avec un marqueur de tier (évite les problèmes de quoting sous Windows
 * quand node scripts/getPythonPath.js reçoit -m "p0 and not integration").
 *
 * Usage (racine repo) : node scripts/pytest-tier.cjs <smoke|fast|full> [args supplémentaires pour pytest...]
 */
const { spawnSync } = require('child_process')
const path = require('path')
const getPythonPath = require('./getPythonPath.js')

const tier = process.argv[2] || 'full'
const extra = process.argv.slice(3)

const markerByTier = {
  smoke: 'p0 and not integration',
  fast: 'not slow',
  full: null,
}

const marker = markerByTier[tier]
if (marker === undefined) {
  console.error(`Tier inconnu: ${tier}. Utiliser: smoke | fast | full`)
  process.exit(2)
}

const pythonPath = getPythonPath()
const args = ['-m', 'pytest', 'tests/', '--tb', 'short']
if (marker) {
  args.push('-m', marker)
}
args.push(...extra)

const result = spawnSync(pythonPath, args, {
  cwd: path.join(__dirname, '..'),
  stdio: 'inherit',
  env: process.env,
  shell: false,
})

process.exit(result.status === null ? 1 : result.status)
