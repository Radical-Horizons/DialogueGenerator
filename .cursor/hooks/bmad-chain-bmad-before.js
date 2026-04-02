#!/usr/bin/env node
/**
 * Cursor `beforeSubmitPrompt` hook — second stage of the BMAD chain.
 *
 * Consumes hook input on stdin and allows submission. Replace this script
 * if you need BMAD-specific checks after the first beforeSubmit hook.
 */

"use strict";

/**
 * Read the full stdin stream as UTF-8 text.
 *
 * @returns {Promise<string>}
 */
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
