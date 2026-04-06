/**
 * BMAD auto-chain: armée sur soumission `sm-create-story` + `auto`, consommée au hook `stop`.
 *
 * État persistant : fichier `.bmad-auto-chain.pending.json` à la racine du workspace (gitignored).
 *
 * @typedef {{ version?: number; pending: string[]; armedAt?: string; workspaceRoot?: string }} ChainState
 * @module bmad-auto-chain-lib
 */
"use strict";

const fs = require("fs");
const path = require("path");

/** @type {string} */
const STATE_FILENAME = ".bmad-auto-chain.pending.json";

/**
 * Racines candidates pour l'état chaîne (ordre : workspace Cursor, puis cwd du process hook).
 * Cursor envoie en général `workspace_roots` sur beforeSubmit / stop — le cwd du hook n'est pas garanti.
 *
 * @param {unknown} payload
 * @returns {string[]}
 */
function candidateWorkspaceRoots(payload) {
  /** @type {string[]} */
  const out = [];
  if (payload && typeof payload === "object") {
    /** @type {Record<string, unknown>} */
    const o = /** @type {Record<string, unknown>} */ (payload);
    const wr = o.workspace_roots;
    if (Array.isArray(wr)) {
      for (const r of wr) {
        if (typeof r === "string" && r.trim()) {
          out.push(path.normalize(r.trim()));
        }
      }
    }
    for (const k of ["workspaceRoot", "workspace_root", "root", "project_path"]) {
      const v = o[k];
      if (typeof v === "string" && v.trim()) {
        out.push(path.normalize(v.trim()));
      }
    }
  }
  out.push(path.normalize(process.cwd()));
  const seen = new Set();
  return out.filter((r) => {
    if (seen.has(r)) {
      return false;
    }
    seen.add(r);
    return true;
  });
}

/**
 * Première racine workspace utile pour écrire l'état à l'armement.
 *
 * @param {unknown} payload
 * @returns {string}
 */
function pickWorkspaceRootForWrite(payload) {
  const roots = candidateWorkspaceRoots(payload);
  return roots[0] || path.normalize(process.cwd());
}

/** @returns {string} */
function getStatePath() {
  return path.join(process.cwd(), STATE_FILENAME);
}

/**
 * @param {unknown} payload
 * @returns {string}
 */
function getStatePathForPayload(payload) {
  return path.join(pickWorkspaceRootForWrite(payload), STATE_FILENAME);
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
    "body",
    "user_message",
  ];
  for (const k of direct) {
    if (typeof o[k] === "string") {
      return o[k];
    }
  }
  const messages = o.messages;
  if (Array.isArray(messages) && messages.length > 0) {
    const last = messages[messages.length - 1];
    if (last && typeof last === "object") {
      const c = /** @type {Record<string, unknown>} */ (last).content;
      if (typeof c === "string") {
        return c;
      }
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
 * @param {unknown} payload
 * @returns {{ state: ChainState; filePath: string } | null}
 */
function loadStateWithPath(payload) {
  const roots = candidateWorkspaceRoots(payload);
  for (const root of roots) {
    const p = path.join(root, STATE_FILENAME);
    try {
      if (!fs.existsSync(p)) {
        continue;
      }
      const raw = fs.readFileSync(p, "utf8");
      const data = JSON.parse(raw);
      if (!data || typeof data !== "object" || !Array.isArray(data.pending)) {
        continue;
      }
      return { state: data, filePath: p };
    } catch (e) {
      debug("loadStateWithPath error", p, e);
    }
  }
  return null;
}

/**
 * @param {string} filePath
 * @param {ChainState} state
 * @returns {void}
 */
function saveStateToPath(filePath, state) {
  fs.writeFileSync(filePath, JSON.stringify(state, null, 2), "utf8");
}

/**
 * @param {string} filePath
 * @returns {void}
 */
function clearStatePath(filePath) {
  try {
    fs.unlinkSync(filePath);
  } catch {
    /* noop */
  }
}

/**
 * @param {unknown} [hookPayload] stdin JSON du hook Cursor (pour workspace_roots)
 * @returns {void}
 */
function armChain(hookPayload) {
  const root = pickWorkspaceRootForWrite(hookPayload);
  const filePath = path.join(root, STATE_FILENAME);
  const state = {
    version: 1,
    pending: ["dev-story", "code-review", "review-finalize"],
    armedAt: new Date().toISOString(),
    workspaceRoot: root,
  };
  saveStateToPath(filePath, state);
  debug("Armed chain", { filePath, state });
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
 * @param {unknown} [hookPayload] stdin JSON du hook `stop` (workspace_roots)
 * @returns {{ step: string; message: string } | null}
 */
function consumeNextFollowup(hookPayload) {
  const loaded = loadStateWithPath(hookPayload);
  if (!loaded || !loaded.state.pending.length) {
    return null;
  }
  const { state, filePath } = loaded;
  const step = state.pending[0];
  const rest = state.pending.slice(1);
  const message = messageForStep(step);
  if (!message) {
    clearStatePath(filePath);
    return null;
  }
  if (rest.length === 0) {
    clearStatePath(filePath);
  } else {
    const { workspaceRoot: _w, ...restState } = state;
    saveStateToPath(filePath, { ...restState, pending: rest });
  }
  return { step, message };
}

module.exports = {
  promptFromHookPayload,
  shouldArmAutoChain,
  armChain,
  consumeNextFollowup,
  getStatePath,
  getStatePathForPayload,
  candidateWorkspaceRoots,
  debug,
};
