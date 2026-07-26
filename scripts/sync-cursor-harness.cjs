#!/usr/bin/env node
/**
 * Génère `.claude/agents/` et `.claude/commands/` depuis `.cursor/agents/` et
 * `.cursor/commands/`, qui restent la source de vérité.
 *
 * Les deux harnais partagent le même corps de prompt mais pas le même frontmatter :
 *   Cursor  : name / description / model: fast|inherit / readonly: bool
 *   Claude  : name / description / model: sonnet|opus|inherit / tools: A, B, C
 *
 * Le portage est mécanique — le refaire à la main invite la dérive entre les deux
 * copies. `npm run harness:sync` après toute édition sous `.cursor/`.
 *
 * Usage :
 *   node scripts/sync-cursor-harness.cjs          # écrit
 *   node scripts/sync-cursor-harness.cjs --check  # échoue si désynchronisé (CI)
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const CHECK = process.argv.includes('--check');

// Un readonly Cursor n'a pas d'équivalent déclaratif côté Claude Code : on le
// traduit par une liste blanche d'outils sans Edit/Write/NotebookEdit. Bash reste
// autorisé — les reviewers doivent pouvoir lancer pytest/ESLint pour prouver un
// finding plutôt que de spéculer (AGENTS.md, « Learned User Preferences »).
const READONLY_TOOLS = 'Read, Grep, Glob, Bash, WebFetch';

// `fast` désigne chez Cursor le modèle rapide du moment ; côté Claude Code le
// mapping stable est Sonnet. `inherit` existe des deux côtés.
const MODEL_MAP = { fast: 'sonnet', inherit: 'inherit' };

// Commandes déjà couvertes par un skill `.claude/skills/<nom>/` : les porter en
// double créerait deux entrées `/nom` concurrentes.
const skillNames = new Set(
  fs.existsSync(path.join(ROOT, '.claude/skills'))
    ? fs.readdirSync(path.join(ROOT, '.claude/skills'), { withFileTypes: true })
        .filter((e) => e.isDirectory())
        .map((e) => e.name)
    : []
);

const BANNER = '# Généré par scripts/sync-cursor-harness.cjs — éditer .cursor/, pas ce fichier.';

/** Découpe un fichier markdown en { frontmatter (lignes brutes), body }. */
function splitFrontmatter(text) {
  if (!text.startsWith('---')) return { fm: [], body: text };
  const end = text.indexOf('\n---', 3);
  if (end === -1) return { fm: [], body: text };
  const fm = text.slice(4, end).split('\n');
  const body = text.slice(end + 4).replace(/^(\r?\n)+/, '');
  return { fm, body };
}

/**
 * Extrait une clé scalaire du frontmatter, y compris les blocs YAML repliés
 * (`description: >-` suivi de lignes indentées). Retourne la valeur brute, les
 * sauts de ligne internes normalisés en espaces.
 */
function readKey(fmLines, key) {
  const i = fmLines.findIndex((l) => l.startsWith(`${key}:`));
  if (i === -1) return null;
  const inline = fmLines[i].slice(key.length + 1).trim();
  if (inline && inline !== '>-' && inline !== '>' && inline !== '|') {
    return inline.replace(/^['"]|['"]$/g, '');
  }
  const cont = [];
  for (let j = i + 1; j < fmLines.length && /^\s+\S/.test(fmLines[j]); j += 1) {
    cont.push(fmLines[j].trim());
  }
  return cont.join(' ');
}

/** Échappe une valeur pour un scalaire YAML simple-quoté sur une ligne. */
function yamlScalar(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function convertAgent(text, basename) {
  const { fm, body } = splitFrontmatter(text);
  const name = readKey(fm, 'name') || basename;
  const description = readKey(fm, 'description') || '';
  const model = MODEL_MAP[readKey(fm, 'model')] || 'sonnet';
  const readonly = readKey(fm, 'readonly') === 'true';

  const out = [
    '---',
    BANNER,
    `name: ${name}`,
    `description: ${yamlScalar(description)}`,
    `model: ${model}`,
  ];
  if (readonly) out.push(`tools: ${READONLY_TOOLS}`);
  out.push('---', '', body.trimEnd(), '');
  return out.join('\n');
}

function convertCommand(text, basename) {
  const { fm, body } = splitFrontmatter(text);
  // Le nom d'une commande Claude Code vient du nom de fichier : `name:` est
  // ignoré et n'est donc pas repris. Sans frontmatter, on dérive la description
  // du premier titre markdown.
  let description = readKey(fm, 'description');
  if (!description) {
    // Un titre d'un seul mot (`# commit`) ne décrit rien : dans ce cas la
    // première phrase du corps est plus parlante dans le menu `/`.
    const h1 = (body.match(/^#\s+(.+)$/m) || [])[1]?.trim();
    const firstLine = body
      .split('\n')
      .map((l) => l.trim())
      .find((l) => l && !l.startsWith('#'));
    description = (h1 && h1.includes(' ') ? h1 : firstLine || h1) || basename;
    description = description.replace(/\*\*|`/g, '');
  }
  return ['---', BANNER, `description: ${yamlScalar(description)}`, '---', '', body.trimEnd(), ''].join('\n');
}

function sync(srcDir, dstDir, convert, skip) {
  const src = path.join(ROOT, srcDir);
  const dst = path.join(ROOT, dstDir);
  if (!fs.existsSync(src)) return { written: [], stale: [] };
  fs.mkdirSync(dst, { recursive: true });

  const written = [];
  const stale = [];
  const expected = new Set();

  for (const file of fs.readdirSync(src).filter((f) => f.endsWith('.md'))) {
    const basename = path.basename(file, '.md');
    if (skip && skip(basename)) continue;
    expected.add(file);

    const content = convert(fs.readFileSync(path.join(src, file), 'utf8'), basename);
    const target = path.join(dst, file);
    const current = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : null;
    if (current === content) continue;

    if (CHECK) stale.push(`${dstDir}/${file}`);
    else {
      fs.writeFileSync(target, content, 'utf8');
      written.push(`${dstDir}/${file}`);
    }
  }

  // Fichiers générés dont la source a disparu : ne supprimer que ceux qui
  // portent la bannière, jamais un fichier écrit à la main.
  for (const file of fs.readdirSync(dst).filter((f) => f.endsWith('.md'))) {
    if (expected.has(file)) continue;
    if (!fs.readFileSync(path.join(dst, file), 'utf8').includes(BANNER)) continue;
    if (CHECK) stale.push(`${dstDir}/${file} (orphelin)`);
    else {
      fs.unlinkSync(path.join(dst, file));
      written.push(`${dstDir}/${file} (supprimé)`);
    }
  }

  return { written, stale };
}

const results = [
  sync('.cursor/agents', '.claude/agents', convertAgent, null),
  sync('.cursor/commands', '.claude/commands', convertCommand, (b) => skillNames.has(b)),
];

const written = results.flatMap((r) => r.written);
const stale = results.flatMap((r) => r.stale);

if (CHECK) {
  if (stale.length) {
    console.error('Harnais Claude désynchronisé depuis .cursor/ :');
    stale.forEach((f) => console.error(`  ${f}`));
    console.error('\nLancer : npm run harness:sync');
    process.exit(1);
  }
  console.log('Harnais Claude synchronisé avec .cursor/.');
} else if (written.length) {
  console.log(`${written.length} fichier(s) mis à jour :`);
  written.forEach((f) => console.log(`  ${f}`));
} else {
  console.log('Rien à faire — déjà synchronisé.');
}
