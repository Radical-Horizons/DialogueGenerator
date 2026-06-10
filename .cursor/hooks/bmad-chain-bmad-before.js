#!/usr/bin/env node
/**
 * @deprecated Ancien 2e hook `beforeSubmitPrompt`. **Ne plus référencer depuis hooks.json** :
 * deux processus successifs peuvent recevoir un stdin vide / incohérent selon Cursor, ce qui
 * empêchait l’armement de la chaîne AUTO. Tout est regroupé dans `bmad-chain-before.js`.
 *
 * Si un clone référence encore ce fichier, il reste un no-op sûr (draine stdin, continue: true).
 */
"use strict";

async function readStdinUtf8() {
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function main() {
  await readStdinUtf8();
  process.stdout.write(JSON.stringify({ continue: true }));
}

main().catch((err) => {
  console.error("[bmad-chain-bmad-before]", err);
  process.exit(1);
});
