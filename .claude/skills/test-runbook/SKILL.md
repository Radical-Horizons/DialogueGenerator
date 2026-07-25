---
name: test-runbook
description: >-
  Aiguillage rapide vers les tests de DialogueGenerator : quelle commande lancer
  (pytest, Vitest, Playwright), quel niveau T0–T3, où sont les règles détaillées.
  Use when you need to pick the right test command for this repo but don't know
  which tier or script applies.
---

# Test runbook (DialogueGenerator)

- **Grille unique T0–T3** : commande `/test-tiers`
- **Obligations agents, Vitest, PowerShell** : `.claude/rules/workflow.md`
- **Pytest structure / marqueurs** : `.claude/rules/tests.md`, `pytest.ini`
- **E2E parallèle multi-agents** : commande `/playwright-e2e-parallel`

Raccourcis racine : `npm run test:backend:smoke` · `test:backend:fast` · `test:smoke` · `test:premerge` · `test:e2e:smoke`.
