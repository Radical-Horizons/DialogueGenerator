---
# Généré par scripts/sync-cursor-harness.cjs — éditer .cursor/, pas ce fichier.
description: 'Niveaux de test T0–T3 (pytest, Vitest, Playwright) — commandes officielles du repo pour agents et humains.'
---

Source de vérité détaillée : **`.cursor/rules/workflow.mdc`** (obligations agents, Vitest, Windows). Les commandes BMAD *testarch* restent méthodo ; l’exécution concrète dans ce dépôt suit **cette grille** + `workflow.mdc`.

## Grille T0–T3

| Niveau | But | Backend | Frontend unit | E2E Playwright | Quand |
|--------|-----|---------|---------------|----------------|--------|
| **T0** | Fumée minimale | `npm run test:backend:smoke` → `node scripts/pytest-tier.cjs smoke` (`p0 and not integration`) | `cd frontend && npx vitest run --bail=1 --reporter=dot` ou fichier(s) touché(s) | `npm run test:e2e:smoke` (`--grep @smoke`, `--workers=1`) | Micro-fix agent ; preuve courte |
| **T1** | Périmètre fonctionnel | `node scripts/getPythonPath.js -m pytest tests/chemin/test_fichier.py` ou `-k motif` | `cd frontend && npx vitest run src/__tests__/Fichier.test.ts --reporter=dot` ou `npm run test:quick` | Liste **explicite** de specs : `npx playwright test e2e/a.spec.ts e2e/b.spec.ts --reporter=list --workers=1` | Itération sur une feature |
| **T2** | Couche / pré-merge local | `npm run test:backend:fast` → `not slow` | `npm --prefix frontend run lint` + `npm --prefix frontend test` (Vitest défaut, exclut les 3 fichiers lourds sans `VITEST_FULL`) | Sous-ensemble `@smoke` ou liste ciblée | Avant PR locale ; pas de build Vite obligatoire |
| **T3** | CI / release / « toute la suite » | `npm test` ou `npm run test:backend:full` | `VITEST_FULL=1` + `cd frontend && npm run test:ci` et/ou `npm run test:full` ; build : `npm run build` dans `frontend/` | `npm run test:e2e:verify` ou suite entière | Demande explicite utilisateur ; push `main` (CI complète) |

**Rappels**

- T0/T1/T2 sont des **raccourcis** : ils ne remplacent pas T3 si la politique de branche exige la suite complète.
- **Windows** : ne pas pipe la sortie Vitest vers `Select-Object` (buffering) — redirection vers `tmp\vitest-out.txt` ou JSON (`test:ci`). Voir `workflow.mdc`.
- **Playwright en parallèle multi-agents** : `.cursor/commands/playwright-e2e-parallel.md` — chaque enfant = chemins explicites, pas `npx playwright test` nu.

## Scripts racine (référence)

| Script | Rôle |
|--------|------|
| `npm run test:backend:smoke` | Pytest T0 |
| `npm run test:backend:fast` | Pytest T2 (hors `slow`) |
| `npm run test:backend:full` | Pytest T3 |
| `npm run test:smoke` | Pytest T0 + Vitest bail 1 |
| `npm run test:premerge` | T2 backend + lint + Vitest défaut |
| `npm run test:e2e:smoke` | E2E tag `@smoke` (fichiers : `e2e/auth.spec.ts`, `e2e/graph-load-display-nodes.spec.ts`, `e2e/unity-dialogues-crud.spec.ts`) |
| `npm run test:all` | Inchangé : version + pytest complet + script frontend (build + lint + unit) |

Implémentation backend : [`scripts/pytest-tier.cjs`](scripts/pytest-tier.cjs) (évite les problèmes de quoting `-m` sous Windows).

## Prompts parent → enfants (E2E)

Découper par fichiers disjoints ; voir `playwright-e2e-parallel.md`. Par défaut, un spécialiste E2E peut commencer par **`npm run test:e2e:smoke`** ou le lot T1 listé dans le ticket.
