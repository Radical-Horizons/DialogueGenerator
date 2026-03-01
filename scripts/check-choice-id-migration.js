#!/usr/bin/env node
/**
 * Vérifie que tous les documents Unity v1.1.0 ont des choiceId sur chaque choice.
 * Appelle GET /api/v1/documents/check-migration et sort en code 1 si des documents
 * doivent être migrés (CI / pre-commit gate).
 *
 * Usage: node scripts/check-choice-id-migration.js
 * Env: API_URL (défaut http://localhost:4243)
 */
const apiBase = process.env.API_URL || process.env.API_BASE_URL || 'http://localhost:4243';
const url = `${apiBase.replace(/\/$/, '')}/api/v1/documents/check-migration`;

async function main() {
  let res;
  try {
    res = await fetch(url);
  } catch (err) {
    console.error('Impossible de contacter l’API:', err.message);
    process.exit(2);
  }
  if (!res.ok) {
    console.error('API check-migration:', res.status, res.statusText);
    process.exit(2);
  }
  const data = await res.json();
  const list = data.needsMigration || [];
  if (list.length === 0) {
    console.log('Aucun document à migrer (choiceId OK).');
    process.exit(0);
  }
  console.error(`${list.length} document(s) à migrer (choiceId manquant):`);
  list.forEach(({ documentId, path }) => {
    console.error(`  - ${documentId} (${path})`);
  });
  process.exit(1);
}

main();
