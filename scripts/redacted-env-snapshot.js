/**
 * Snapshot des variables utiles au dev, avec secrets masqués (collage safe dans un chat / ticket).
 * Ne log jamais les valeurs brutes des clés sensibles.
 */
const fs = require('fs');
const path = require('path');

/** @type {Record<string, string>} */
const EFFECTIVE_DEFAULTS = {
  API_PORT: '4243',
  FRONTEND_PORT: '3000',
};

/** Clés toujours listées si présentes dans .env ou dans process.env (hors .env). */
const EXTRA_KEYS = [
  'API_PORT',
  'FRONTEND_PORT',
  'LOG_CONSOLE_LEVEL',
  'DEV_FAST_STARTUP',
  'DEV_STARTUP_TIMING',
  'SKIP_STARTUP_CONTEXT_VALIDATION',
  'SKIP_STARTUP_LOG_CLEANUP',
  'RELOAD',
  'NODE_ENV',
];

/**
 * @param {string} name
 * @returns {boolean}
 */
function isSensitiveEnvKey(name) {
  const u = String(name).toUpperCase();
  const needles = [
    'SECRET',
    'TOKEN',
    'PASSWORD',
    'PASSWD',
    'API_KEY',
    'PRIVATE_KEY',
    'CREDENTIAL',
    'BEARER',
    'WEBHOOK',
    'AUTHORIZATION',
    'NOTION',
    'OPENAI',
    'JWT_',
    'DATABASE_URL',
    '_DSN',
    'SMTP_',
    'SENTRY_DSN',
  ];
  if (needles.some((n) => u.includes(n))) {
    return true;
  }
  if (u.endsWith('_KEY') && !u.startsWith('FEATURE_')) {
    return true;
  }
  return false;
}

/**
 * Masquage additionnel pour un collage « safe » (URLs ngrok / Cloudflare Tunnel dans CORS, etc.).
 *
 * @param {string} name
 * @returns {boolean}
 */
function shouldRedactSnapshotValue(name) {
  if (isSensitiveEnvKey(name)) {
    return true;
  }
  const u = String(name).toUpperCase();
  if (u === 'CORS_ORIGINS' || u === 'ALLOWED_HOSTS' || u === 'PUBLIC_URL' || u === 'BASE_URL') {
    return true;
  }
  return false;
}

/**
 * @param {string} filePath
 * @returns {Record<string, string>}
 */
function parseDotEnvFile(filePath) {
  /** @type {Record<string, string>} */
  const out = {};
  if (!fs.existsSync(filePath)) {
    return out;
  }
  const text = fs.readFileSync(filePath, 'utf8');
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }
    const eq = trimmed.indexOf('=');
    if (eq <= 0) {
      continue;
    }
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

/**
 * Comportement proche de python-dotenv : une variable déjà dans process.env n'est pas écrasée par .env.
 *
 * @param {string} key
 * @param {Record<string, string>} dotMap
 * @returns {string | undefined}
 */
function effectiveValue(key, dotMap) {
  if (Object.prototype.hasOwnProperty.call(process.env, key)) {
    return process.env[key];
  }
  if (Object.prototype.hasOwnProperty.call(dotMap, key)) {
    return dotMap[key];
  }
  if (Object.prototype.hasOwnProperty.call(EFFECTIVE_DEFAULTS, key)) {
    return EFFECTIVE_DEFAULTS[key];
  }
  return undefined;
}

/**
 * @param {string} key
 * @param {string | undefined} value
 * @returns {string}
 */
function formatDisplayValue(key, value) {
  if (value === undefined) {
    return '(unset)';
  }
  if (value === '') {
    return '(empty string)';
  }
  if (shouldRedactSnapshotValue(key)) {
    return `[redacted: ${value.length} chars]`;
  }
  const max = 120;
  if (value.length > max) {
    return `${value.slice(0, max)}… (+${value.length - max} chars)`;
  }
  return value;
}

/**
 * @param {string} projectRoot
 * @returns {{ lines: string[], keyCount: number }}
 */
function buildSnapshotLines(projectRoot) {
  const envPath = path.join(projectRoot, '.env');
  const dotMap = parseDotEnvFile(envPath);
  const keySet = new Set([...Object.keys(dotMap), ...EXTRA_KEYS]);
  const keys = [...keySet].sort((a, b) => a.localeCompare(b));
  const lines = [];
  lines.push('--- Redacted dev config snapshot (secrets masked) ---');
  lines.push(`Project: ${projectRoot}`);
  lines.push(`.env file: ${fs.existsSync(envPath) ? envPath : '(missing — only process.env / defaults shown)'}`);
  lines.push('');
  for (const key of keys) {
    const v = effectiveValue(key, dotMap);
    if (v === undefined && !Object.prototype.hasOwnProperty.call(dotMap, key)) {
      continue;
    }
    lines.push(`  ${key}=${formatDisplayValue(key, v)}`);
  }
  lines.push('');
  lines.push('--- end snapshot ---');
  return { lines, keyCount: keys.length };
}

/**
 * @param {string} projectRoot
 */
function printSnapshot(projectRoot) {
  const { lines } = buildSnapshotLines(projectRoot);
  console.log(lines.join('\n'));
}

module.exports = {
  isSensitiveEnvKey,
  shouldRedactSnapshotValue,
  parseDotEnvFile,
  effectiveValue,
  formatDisplayValue,
  buildSnapshotLines,
  printSnapshot,
  EFFECTIVE_DEFAULTS,
  EXTRA_KEYS,
};
