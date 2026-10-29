# CI (GitHub Actions)

La CI est déclenchée sur **pull request** vers `main` ou `dev`, sur **push** vers `main`, et via **`workflow_dispatch`** (relais explicite — voir ci-dessous).

## Workflow

- **Fichier** : `.github/workflows/ci.yml`
- **Jobs** :
  - **Frontend lint (ESLint)** : Node 24, `npm ci` puis `npm run lint` — baseline **zéro erreur**
  - **Backend** : Python 3.11, `pip install -r requirements.txt`, pytest
  - **Frontend** : Node 24, `npm ci` puis Vitest
  - **PWA** : build Vite + smoke Playwright (`npm run test:e2e:pwa`)

## Tiers de tests (T2 / T3)

| Événement | Backend | Frontend |
|-----------|---------|----------|
| **PR** (tier T2) | `pytest tests/ -m "not slow"` | `npx vitest run` (sans `VITEST_FULL`) |
| **Push main** (tier T3) | `pytest tests/` (suite complète) | `VITEST_FULL=1 npx vitest run` |

Référence locale : `.claude/commands/test-tiers.md`, `npm run test:premerge` (T2).

Les steps de test sont conditionnés par `github.event_name != 'push'` pour le tier T2 (pas uniquement `pull_request`), afin que les runs relancés via `workflow_dispatch` exécutent bien les tests.

## Concurrence

```yaml
concurrency:
  group: ci-${{ github.event.pull_request.number || github.ref }}
  cancel-in-progress: ${{ github.event_name == 'pull_request' }}
```

Sur une PR, seul le **dernier push** est conservé (runs précédents annulés). Sur `main`, aucune annulation — la suite T3 est la porte de release.

## Relais `workflow_dispatch`

Un push effectué avec `GITHUB_TOKEN` (ex. merge automatique `main` dans une PR, ou `pr-merge-main-prefer-head-data.yml`) **ne déclenche pas** de nouveau workflow. Les workflows concernés relancent explicitement la CI :

```bash
gh workflow run ci.yml --ref <branche>
```

Ne pas retirer le déclencheur `workflow_dispatch` de `ci.yml` ni ces relais — sinon le commit réellement mergé ne serait jamais testé.

## `paths-ignore` et PR doc-only

La CI est **ignorée** quand une PR ne modifie **que** :

- `data/GDD_categories/**`, `data/Vision.json`
- `docs/**`
- `*.md` à la racine (pas `**/*.md` — évite d’ignorer `.claude/**/*.md`)

Une PR mixte code + doc lance bien la CI. **Attention** : si `Backend (pytest)`, `Frontend (Vitest)` et `Frontend lint (ESLint)` sont des checks requis en protection de branche, une PR **uniquement** documentation reste bloquée en « Waiting for status ».

## Autres workflows PR

| Workflow | Déclencheur | Rôle |
|----------|-------------|------|
| `pr-merge-main-prefer-head-data.yml` | Push sur PR vers `main` | Merge `main`, arbitre conflits `data/` en faveur de la PR, relance CI |
| `pr-diff-gdd-split.yml` | Ouverture / push PR | Commente le diff séparé GDD vs code |

Détails et invariants : `.claude/rules/github_automation.md`.

## Variables d'environnement en CI

Valeurs factices pour exécuter les tests sans secrets :

- `ENVIRONMENT=development`
- `JWT_SECRET_KEY=ci-dummy-secret`
- `OPENAI_API_KEY=sk-dummy` (littéral factice — backend utilise `DummyLLMClient`)
- `PROMETHEUS_ENABLED=false` (backend — évite les conflits métriques en tests)

Pas de secrets GitHub requis pour cette CI. **Aucune clé API payante** (Anthropic, etc.) n’est consommée en CI.

## Dépendances épinglées (compat TestClient)

`requirements.txt` borne **Starlette** (`starlette>=0.40.0,<0.51.0`) et **FastAPI** (`<0.129.0`) pour rester compatible avec `starlette.testclient.TestClient` utilisé par pytest.

## Health check

Le endpoint `/health` est couvert par les tests API (`tests/api/test_health.py` et `tests/api/test_health_check.py`). Aucune étape dédiée « health » en CI.

## Checklist PR graphe

Pour les PR touchant l’éditeur de graphe, voir [PR checklist graph](../../pr-checklist-graph.md). En local : `npm run check:migration` (nécessite l’API démarrée) pour lister les documents v1.1.0 sans choiceId.
