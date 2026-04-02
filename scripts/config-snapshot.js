#!/usr/bin/env node
/**
 * Affiche un snapshot des variables de config dev avec secrets masqués.
 * Usage: node scripts/config-snapshot.js
 *        npm run config:snapshot
 */
const path = require('path');
const { printSnapshot } = require('./redacted-env-snapshot');

printSnapshot(path.join(__dirname, '..'));
