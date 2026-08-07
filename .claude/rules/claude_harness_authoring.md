---
description: >-
  Écrire ou modifier le harnais Claude Code de ce dépôt — règles .claude/rules,
  skills, slash commands, subagents, settings.json. Remplace les anciennes règles
  cursor_rules_authoring / cursor_skills_authoring (mécanisme .mdc disparu).
paths:
  - ".claude/**/*.md"
---
# Authoring du harnais Claude Code

Ce dépôt a migré de Cursor vers Claude Code. Les mécanismes ont changé — ne pas transposer les réflexes `.mdc`.

## Ce qui a changé en migrant depuis Cursor

`.claude/rules/` **est** une convention Claude Code, avec découverte récursive. Le
mécanisme d'attachement conditionnel existe donc toujours — mais **le champ a changé
de nom** :

| Cursor (`.mdc`) | Claude Code (`.md`) | Effet |
|---|---|---|
| `globs: [...]` | `paths: [...]` | limite la règle à des fichiers |
| `alwaysApply: true` | *(absence de `paths`)* | chargement au lancement |

⚠️ **Une règle sans `paths` est chargée à chaque session**, au même niveau que
`CLAUDE.md`. Donc un frontmatter `globs:` hérité de Cursor ne restreint rien : le
champ est ignoré, et la règle est chargée **inconditionnellement**.

C'est l'inverse du piège qu'on redoutait. Le risque n'est pas qu'une règle soit
oubliée — c'est que **tout** soit chargé en permanence et gonfle le contexte.

**Migration faite en août 2026** : les 41 règles portaient `globs:` ou `alwaysApply:`,
donc 119 Ko chargés à chaque session. Après tri, 10 restent toujours actives (26 Ko) et
30 sont conditionnelles. `ui.md` a été supprimée : `ui/` et `main_app.py` n'existent plus.

Corollaire : la table de routage de `CLAUDE.md` n'est **pas** ce qui rend une règle
lisible — c'est le `paths:` qui la charge. La table reste un index humain, et un moyen
d'aller chercher une règle avant d'ouvrir le premier fichier.

- **`.mdc`.** Tout est `.md`.

## Le critère de tri : fichier ou action ?

C'est la seule question à se poser pour décider si une règle porte un `paths:`.

| Déclencheur | Portée | Exemples |
|---|---|---|
| Un **fichier** qu'on lit ou modifie | `paths: [...]` | `graph_editor.md`, `tests.md`, `llm.md` |
| Une **action** qu'on entreprend | pas de `paths` | `branching.md` (ouvrir une PR), `ci_before_push.md` (pousser), `interaction_style.md` (répondre) |

⚠️ `gh pr create` ne lit aucun fichier. Conditionner `branching.md` à un chemin la
rendrait muette exactement au moment où elle compte — c'est ce qui a coûté une PR
ouverte vers `main` en août 2026. Le test `tests/test_claude_rules_frontmatter.py`
fige cette liste.

Deuxième piège, réel : **`description: Invariants. Procédure : skill x` est du YAML
invalide** — le second `: ` est lu comme un séparateur de mapping, tout le frontmatter
devient inanalysable, et le `paths:` qui suit est perdu. La règle redevient permanente
sans que rien ne le signale. Quoter la description dès qu'elle contient `: `.

## Les quatre supports, et quand choisir lequel

| Support | Emplacement | Chargement | Pour quoi |
|---|---|---|---|
| **Mémoire projet** | `CLAUDE.md` | **Toujours**, à chaque session | Invariants courts, table de routage, préférences. Coûte du contexte en permanence — rester dense. |
| **Règle** | `.claude/rules/*.md` | Auto : **toujours** sans `paths:`, sinon à la lecture d'un fichier correspondant | Invariants d'un domaine (graphe, LLM, tests…). C'est le format par défaut. |
| **Skill** | `.claude/skills/<nom>/SKILL.md` | Auto, sur correspondance de la `description` | **Procédures** multi-étapes avec des ressources (`references/`, `scripts/`). Pas pour un simple invariant. |
| **Slash command** | `.claude/commands/*.md` | Explicite, `/nom` | Un flux que l'utilisateur déclenche lui-même. |
| **Subagent** | `.claude/agents/*.md` | Délégation via l'outil `Agent` | Travail isolé avec son propre contexte (revues, lots E2E). |

Règle de tri : *invariant → règle · procédure → skill · déclenché par l'humain → commande · contexte isolé → subagent.*

## Frontmatter

**Règle** (`.claude/rules/*.md`) — `paths` est le seul champ actif ; `description` est
là pour l'humain.

