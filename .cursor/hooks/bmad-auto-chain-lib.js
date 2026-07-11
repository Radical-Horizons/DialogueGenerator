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

/** Répertoire de ce module (`.cursor/hooks/`) — fiable même si `cwd` du hook est ailleurs. */
const MODULE_DIR = __dirname;

/** @type {string} */
const STATE_FILENAME = ".bmad-auto-chain.pending.json";

/** Trace lisible dans l’IDE : Cursor n’affiche souvent pas le stderr des hooks Node. */
const LAST_RUN_FILE = path.join(MODULE_DIR, "bmad-hook-last-run.json");

/** Append si `BMAD_CHAIN_DEBUG=1` (en plus de stderr). */
const VERBOSE_LOG_FILE = path.join(MODULE_DIR, "bmad-chain-debug.log");

/**
 * Racines candidates pour l'état chaîne (ordre : workspace Cursor, puis cwd du process hook).
 * Cursor envoie en général `workspace_roots` sur beforeSubmit / stop — le cwd du hook n'est pas garanti.
 *
 * @param {unknown} payload
 * @returns {string[]}
 */
/**
 * Remonte quelques niveaux depuis `startDir` pour retrouver la racine du dépôt
 * quand le hook `stop` n'envoie pas `workspace_roots` (cas fréquent Windows / agent).
 *
 * @param {string} startDir
 * @param {number} [maxDepth]
 * @returns {string[]}
 */
function ancestorWorkspaceCandidates(startDir, maxDepth = 12) {
  /** @type {string[]} */
  const out = [];
  let dir = path.resolve(startDir);
  const root = path.parse(dir).root;
  for (let i = 0; i < maxDepth && dir && dir !== root; i++) {
    out.push(path.normalize(dir));
    const parent = path.dirname(dir);
    if (parent === dir) {
      break;
    }
    dir = parent;
  }
  return out;
}

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
  out.push(...ancestorWorkspaceCandidates(process.cwd()));
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
 * Dernière exécution d’un hook BMAD (écrasé à chaque run). Toujours appeler — ne pas throw.
 *
 * @param {Record<string, unknown>} record
 * @returns {void}
 */
function traceHookRun(record) {
  try {
    const line = {
      hint: "Cursor masque souvent stderr des hooks ; ce fichier est la source de vérité locale.",
      lastRunFile: LAST_RUN_FILE,
      at: new Date().toISOString(),
      node: process.version,
      cwd: process.cwd(),
      ...record,
    };
    fs.writeFileSync(LAST_RUN_FILE, JSON.stringify(line, null, 2), "utf8");
  } catch {
    /* ne jamais faire échouer un hook */
  }
}

/**
 * @param {string} line
 * @returns {void}
 */
function appendVerboseLog(line) {
  if (process.env.BMAD_CHAIN_DEBUG !== "1") {
    return;
  }
  try {
    fs.appendFileSync(
      VERBOSE_LOG_FILE,
      `[${new Date().toISOString()}] ${line}\n`,
      "utf8",
    );
  } catch {
    /* noop */
  }
}

/**
 * @param {...unknown} args
 * @returns {void}
 */
function debug(...args) {
  if (process.env.BMAD_CHAIN_DEBUG === "1") {
    const line = args
      .map((a) => {
        if (a instanceof Error) {
          return a.message;
        }
        if (typeof a === "object") {
          try {
            return JSON.stringify(a);
          } catch {
            return String(a);
          }
        }
        return String(a);
      })
      .join(" ");
    appendVerboseLog(line);
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
/**
 * @param {unknown} content
 * @returns {string}
 */
function stringFromMessageContent(content) {
  if (typeof content === "string") {
    return content;
  }
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (part && typeof part === "object" && typeof part.text === "string") {
          return part.text;
        }
        if (typeof part === "string") {
          return part;
        }
        return "";
      })
      .join("");
  }
  return "";
}

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
    "user_input",
    "command",
    "slashCommand",
    "slash_command",
  ];
  for (const k of direct) {
    if (typeof o[k] === "string") {
      return o[k];
    }
  }
  const data = o.data;
  if (data && typeof data === "object") {
    const d = /** @type {Record<string, unknown>} */ (data);
    for (const k of direct) {
      if (typeof d[k] === "string") {
        return d[k];
      }
    }
  }
  const messages = o.messages;
  if (Array.isArray(messages) && messages.length > 0) {
    for (let i = messages.length - 1; i >= 0; i--) {
      const last = messages[i];
      if (last && typeof last === "object") {
        const rec = /** @type {Record<string, unknown>} */ (last);
        const role = rec.role;
        if (role === "assistant" || role === "model") {
          continue;
        }
        const c = rec.content;
        const s = stringFromMessageContent(c);
        if (s) {
          return s;
        }
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
    /01-custom-sm-create-story|sm-create-story|bmad-create-story|create-story\/SKILL\.md|create-story workflow|Context Story:\s*Prepare|\[CS\]\s*Context Story/i.test(
      s,
    );
  const auto = /\bauto\b|#yolo|\byolo mode\b/i.test(s);
  return createStory && auto;
}

const FOLLOWUP_DEV_STORY = `/02-custom-dev-story

MODE AUTO (#yolo) : exécuter immédiatement le skill bmad-dev-story (.agents/skills/bmad-dev-story/SKILL.md). Pas de menu, pas d’attente utilisateur entre les sections. Implémenter la story en statut **ready-for-dev** (fichier sous \`_bmad-output/implementation-artifacts/\` + \`sprint-status.yaml\`).`;

const FOLLOWUP_CODE_REVIEW = `/03-custom-dev-code-review

MODE AUTO (#yolo) : exécuter le skill bmad-code-review (.agents/skills/bmad-code-review/SKILL.md). Enchaîner sans bloquer sur les confirmations ; aux choix numérotés, suivre la logique du skill.`;

/** Réponse minimale si l’agent s’arrête encore sur l’invite finale [1]/[2]/[3]. */
const FOLLOWUP_REVIEW_OPTION_1 = `1`;

/**
 * @param {unknown} payload
 * @returns {{ state: ChainState; filePath: string } | null}
 */
function loadStateWithPath(payload) {
  const roots = candidateWorkspaceRoots(payload);
  /** @type {string[]} */
  const pathsToTry = [];
  for (const root of roots) {
    pathsToTry.push(path.join(root, STATE_FILENAME));
  }
  const seenPaths = new Set();
  for (const p of pathsToTry) {
    if (seenPaths.has(p)) {
      continue;
    }
    seenPaths.add(p);
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
/**
 * Lit l’état chaîne sans le modifier (pour traces hook `stop`).
 *
 * @param {unknown} hookPayload
 * @returns {{ chainArmed: false } | { chainArmed: true; stateFile: string; pendingSteps: string[] }}
 */
function peekPendingState(hookPayload) {
  const loaded = loadStateWithPath(hookPayload);
  if (!loaded || !loaded.state.pending.length) {
    return { chainArmed: false };
  }
  return {
    chainArmed: true,
    stateFile: loaded.filePath,
    pendingSteps: loaded.state.pending.slice(),
  };
}

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
    saveStateToPath(filePath, { ...state, pending: rest });
  }
  return { step, message };
}

module.exports = {
  promptFromHookPayload,
  shouldArmAutoChain,
  armChain,
  consumeNextFollowup,
  peekPendingState,
  getStatePath,
  getStatePathForPayload,
  candidateWorkspaceRoots,
  debug,
  traceHookRun,
};
