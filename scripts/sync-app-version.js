#!/usr/bin/env node
/**
 * Synchronise la version applicative depuis package.json (racine) vers
 * frontend/package.json et api/app_version.py.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const ROOT_PKG = path.join(ROOT, 'package.json');
const FRONTEND_PKG = path.join(ROOT, 'frontend', 'package.json');
const APP_VERSION_PY = path.join(ROOT, 'api', 'app_version.py');

const SEMVER_RE = /^\d+\.\d+\.\d+$/;

function readJson(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(raw);
}

function main() {
  if (!fs.existsSync(ROOT_PKG)) {
    console.error(`sync-app-version: fichier manquant: ${ROOT_PKG}`);
    process.exit(1);
  }

  const root = readJson(ROOT_PKG);
  const version = root.version;
  if (typeof version !== 'string' || !SEMVER_RE.test(version)) {
    console.error(
      `sync-app-version: version invalide dans package.json racine: ${JSON.stringify(version)} (attendu semver X.Y.Z)`
    );
    process.exit(1);
  }

  if (fs.existsSync(FRONTEND_PKG)) {
    const fe = readJson(FRONTEND_PKG);
    fe.version = version;
    fs.writeFileSync(FRONTEND_PKG, `${JSON.stringify(fe, null, 2)}\n`, 'utf8');
    console.log(`sync-app-version: frontend/package.json -> ${version}`);
  } else {
    console.warn(`sync-app-version: absent, ignoré: ${FRONTEND_PKG}`);
  }

  const pyContent = `"""Version applicative DialogueGenerator (synchronisée depuis package.json racine).

Ne pas modifier manuellement : exécuter \`npm run version:sync\`.
"""

APP_VERSION: str = "${version}"
`;

  fs.writeFileSync(APP_VERSION_PY, pyContent, 'utf8');
  console.log(`sync-app-version: api/app_version.py -> ${version}`);
}

main();