```yaml
---
description: "Une ligne, ce que couvre la règle — quoter si elle contient « : »"
paths:
  - "chemins/concernés/**"
  - "autre/**/*.{ts,tsx}"
---
```

Motifs acceptés : `**/*.ts` (traverse les répertoires), `src/**/*`, `*.md` (racine
seulement), expansion `{ts,tsx}`. `[` ouvre une classe de caractères — pour un crochet
littéral, échapper : `photos \[2024/**`.

⚠️ `alwaysApply` et `globs` sont des champs **Cursor** : Claude Code les ignore. Une
règle est toujours active **par défaut** (absence de `paths`) ; pour la rendre
conditionnelle, lui donner `paths:`. L'import `@.claude/rules/nom.md` dans `CLAUDE.md`
n'est pas nécessaire au chargement — il ne sert qu'à fixer l'ordre de priorité.

Ces imports **ne coûtent pas un double chargement** : vérifié en inspectant le contexte
d'ouverture d'une session (août 2026), chaque règle apparaît une seule fois, qu'elle soit
importée ou seulement découverte. Les garder est donc gratuit.

Les règles personnelles vont dans `~/.claude/rules/` (chargées avant celles du projet,
donc de priorité plus faible). `.claude/rules/` accepte les liens symboliques, fichier
ou répertoire.

**Skill** — `name` + `description` uniquement. La `description` est le **seul** déclencheur : y mettre les mots que l'utilisateur emploierait, pas une définition abstraite. `paths:` n'est pas documenté pour les skills — pour du conditionnel par chemin, écrire une règle.

**Commande** — `description`, plus au besoin `argument-hint`, `allowed-tools`, `model`. Le corps peut utiliser `$ARGUMENTS` / `$1`, `!`commande`` pour injecter une sortie shell, `@fichier` pour injecter un fichier.

**Subagent** — `name`, `description`, `model` (`sonnet` | `opus` | `haiku` | `inherit`), et `tools` en liste blanche. Il n'y a **pas** de `readonly:` : un agent en lecture seule se déclare `tools: Read, Grep, Glob, Bash`.

## Anti-patterns

- Dupliquer dans `CLAUDE.md` le contenu d'une règle : `CLAUDE.md` **route**, il ne recopie pas.
- Écrire un `paths:` dont aucun motif ne matche : la règle ne se déclenche jamais, et rien ne le signale. Vérifier avec `pytest tests/test_claude_rules_frontmatter.py`.
- Conditionner à un chemin une règle qui gouverne une **action** (pousser, ouvrir une PR) : voir le critère de tri plus haut.
- Un skill dont la `description` décrit le domaine au lieu du déclencheur.
- Écrire sous `_bmad/` : propriété de l'installeur BMAD, régénéré à chaque install. Les surcharges vont dans `_bmad/custom/`.
- Faire pointer une **règle, commande ou skill** vers `.cursor/` : Claude Code ne lit rien sous ce dossier, le mécanisme d'auto-attachement `.mdc` a disparu avec la migration.

## Checklist avant de conclure

1. Le fichier est au bon endroit pour son mode de chargement.
2. Une règle **conditionnelle** porte `paths:` (pas `globs:`, inerte). Une règle sans `paths` sera chargée à chaque session — s'en assurer délibérément, c'est du contexte payé en permanence.
3. Aucune extension `.mdc` résiduelle, et aucun `.cursor/` utilisé comme **source de harnais** (voir ci-dessous).
4. Les chemins cités existent réellement — `pytest tests/test_claude_rules_frontmatter.py` le vérifie.

## `.cursor/` : archive externe, pas source de harnais

⚠️ Le dossier `%USERPROFILE%\.cursor\` **existe toujours** et reste vivant. Ne pas le purger.

| Usage | Statut |
|---|---|
| Règles / commandes / agents chargés depuis `.cursor/` | **Interdit** — jamais lu par Claude Code |
| `%USERPROFILE%\.cursor\projects\…` en **archive externe, lecture seule** | **Légitime** |

Trois artefacts du harnais en dépendent réellement — les casser supprimerait le workflow de release et l'essentiel de l'historique diagnostic :

- `.claude/agents/transcript-history-researcher.md` → `…\.cursor\projects\f-Projets-DialogueGenerator\agent-transcripts\`
- `.claude/rules/app_versioning.md` (étape 3) et `.claude/skills/prod-release/` → canvas `…\.cursor\projects\f-Projets-Notion-Scrapper-DialogueGenerator\canvases\app-versions.canvas.tsx`

Avant de « nettoyer » un chemin `.cursor/`, vérifier de quel usage il relève.
