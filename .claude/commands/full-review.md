---
# Généré par scripts/sync-cursor-harness.cjs — éditer .cursor/, pas ce fichier.
description: 'Holistic codebase review: code issues, UX confusion, conflicting logic, and improvements.'
---

Review the entire codebase for code issues, user confusion, conflicting logic, anything that can make our app better.

**Procédure (ne pas raccourcir pour « économiser » le budget — l’utilisateur arbitre.)**

1. Lancer **en parallèle** les sept sous-agents reviewers listés dans `AGENTS.md` (section Subagents / full-repo review) : `api-contracts-reviewer`, `graph-editor-reviewer`, `llm-pipeline-reviewer`, `context-gdd-reviewer`, `security-reviewer`, `backend-services-reviewer`, `test-coverage-reviewer`. Chacun suit son fichier `.cursor/agents/<name>.md`.
2. Synthétiser : findings par sévérité, chevauchements, priorités.
3. Ajouter des **preuves objectives** quand utile : pytest ciblé, ESLint, grep sur motifs à risque — sans remplacer l’étape 1.

Référence transverse : `.cursor/rules/agentivity.mdc` (mandat d’autonomie, `alwaysApply`).
