#!/usr/bin/env node
/**
 * Démarre le backend pour Playwright avec un port de dev déterministe.
 */
const { spawn } = require('child_process');
const path = require('path');
const getPythonPath = require('./getPythonPath');

const projectRoot = path.join(__dirname, '..');
const pythonPath = getPythonPath(projectRoot);
const apiPort = process.env.E2E_API_PORT || '4243';

const child = spawn(pythonPath, ['-m', 'api.main'], {
  cwd: projectRoot,
  stdio: 'inherit',
  shell: false,
  env: {
    ...process.env,
    API_PORT: apiPort,
    RELOAD: process.env.RELOAD || 'false',
  },
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code || 0);
});

child.on('error', (error) => {
  console.error(`❌ Impossible de démarrer le backend Playwright: ${error.message}`);
  process.exit(1);
});
