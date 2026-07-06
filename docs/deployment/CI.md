# CI (GitHub Actions)

La CI est déclenchée sur **pull request** vers `main` ou `dev`, et sur **push** vers `main`.

## Workflow

- **Fichier** : `.github/workflows/ci.yml`
- **Jobs** :
  - **Backend** : Python 3.11, `pip install -r requirements.txt`, pytest
  - **Frontend** : Node 24, `npm ci` puis Vitest
  - **PWA** : build Vite + smoke Playwright (`npm run test:e2e:pwa`)

## Tiers de tests (T2 / T3)

| Événement | Backend | Frontend |
|-----------|---------|----------|
| **PR** (tier T2) | `pytest tests/ -m "not slow"` | `npx vitest run` (sans `VITEST_FULL`) |
| **Push main** (tier T3) | `pytest tests/` (suite complète) | `VITEST_FULL=1 npx vitest run` |

Référence locale : `.cursor/commands/test-tiers.md`, `npm run test:premerge` (T2).

## Variables d'environnement en CI

Valeurs factices pour exécuter les tests sans secrets :

- `ENVIRONMENT=development`
- `JWT_SECRET_KEY=ci-dummy-secret`
- `OPENAI_API_KEY=sk-dummy`
- `PROMETHEUS_ENABLED=false` (backend — évite les conflits métriques en tests)

Pas de secrets GitHub requis pour cette CI.

## Dépendances épinglées (compat TestClient)

`requirements.txt` borne **Starlette** (`starlette>=0.40.0,<0.51.0`) et **FastAPI** (`<0.129.0`) pour rester compatible avec `starlette.testclient.TestClient` utilisé par pytest.

## Health check

Le endpoint `/health` est couvert par les tests API (`tests/api/test_health.py` et `tests/api/test_health_check.py`). Aucune étape dédiée « health » en CI.

## Checklist PR graphe

Pour les PR touchant l’éditeur de graphe, voir [PR checklist graph](../../pr-checklist-graph.md). En local : `npm run check:migration` (nécessite l’API démarrée) pour lister les documents v1.1.0 sans choiceId.
