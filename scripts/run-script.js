#!/usr/bin/env node
/**
 * Cross-platform script runner.
 * Auto-detects OS and dispatches to the appropriate script (.ps1 or .sh).
 *
 * Usage:
 *   node scripts/run-script.js <script-name> [args...]
 *
 * Examples:
 *   node scripts/run-script.js setup-venv
 *   node scripts/run-script.js verify-venv
 *   node scripts/run-script.js test-frontend --e2e
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const scriptName = process.argv[2];
if (!scriptName) {
  console.error('Usage: node scripts/run-script.js <script-name> [args...]');
  process.exit(1);
}

const forwardArgs = process.argv.slice(3);
const scriptsDir = path.join(__dirname);
const isWindows = process.platform === 'win32';

const bashScript = path.join(scriptsDir, `${scriptName}.sh`);
const ps1Script = path.join(scriptsDir, `${scriptName}.ps1`);

let cmd, args;

if (isWindows && fs.existsSync(ps1Script)) {
  cmd = 'powershell';
  const ps1Args = forwardArgs.map(a => a.replace(/^--/, '-'));
  args = ['-ExecutionPolicy', 'Bypass', '-File', ps1Script, ...ps1Args];
} else if (fs.existsSync(bashScript)) {
  cmd = 'bash';
  args = [bashScript, ...forwardArgs];
} else if (fs.existsSync(ps1Script)) {
  cmd = 'powershell';
  const ps1Args = forwardArgs.map(a => a.replace(/^--/, '-'));
  args = ['-ExecutionPolicy', 'Bypass', '-File', ps1Script, ...ps1Args];
} else {
  console.error(`Script not found: ${scriptName} (looked for .sh and .ps1 in ${scriptsDir})`);
  process.exit(1);
}

const proc = spawn(cmd, args, { stdio: 'inherit', cwd: path.join(__dirname, '..') });

proc.on('close', (code) => process.exit(code || 0));
proc.on('error', (err) => {
  console.error(`Failed to run ${scriptName}: ${err.message}`);
  process.exit(1);
});
