#!/usr/bin/env node
/**
 * Cursor `stop` hook — enchaîne dev-story → code-review → `1` si la chaîne AUTO a été armée
 * (voir `bmad-auto-chain-lib.js` + `bmad-chain-before.js`).
 *
 * Sortie JSON : `{ "followup_message": "..." }` ou `{}`.
 *
 * @see https://cursor.com/docs/agent/hooks
 */
"use strict";

const chain = require("./bmad-auto-chain-lib.js");

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
  const raw = await readStdinUtf8();
  /** @type {Record<string, unknown>} */
  let payload = {};
  try {
    payload = JSON.parse(raw || "{}");
    chain.debug(
      "stop hook stdin keys",
      payload && typeof payload === "object" ? Object.keys(payload) : typeof payload,
    );
  } catch {
    chain.debug("stop hook stdin (non-JSON)", String(raw).slice(0, 200));
    payload = {};
  }

  const next = chain.consumeNextFollowup(payload);
  if (!next) {
    process.stdout.write(JSON.stringify({}));
    return;
  }

  chain.debug("followup step", next.step);
  process.stdout.write(JSON.stringify({ followup_message: next.message }));
}

main().catch((err) => {
  console.error("[bmad-chain]", err);
  process.exit(1);
});
