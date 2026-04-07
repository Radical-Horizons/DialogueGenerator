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
  let stdinJsonOk = true;
  try {
    payload = JSON.parse(raw || "{}");
    chain.debug(
      "stop hook stdin keys",
      payload && typeof payload === "object" ? Object.keys(payload) : typeof payload,
    );
  } catch {
    stdinJsonOk = false;
    chain.debug("stop hook stdin (non-JSON)", String(raw).slice(0, 200));
    payload = {};
  }

  const peek = chain.peekPendingState(payload);
  const next = chain.consumeNextFollowup(payload);

  chain.traceHookRun({
    hook: "stop",
    stdinLength: raw.length,
    stdinJsonOk,
    payloadKeys: Object.keys(payload),
    peek,
    consumedStep: next ? next.step : null,
    wroteFollowupToStdout: Boolean(next),
    followupMessageChars: next ? next.message.length : 0,
  });

  if (!next) {
    process.stdout.write(JSON.stringify({}));
    return;
  }

  chain.debug("followup step", next.step);
  // Certaines versions de Cursor lisent `followupMessage` (camelCase) plutôt que `followup_message`.
  process.stdout.write(
    JSON.stringify({
      followup_message: next.message,
      followupMessage: next.message,
    }),
  );
}

main().catch((err) => {
  try {
    chain.traceHookRun({
      hook: "stop",
      error: err instanceof Error ? err.message : String(err),
    });
  } catch {
    /* noop */
  }
  console.error("[bmad-chain]", err);
  process.exit(1);
});
