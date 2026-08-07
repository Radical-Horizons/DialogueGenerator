---
description: >-
  Écrire ou modifier le harnais Claude Code de ce dépôt — règles .claude/rules,
  skills, slash commands, subagents, settings.json. Remplace les anciennes règles
  cursor_rules_authoring / cursor_skills_authoring (mécanisme .mdc disparu).
globs:
  - ".claude/**"
  - "CLAUDE.md"
alwaysApply: false
---

# Authoring du harnais Claude Code

Ce dépôt a migré de Cursor vers Claude Code. Les mécanismes ont changé — ne pas transposer les réflexes `.mdc`.

## L'auto-attachement existe — seul le nom du champ a changé

| Cursor (`.mdc`) | Claude Code (`.md`) | Effet |
|---|---|---|
| `globs: [...]` | **`paths: [...]`** | limite la règle aux fichiers correspondants |
| `alwaysApply: true` | *(absence de `paths`)* | chargement à chaque session |

Une règle **sans** `paths:` est chargée au lancement, au même niveau que `CLAUDE.md`. Une règle **avec** `paths:` se déclenche quand Claude lit un fichier correspondant — pas à chaque appel d'outil.

⚠️ Un frontmatter `globs:` hérité de Cursor ne restreint donc **rien** : le champ est ignoré et la règle est chargée **en permanence**. Le risque n'est pas qu'une règle soit oubliée, c'est que **tout** soit chargé et gonfle le contexte.

Corollaire : la table de routage de `CLAUDE.md` n'est **pas** le mécanisme de chargement. C'est un index humain, utile pour aller chercher une règle avant d'ouvrir le premier fichier, et pour les règles qu'aucun chemin ne déclenche (« pousser sur main », « lancer un bench »).

Motifs acceptés : `**/*.ts`, `src/**/*`, `*.md` (racine seulement), expansion `{ts,tsx}`. `[` ouvre une classe de caractères — pour un crochet littéral, échapper (`photos \[2024/**`) ; un motif invalide ne matche rien.

⚠️ **Une `description` contenant `: ` non quoté rend tout le frontmatter inanalysable** — le `paths:` est perdu et la règle redevient permanente sans aucun signal. Quoter dès qu'il y a un deux-points.

Source : documentation officielle Claude Code, section « Organize rules with `.claude/rules/` » (page *memory*). Vérifiée en août 2026 sur CLI 2.1.220.

- **`.mdc`.** Tout est `.md`.

## Les quatre supports, et quand choisir lequel

| Support | Emplacement | Chargement | Pour quoi |
|---|---|---|---|
| **Mémoire projet** | `CLAUDE.md` | **Toujours**, à chaque session | Invariants courts, table de routage, préférences. Coûte du contexte en permanence — rester dense. |
| **Règle** | `.claude/rules/*.md` | À la demande, via la table de routage de `CLAUDE.md` | Invariants d'un domaine (graphe, LLM, tests…). C'est le format par défaut. |
| **Skill** | `.claude/skills/<nom>/SKILL.md` | Auto, sur correspondance de la `description` | **Procédures** multi-étapes avec des ressources (`references/`, `scripts/`). Pas pour un simple invariant. |
| **Slash command** | `.claude/commands/*.md` | Explicite, `/nom` | Un flux que l'utilisateur déclenche lui-même. |
| **Subagent** | `.claude/agents/*.md` | Délégation via l'outil `Agent` | Travail isolé avec son propre contexte (revues, lots E2E). |

Règle de tri : *invariant → règle · procédure → skill · déclenché par l'humain → commande · contexte isolé → subagent.*

## Frontmatter

**Règle** (`.claude/rules/*.md`) — documentaire, format libre mais homogène :

```yaml
---
description: Une ligne, ce que couvre la règle
globs: ["chemins/concernés/**"]   # indicatif : sert à écrire la ligne de routage
alwaysApply: false
---
```

Toute règle `alwaysApply: true` doit être **importée** dans `CLAUDE.md` via `@.claude/rules/nom.md` — sinon elle ne s'applique jamais. Toute règle conditionnelle doit avoir **une ligne dans la table de routage** de `CLAUDE.md` — sinon elle est invisible.

**Skill** — `name` + `description` uniquement. La `description` est le **seul** déclencheur : y mettre les mots que l'utilisateur emploierait, pas une définition abstraite. Ne pas y remettre de clé `paths:` (héritage Cursor, ignorée et cassante).

**Commande** — `description`, plus au besoin `argument-hint`, `allowed-tools`, `model`. Le corps peut utiliser `$ARGUMENTS` / `$1`, `!`commande`` pour injecter une sortie shell, `@fichier` pour injecter un fichier.

**Subagent** — `name`, `description`, `model` (`sonnet` | `opus` | `haiku` | `inherit`), et `tools` en liste blanche. Il n'y a **pas** de `readonly:` : un agent en lecture seule se déclare `tools: Read, Grep, Glob, Bash`.

## Anti-patterns

- Dupliquer dans `CLAUDE.md` le contenu d'une règle : `CLAUDE.md` **route**, il ne recopie pas.
- Créer une règle sans l'ajouter à la table de routage — elle ne sera jamais lue.
- Un skill dont la `description` décrit le domaine au lieu du déclencheur.
- Écrire sous `_bmad/` : propriété de l'installeur BMAD, régénéré à chaque install. Les surcharges vont dans `_bmad/custom/`.
- Faire pointer une **règle, commande ou skill** vers `.cursor/` : Claude Code ne lit rien sous ce dossier, le mécanisme d'auto-attachement `.mdc` a disparu avec la migration.

## Checklist avant de conclure

1. Le fichier est au bon endroit pour son mode de chargement.
2. Une règle nouvelle est **soit** importée dans `CLAUDE.md` (toujours active), **soit** dans la table de routage (conditionnelle).
3. Aucune extension `.mdc` résiduelle, et aucun `.cursor/` utilisé comme **source de harnais** (voir ci-dessous).
4. Les chemins cités existent réellement.

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
