#!/usr/bin/env node
/**
 * Contrôle local de l'aller-retour réplique ↔ blocs sur les dialogues réels (Story 20.1, hors CI).
 *
 * Usage (racine du dépôt) :
 *   node scripts/dialogue-roundtrip-local.cjs [--source <dossier>]
 *
 * Sans `--source` : `Assets/Dialogue/` du dépôt principal (même depuis un worktree), sinon
 * celui du dépôt courant. Code de sortie : celui de Vitest, 2 si la source n'est pas un
 * dossier contenant des `*.json`.
 */
const { execFileSync, spawnSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.resolve(__dirname, '..')
const FRONTEND = path.join(ROOT, 'frontend')
const TEST_FILE = 'src/__tests__/dialogueLineRoundTrip.test.ts'

function hasDialogues(dir) {
  return (
    fs.existsSync(dir) &&
    fs.statSync(dir).isDirectory() &&
    fs.readdirSync(dir).some((name) => name.endsWith('.json'))
  )
}

/** Le dossier d'un worktree ne contient que les restes des e2e : le dépôt principal passe d'abord. */
function defaultSourceDir() {
  const candidates = []
  try {
    const common = execFileSync(
      'git',
      ['-C', ROOT, 'rev-parse', '--path-format=absolute', '--git-common-dir'],
      { encoding: 'utf-8' }
    ).trim()
    candidates.push(path.join(path.dirname(common), 'Assets', 'Dialogue'))
  } catch (error) {
    console.warn(`git indisponible pour trouver le dépôt principal : ${error.message}`)
  }
  candidates.push(path.join(ROOT, 'Assets', 'Dialogue'))
  return candidates.find(hasDialogues) ?? null
}

function main(argv) {
  let source = null
  if (argv.length === 2 && argv[0] === '--source') {
    source = path.resolve(argv[1])
  } else if (argv.length === 0) {
    source = defaultSourceDir()
  } else {
    console.error('Usage : node scripts/dialogue-roundtrip-local.cjs [--source <dossier>]')
    return 2
  }
  if (!source || !hasDialogues(source)) {
    console.error('Aucun dossier de dialogues (*.json) trouvé ; préciser --source.')
    return 2
  }

  const vitest = path.join(FRONTEND, 'node_modules', 'vitest', 'vitest.mjs')
  const result = spawnSync(process.execPath, [vitest, 'run', TEST_FILE, '--reporter=verbose'], {
    cwd: FRONTEND,
    env: { ...process.env, DIALOGUE_ROUNDTRIP_DIR: source },
    stdio: 'inherit',
  })
  if (result.error) {
    console.error(`Vitest n'a pas démarré : ${result.error.message}`)
    return 2
  }
  return result.status ?? 1
}

process.exit(main(process.argv.slice(2)))
