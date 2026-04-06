/**
 * BMAD auto-chain: armée sur soumission `sm-create-story` + `auto`, consommée au hook `stop`.
 *
 * État persistant : fichier `.bmad-auto-chain.pending.json` à la racine du workspace (gitignored).
 *
 * @typedef {{ version?: number; pending: string[]; armedAt?: string }} ChainState
 * @module bmad-auto-chain-lib
 */
"use strict";

const fs = require("fs");
const path = require("path");

/** @type {string} */
const STATE_FILENAME = ".bmad-auto-chain.pending.json";

/** @returns {string} */
function getStatePath() {
  return path.join(process.cwd(), STATE_FILENAME);
}

/**
 * @param {...unknown} args
 * @returns {void}
 */
function debug(...args) {
  if (process.env.BMAD_CHAIN_DEBUG === "1") {
    console.error("[bmad-auto-chain]", ...args);
  }
}

/**
 * @param {unknown} value
 * @param {string[]} [out]
 * @returns {string[]}
 */
function collectStrings(value, out = []) {
  if (typeof value === "string") {
    out.push(value);
  } else if (Array.isArray(value)) {
    for (const v of value) {
      collectStrings(v, out);
    }
  } else if (value && typeof value === "object") {
    for (const v of Object.values(value)) {
      collectStrings(v, out);
    }
  }
  return out;
}

/**
 * Best-effort extraction of user-visible prompt from Cursor hook JSON.
 *
 * @param {unknown} payload
 * @returns {string}
 */
function promptFromHookPayload(payload) {
  if (typeof payload === "string") {
    return payload;
  }
  if (!payload || typeof payload !== "object") {
    return "";
  }
  /** @type {Record<string, unknown>} */
  const o = /** @type {Record<string, unknown>} */ (payload);
  const direct = [
    "prompt",
    "userPrompt",
    "user_prompt",
    "text",
    "input",
    "query",
    "message",
    "content",
    "submission",
  ];
  for (const k of direct) {
    if (typeof o[k] === "string") {
      return o[k];
    }
  }
  return collectStrings(payload).join("\n");
}

/**
 * @param {string} promptText
 * @returns {boolean}
 */
function shouldArmAutoChain(promptText) {
  const s = String(promptText || "");
  const createStory =
    /0-custom-sm-create-story|sm-create-story|create-story\/workflow\.yaml|create-story workflow|Context Story:\s*Prepare|\[CS\]\s*Context Story/i.test(
      s,
    );
  const auto = /\bauto\b|#yolo|\byolo mode\b/i.test(s);
  return createStory && auto;
}

const FOLLOWUP_DEV_STORY = `/0-custom-dev-story

MODE AUTO (#yolo) : exécuter immédiatement le workflow Dev Story (charger dev.md, config.yaml, workflow.xml, puis \`_bmad/bmm/workflows/4-implementation/dev-story/workflow.yaml\`). Pas de menu, pas d’attente utilisateur entre les sections. Implémenter la story en statut **ready-for-dev** (fichier sous \`_bmad-output/implementation-artifacts/\` + \`sprint-status.yaml\`).`;

const FOLLOWUP_CODE_REVIEW = `/0-custom-dev-code-review

MODE AUTO (#yolo) : exécuter le workflow code-review (workflow.xml + \`_bmad/bmm/workflows/4-implementation/code-review/workflow.yaml\`). Enchaîner sans bloquer sur les confirmations ; aux choix numérotés, suivre la logique du workflow.`;

/** Réponse minimale si l’agent s’arrête encore sur l’invite finale [1]/[2]/[3]. */
const FOLLOWUP_REVIEW_OPTION_1 = `1`;

/**
 * @returns {ChainState | null}
 */
function loadState() {
  try {
    const p = getStatePath();
    if (!fs.existsSync(p)) {
      return null;
    }
    const raw = fs.readFileSync(p, "utf8");
    const data = JSON.parse(raw);
    if (!data || typeof data !== "object" || !Array.isArray(data.pending)) {
      return null;
    }
    return data;
  } catch (e) {
    debug("loadState error", e);
    return null;
  }
}

/**
 * @param {ChainState} state
 * @returns {void}
 */
function saveState(state) {
  fs.writeFileSync(getStatePath(), JSON.stringify(state, null, 2), "utf8");
}

/**
 * @returns {void}
 */
function clearState() {
  try {
    fs.unlinkSync(getStatePath());
  } catch {
    /* noop */
  }
}

/**
 * @returns {void}
 */
function armChain() {
  const state = {
    version: 1,
    pending: ["dev-story", "code-review", "review-finalize"],
    armedAt: new Date().toISOString(),
  };
  saveState(state);
  debug("Armed chain", state);
}

/**
 * @param {string} step
 * @returns {string}
 */
function messageForStep(step) {
  switch (step) {
    case "dev-story":
      return FOLLOWUP_DEV_STORY;
    case "code-review":
      return FOLLOWUP_CODE_REVIEW;
    case "review-finalize":
      return FOLLOWUP_REVIEW_OPTION_1;
    default:
      return "";
  }
}

/**
 * @returns {{ step: string; message: string } | null}
 */
function consumeNextFollowup() {
  const state = loadState();
  if (!state || state.pending.length === 0) {
    return null;
  }
  const step = state.pending[0];
  const rest = state.pending.slice(1);
  const message = messageForStep(step);
  if (!message) {
    clearState();
    return null;
  }
  if (rest.length === 0) {
    clearState();
  } else {
    saveState({ ...state, pending: rest });
  }
  return { step, message };
}

module.exports = {
  promptFromHookPayload,
  shouldArmAutoChain,
  armChain,
  consumeNextFollowup,
  getStatePath,
  debug,
};
