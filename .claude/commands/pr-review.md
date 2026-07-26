---
description: Revue du diff courant (branche vs base) par les seuls subagents concernés par les chemins touchés. Version ciblée de /full-review — à lancer avant d'ouvrir une PR.
---

Revue **du diff**, pas du dépôt entier. Contrairement à `/full-review` qui lance les sept
reviewers, on ne réveille ici que ceux dont le périmètre est réellement touché.

C'est le même protocole que la revue automatique de PR
(`.github/workflows/claude-review.yml`) : local et CI rendent le même verdict.

## 1. Établir le diff

```
git fetch origin --quiet
git diff --name-only origin/main...HEAD
```

Si la PR vise `dev`, utiliser `origin/dev...HEAD`.

Exclure `data/GDD_categories/` et `data/Vision.json` du raisonnement code : ce sont des
données GDD synchronisées depuis Notion, pas du code à reviewer. Les compter à part.

## 2. Router vers les subagents

Lancer **en parallèle, dans un seul tour**, un `Agent` par reviewer dont au moins un chemin
correspond. Ne pas en lancer un huitième « généraliste » par-dessus.

| Chemins touchés | Subagent |
|---|---|
| `api/routers/`, `api/schemas/`, `frontend/src/api/`, `frontend/src/types/api.ts` | `api-contracts-reviewer` |
| `frontend/src/store/*Slice*.ts`, `graphStore.ts`, `graphViewStore.ts`, `frontend/src/components/graph/`, `frontend/src/utils/graph*.ts` | `graph-editor-reviewer` |
| `core/llm/`, `core/prompt/`, `services/llm_*.py`, `services/dialogue_generation_service.py`, `api/routers/streaming.py`, `config/llm_*.json` | `llm-pipeline-reviewer` |
| `core/context/`, `services/gdd_*.py`, `services/context_*.py`, `api/routers/context.py`, `frontend/src/store/context*Store.ts` | `context-gdd-reviewer` |
| `api/routers/auth.py`, `api/middleware/`, `api/services/auth_service.py`, `api/dependencies.py`, `api/main.py`, `frontend/src/components/auth/` | `security-reviewer` |
| `services/` (hors LLM/GDD), `api/container.py`, `factories/`, `models/`, `constants.py` | `backend-services-reviewer` |
| `tests/`, `**/__tests__/`, `*.test.ts(x)` — **et** tout diff de logique non accompagné de tests | `test-coverage-reviewer` |
| `e2e/`, `playwright*.config.ts` | `playwright-e2e-specialist` (en lecture seule ici : signaler, ne pas réparer) |

`test-coverage-reviewer` se déclenche donc aussi sur un diff **sans** fichier de test — c'est
précisément le cas où son avis compte (`.claude/rules/tests.md` : test de régression
obligatoire pour tout fix de bug non trivial).

## 3. Synthétiser

Findings groupés par sévérité (bloquant / à corriger / suggestion), doublons fusionnés,
chaque item ancré en `chemin:ligne`. Signaler explicitement les désaccords entre reviewers
plutôt que de les lisser.

## 4. Prouver

Pour tout finding « bloquant », apporter une preuve exécutée — pytest ciblé, `npm --prefix
frontend run lint`, ou grep du motif — pas une lecture de code seule. Un finding non vérifié
coûte plus cher qu'un finding manquant.

Tier de test attendu avant PR : **T2** (`npm run test:premerge`). Grille : `/test-tiers`.
