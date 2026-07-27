---
description: Revue holistique du codebase — 7 reviewers spécialisés en parallèle puis synthèse.
argument-hint: "[périmètre optionnel, ex. frontend/ ou 'depuis v1.8.0']"
---

Review the entire codebase for code issues, user confusion, conflicting logic, anything that can make our app better.

Périmètre demandé : $ARGUMENTS (si vide, tout le dépôt).

**Procédure (ne pas raccourcir pour « économiser » le budget — l'utilisateur arbitre.)**

1. Lancer **en parallèle, dans un seul message**, les sept subagents reviewers — un appel `Agent` par reviewer, chacun avec son `subagent_type` :
   `api-contracts-reviewer`, `graph-editor-reviewer`, `llm-pipeline-reviewer`, `context-gdd-reviewer`, `security-reviewer`, `backend-services-reviewer`, `test-coverage-reviewer`.
2. Synthétiser : findings par sévérité, chevauchements, priorités.
3. Ajouter des **preuves objectives** quand utile : pytest ciblé, ESLint, grep sur motifs à risque — sans remplacer l'étape 1.

Un seul `Agent` qui « fait les sept » n'est **pas** équivalent à sept isolats : chaque reviewer doit avoir son propre contexte.

Référence transverse : `.claude/rules/agentivity.md` (mandat d'autonomie, toujours actif via `CLAUDE.md`).
