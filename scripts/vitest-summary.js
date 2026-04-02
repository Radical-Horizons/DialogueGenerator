#!/usr/bin/env node
/**
 * Reads tmp/vitest-results.json produced by `npm run test:ci` (cd frontend)
 * and prints a human-readable summary. Exit code mirrors vitest pass/fail.
 *
 * Usage (from project root):
 *   cd frontend && npm run test:ci && cd .. && node scripts/vitest-summary.js
 *
 * Iteration quotidienne / agents : `cd frontend && npm run test:quick` (git --changed)
 * ou `npm run test:bail` (arrêt au premier fichier en échec). Eviter de piper Vitest
 * dans PowerShell (`| Select-Object`) : le buffer vide la sortie jusqu'à la fin du run.
 *
 * Rationale: ce script lit le JSON produit par test:ci pour un résumé fiable sans
 * dépendre du pipe shell (surtout sous Windows).
 */
const fs = require('fs')
const path = require('path')

const resultsPath = path.join(__dirname, '..', 'tmp', 'vitest-results.json')

if (!fs.existsSync(resultsPath)) {
  console.error(`[vitest-summary] Results file not found: ${resultsPath}`)
  console.error('  Run `cd frontend && npm run test:ci` first.')
  process.exit(1)
}

let results
try {
  results = JSON.parse(fs.readFileSync(resultsPath, 'utf-8'))
} catch (err) {
  console.error(`[vitest-summary] Failed to parse results: ${err.message}`)
  process.exit(1)
}

const { numPassedTests, numFailedTests, numPendingTests, testResults, success } = results

const totalFiles = testResults ? testResults.length : '?'
const failedFiles = testResults ? testResults.filter((f) => f.status === 'failed').length : '?'

console.log('\n─────────────────────────────────────────')
console.log(' VITEST SUMMARY')
console.log('─────────────────────────────────────────')
console.log(` Test Files : ${totalFiles} total${failedFiles > 0 ? `, ${failedFiles} failed` : ', all passed'}`)
console.log(` Tests      : ${numPassedTests} passed, ${numFailedTests} failed${numPendingTests ? `, ${numPendingTests} pending` : ''}`)
console.log(` Status     : ${success ? '✅ PASSED' : '❌ FAILED'}`)
console.log('─────────────────────────────────────────\n')

if (!success && testResults) {
  const failed = testResults.filter((f) => f.status === 'failed')
  failed.forEach((file) => {
    const relativePath = file.name.replace(process.cwd() + path.sep, '')
    console.log(` ❌ ${relativePath}`)
    if (file.assertionResults) {
      file.assertionResults
        .filter((t) => t.status === 'failed')
        .forEach((t) => console.log(`    • ${t.fullName}`))
    }
  })
  console.log()
}

process.exit(success ? 0 : 1)
