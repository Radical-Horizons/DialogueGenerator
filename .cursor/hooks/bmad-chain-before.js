#!/usr/bin/env node
/**
 * Cursor beforeSubmitPrompt hook: marks conversation for BMAD chain when user sends the exact trigger.
 * Trigger: "/0-custom-sm-create-story auto" (trimmed).
 * Writes conversation_id to .cursor/hooks/state/bmad-chain.json so the stop hook only follows up for this conversation.
 * Reads JSON from stdin; outputs { continue: true } to allow submission.
 */
const fs = require('fs');
const path = require('path');

const TRIGGER = '/0-custom-sm-create-story auto';
const STATE_PATH = path.join(__dirname, 'state', 'bmad-chain.json');

function main() {
  const raw = fs.readFileSync(0, 'utf8').trim();
  let input;
  try {
    input = raw ? JSON.parse(raw) : {};
  } catch {
    process.stdout.write(JSON.stringify({ continue: true }) + '\n');
    return;
  }
  const prompt = typeof input.prompt === 'string' ? input.prompt.trim() : '';
  const conversationId = input.conversation_id;

  if (prompt !== TRIGGER || !conversationId) {
    process.stdout.write(JSON.stringify({ continue: true }) + '\n');
    return;
  }

  let state = {};
  try {
    const dir = path.dirname(STATE_PATH);
    if (fs.existsSync(STATE_PATH)) {
      state = JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'));
    } else if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  } catch (_) {
    state = {};
  }

  state[conversationId] = { chainActive: true };
  try {
    fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2), 'utf8');
  } catch (_) {}

  process.stdout.write(JSON.stringify({ continue: true }) + '\n');
}

main();
