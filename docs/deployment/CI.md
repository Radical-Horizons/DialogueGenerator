# CI (GitHub Actions)

La CI est déclenchée sur **pull request** et **push** vers `main`.

## Workflow

- **Fichier** : `.github/workflows/ci.yml`
- **Jobs** :
  - **Backend** : Python 3.11, `pip install -r requirements.txt`, `pytest tests/`
  - **Frontend** : Node 20, `npm ci` puis `npm run test -- --run` (Vitest)

## Health check

Le endpoint `/health` est couvert par les tests API (`tests/api/test_health.py` et `tests/api/test_health_check.py`). Aucune étape dédiée « health » en CI.

## Variables d'environnement en CI

Des valeurs factices sont utilisées pour que les tests passent sans secrets :

- `ENVIRONMENT=development`
- `JWT_SECRET_KEY=ci-dummy-secret`
- `OPENAI_API_KEY=sk-dummy`

Pas de secrets GitHub requis pour cette CI.
