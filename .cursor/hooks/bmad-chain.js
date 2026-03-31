#!/usr/bin/env node
/**
 * Cursor `stop` hook — optional follow-up loop (see hooks.json `loop_limit`).
 *
 * Consumes hook input on stdin. Returns no follow-up by default; set
 * `followup_message` in the output JSON to auto-continue the agent loop.
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
  process.stdout.write(JSON.stringify({}));
}

main().catch((err) => {
  console.error("[bmad-chain]", err);
  process.exit(1);
});
