/**
 * Affiche un résumé lisible depuis un rapport Vitest JSON.
 * Usage : `node scripts/vitest-report-summary.js` (défaut tmp/vitest-report.json)
 *         `node scripts/vitest-report-summary.js tmp/vitest-report-full.json`
 */
const fs = require('fs')
const path = require('path')

const argPath = process.argv[2]
const reportPath = argPath
  ? path.resolve(process.cwd(), argPath)
  : path.join(__dirname, '..', 'tmp', 'vitest-report.json')

function main() {
  if (!fs.existsSync(reportPath)) {
    console.error(`Missing report: ${reportPath} (run npm run test:frontend:vitest or :vitest:full first)`)
    process.exit(2)
  }
  const raw = fs.readFileSync(reportPath, 'utf8')
  let data
  try {
    data = JSON.parse(raw)
  } catch {
    console.error(`Invalid JSON: ${reportPath}`)
    process.exit(2)
  }
  const ok = data.success === true && (data.numFailedTests ?? 0) === 0
  const line = [
    ok ? 'Vitest OK' : 'Vitest FAILED',
    `passed=${data.numPassedTests ?? '?'}`,
    `failed=${data.numFailedTests ?? '?'}`,
    `file=${reportPath}`,
  ].join(' | ')
  console.log(line)
  process.exit(ok ? 0 : 1)
}

main()
