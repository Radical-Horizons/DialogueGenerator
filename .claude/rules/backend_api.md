---
description: Backend API REST FastAPI — architecture, SOLID, RESTful, sécurité
globs: ["api/**/*.py", "backend/**/*.py", "server/**/*.py"]
alwaysApply: false
---

- **Architecture**: API REST FastAPI dans `api/`. La logique métier reste dans `services/` (réutilisable pour l'API web + tests). ⚠️ L'UI desktop PySide6 est dépréciée, utiliser l'interface web React.
- **Structure**: `api/routers/` (routes HTTP), `api/schemas/` (DTOs Pydantic), `api/services/` (adaptateurs), `api/dependencies.py` (injection).
- **SOLID**: Routers = routes uniquement, Services API = adaptation, Services métier = logique pure, Repositories = données.
- **RESTful**: Versioning `/api/v1/`, méthodes HTTP appropriées, codes de statut corrects, format de réponse standardisé.
- **Authentification**: JWT (python-jose), access token (15 min) + refresh token (7 jours), middleware d'auth.
- **Validation**: Pydantic pour schemas API, double validation (API + métier), messages d'erreur clairs.
- **Gestion d'erreurs**: Exceptions hiérarchisées (`api/exceptions.py`), handler global, logging structuré avec request_id. Voir `.claude/rules/logging.md` pour le système de logs complet (archivage, API de consultation).
- **Sécurité**: HTTPS en production, CORS configuré, validation inputs, pas de secrets dans logs/réponses. Les endpoints de debug/diagnostic doivent être gardés via une dépendance partagée et rester désactivés par défaut hors développement, sauf override explicite de configuration.
- **Cache HTTP**: Désactivé automatiquement en développement (middleware `DevNoCacheMiddleware`), activé en production avec TTL configurable. Voir `api/middleware/http_cache.py`.
- **Documentation**: OpenAPI/Swagger en dev (`/api/docs`, `/api/openapi.json`). Contrats détaillés : `docs/api/api-contracts-api.md`. **Invocation agents** : `.claude/skills/api-runbook/SKILL.md` + `scripts/Invoke-DialogueApi.ps1` (pas `README_API.md` seul — quickstart partiel).
- **Tests**: `tests/api/` avec pytest, tests unitaires routers + intégration API, mocks pour services externes.
- **Commande dev**: `npm run dev` (depuis racine, lance tout) ou `python -m api.main` (API seul).
- **Références**: `docs/api/api-contracts-api.md` (contrats), `.claude/skills/api-runbook/SKILL.md` (appels agents), `README_API.md` (quickstart humain).
