# CI (GitHub Actions)

La CI est déclenchée sur **pull request** vers `main` ou `dev`, et sur **push** vers `main`.

## Workflow

- **Fichier** : `.github/workflows/ci.yml`
- **Jobs** :
  - **Backend** : Python 3.11, `pip install -r requirements.txt`, pytest
  - **Frontend** : Node 24, `npm ci` (dans `frontend/`), Vitest
  - **PWA** : Playwright smoke installabilité (`npm run test:e2e:pwa`) — build Vite + preview

## Tiers de tests (T2 vs T3)

| Événement | Backend | Frontend |
|-----------|---------|----------|
| `pull_request` (T2) | `pytest tests/ -m "not slow"` | `npx vitest run --max-workers=2` |
| `push` sur `main` (T3) | `pytest tests/` (suite complète) | `VITEST_FULL=1 npx vitest run --max-workers=2` |

Référence détaillée : `.cursor/commands/test-tiers.md`.

## Health check

Le endpoint `/health` est couvert par les tests API (`tests/api/test_health.py` et `tests/api/test_health_check.py`). Aucune étape dédiée « health » en CI.

## Variables d'environnement en CI

Des valeurs factices sont utilisées pour que les tests passent sans secrets :

- `ENVIRONMENT=development`
- `JWT_SECRET_KEY=ci-dummy-secret`
- `OPENAI_API_KEY=sk-dummy`
- `PROMETHEUS_ENABLED=false` (backend — évite les conflits de port métriques en tests)

Pas de secrets GitHub requis pour cette CI.

## Dépendances épinglées

`requirements.txt` épingle `starlette<0.52` pour compatibilité `TestClient` / FastAPI. Ne pas monter Starlette sans vérifier la suite pytest API.

## Checklist PR graphe

Pour les PR touchant l'éditeur de graphe, voir [PR checklist graph](../../pr-checklist-graph.md). En local : `npm run check:migration` (nécessite l'API démarrée) pour lister les documents v1.1.0 sans choiceId.
