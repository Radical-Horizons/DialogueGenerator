#!/usr/bin/env node
/**
 * Cursor stop hook: chains BMAD workflows only when conversation was marked by beforeSubmitPrompt.
 * After 1st completion (loop_count 0) → send /0-custom-dev-story
 * After 2nd completion (loop_count 1) → send /0-custom-dev-code-review
 * After 3rd completion (loop_count 2) → send "1", then clear state for this conversation.
 * Reads state from .cursor/hooks/state/bmad-chain.json; only sends followup if conversation is marked.
 */
const fs = require('fs');
const path = require('path');

const CHAIN = ['/0-custom-dev-story', '/0-custom-dev-code-review', '1'];
const STATE_PATH = path.join(__dirname, 'state', 'bmad-chain.json');

function main() {
  const raw = fs.readFileSync(0, 'utf8').trim();
  let input;
  try {
    input = raw ? JSON.parse(raw) : {};
  } catch {
    process.stdout.write(JSON.stringify({}) + '\n');
    return;
  }
  const status = input.status;
  const loopCount = typeof input.loop_count === 'number' ? input.loop_count : 0;
  const conversationId = input.conversation_id;

  let state = {};
  try {
    if (fs.existsSync(STATE_PATH)) {
      state = JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'));
    }
  } catch (_) {}

  const entry = state[conversationId];
  if (!entry || !entry.chainActive) {
    process.stdout.write(JSON.stringify({}) + '\n');
    return;
  }

  if (status !== 'completed' || loopCount < 0 || loopCount >= CHAIN.length) {
    if (loopCount >= CHAIN.length) {
      delete state[conversationId];
      try {
        fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2), 'utf8');
      } catch (_) {}
    }
    process.stdout.write(JSON.stringify({}) + '\n');
    return;
  }

  const followupMessage = CHAIN[loopCount];
  if (loopCount === CHAIN.length - 1) {
    delete state[conversationId];
    try {
      fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2), 'utf8');
    } catch (_) {}
  }

  process.stdout.write(JSON.stringify({ followup_message: followupMessage }) + '\n');
}

main();
