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

## Ce qui a disparu

- **`alwaysApply` / `globs` d'auto-attachement.** Claude Code ne charge pas une règle parce qu'un glob correspond. Le frontmatter conservé dans `.claude/rules/*.md` est **documentaire** : il dit l'intention d'origine, il ne déclenche rien.
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
- Laisser un chemin `.cursor/…` dans un fichier : le dossier n'existe plus.

## Checklist avant de conclure

1. Le fichier est au bon endroit pour son mode de chargement.
2. Une règle nouvelle est **soit** importée dans `CLAUDE.md` (toujours active), **soit** dans la table de routage (conditionnelle).
3. Aucun chemin `.cursor/` ni extension `.mdc` résiduels.
4. Les chemins cités existent réellement.
