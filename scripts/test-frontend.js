#!/usr/bin/env node
/**
 * Exécute les vérifications frontend de manière portable (Windows/Linux/macOS).
 */
const { spawnSync } = require('child_process');
const path = require('path');

const projectRoot = path.join(__dirname, '..');
const frontendRoot = path.join(projectRoot, 'frontend');
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const npxCommand = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const args = new Set(process.argv.slice(2));
const runE2E = args.has('--e2e') || args.has('-e');

/**
 * Exécute une commande et retourne true si elle réussit.
 * @param {string} command
 * @param {string[]} commandArgs
 * @param {string} cwd
 * @returns {boolean}
 */
function runStep(command, commandArgs, cwd) {
  const result = spawnSync(command, commandArgs, {
    cwd,
    stdio: 'inherit',
    shell: false,
    env: process.env,
  });

  if (result.error) {
    console.error(`❌ Impossible d'exécuter ${command}: ${result.error.message}`);
    return false;
  }

  return result.status === 0;
}

const steps = [
  {
    label: '1. Build check...',
    command: npmCommand,
    commandArgs: ['run', 'build'],
    cwd: frontendRoot,
    errorLabel: 'Build echoue',
  },
  {
    label: '2. Lint check...',
    command: npmCommand,
    commandArgs: ['run', 'lint'],
    cwd: frontendRoot,
    errorLabel: 'Lint echoue',
  },
  {
    label: '3. Unit tests (Vitest)...',
    command: npmCommand,
    commandArgs: ['test', '--', '--run'],
    cwd: frontendRoot,
    errorLabel: 'Tests unitaires echoues',
  },
];

if (runE2E) {
  steps.push({
    label: '4. E2E tests (Playwright)...',
    command: npxCommand,
    commandArgs: ['playwright', 'test'],
    cwd: projectRoot,
    errorLabel: 'Tests E2E echoues',
  });
}

const errors = [];

console.log('=== Frontend Tests ===');

for (const step of steps) {
  console.log(`\n${step.label}`);
  if (!runStep(step.command, step.commandArgs, step.cwd)) {
    errors.push(step.errorLabel);
  }
}

console.log('\n=== Summary ===');
if (errors.length === 0) {
  console.log('OK All frontend checks passed!');
  process.exit(0);
}

console.error('X Errors detected:');
for (const error of errors) {
  console.error(`  - ${error}`);
}
process.exit(1);
