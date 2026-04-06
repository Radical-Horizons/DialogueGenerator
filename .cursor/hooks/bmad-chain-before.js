#!/usr/bin/env node
/**
 * Cursor `beforeSubmitPrompt` hook — arme la chaîne AUTO (create-story → dev-story → review → 1)
 * lorsque le prompt utilisateur contient la commande create-story ET `auto` / `#yolo`.
 *
 * @see bmad-auto-chain-lib.js
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
  } catch {
    payload = {};
  }

  const prompt = chain.promptFromHookPayload(payload);
  if (chain.shouldArmAutoChain(prompt)) {
    chain.armChain(payload);
    chain.debug("Armed from beforeSubmit, prompt snippet:", prompt.slice(0, 240));
  } else {
    chain.debug("Not arming chain", {
      promptLen: prompt.length,
      promptHead: prompt.slice(0, 120),
      roots: chain.candidateWorkspaceRoots(payload),
    });
  }

  process.stdout.write(JSON.stringify({ continue: true }));
}

main().catch((err) => {
  console.error("[bmad-chain-before]", err);
  process.exit(1);
});
