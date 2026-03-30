#!/usr/bin/env node
/**
 * Vérifie que la version applicative est alignée entre package.json racine,
 * frontend/package.json et api/app_version.py.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const ROOT_PKG = path.join(ROOT, 'package.json');
const FRONTEND_PKG = path.join(ROOT, 'frontend', 'package.json');
const APP_VERSION_PY = path.join(ROOT, 'api', 'app_version.py');

const PY_VERSION_RE = /APP_VERSION:\s*str\s*=\s*"([^"]+)"/;

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function main() {
  const errors = [];

  if (!fs.existsSync(ROOT_PKG)) {
    console.error(`verify-app-version: manquant ${ROOT_PKG}`);
    process.exit(1);
  }

  const rootVersion = readJson(ROOT_PKG).version;
  if (typeof rootVersion !== 'string') {
    errors.push(`package.json racine: version manquante ou invalide`);
  }

  if (!fs.existsSync(FRONTEND_PKG)) {
    errors.push(`frontend/package.json introuvable`);
  } else {
    const feVersion = readJson(FRONTEND_PKG).version;
    if (feVersion !== rootVersion) {
      errors.push(
        `frontend/package.json version "${feVersion}" != racine "${rootVersion}" (exécuter npm run version:sync)`
      );
    }
  }

  if (!fs.existsSync(APP_VERSION_PY)) {
    errors.push(`api/app_version.py introuvable`);
  } else {
    const py = fs.readFileSync(APP_VERSION_PY, 'utf8');
    const m = py.match(PY_VERSION_RE);
    if (!m) {
      errors.push(`api/app_version.py: impossible de lire APP_VERSION`);
    } else if (m[1] !== rootVersion) {
      errors.push(
        `api/app_version.py APP_VERSION "${m[1]}" != racine "${rootVersion}" (exécuter npm run version:sync)`
      );
    }
  }

  if (errors.length) {
    console.error('verify-app-version: échec');
    errors.forEach((e) => console.error(`  - ${e}`));
    process.exit(1);
  }

  console.log(`verify-app-version: OK (${rootVersion})`);
  process.exit(0);
}

main();
