---
project_name: 'DialogueGenerator'
user_name: 'Véronique'
date: '2026-03-04'
sections_completed: ['technology_stack', 'language_rules', 'framework_rules', 'testing_rules', 'code_quality', 'workflow_rules', 'dont_miss_rules']
existing_patterns_found: 12
---

# Project Context for AI Agents

_This file contains critical rules and patterns that AI agents must follow when implementing code in this project. Focus on unobvious details that agents might otherwise miss._

**Documentation — hiérarchie :** Décisions récentes, ADRs canoniques, épics/stories et suivi d’implémentation → **`_bmad-output/`**. Guides, specs techniques, architecture détaillée, troubleshooting → **`docs/`**. Entrée rapide → **`README.md`** / **`README_API.md`**.

---

## Technology Stack & Versions

- **Backend:** Python 3.10+, FastAPI 0.104+, Pydantic 2.0+, Uvicorn 0.24+, OpenAI 1.15+, Mistral AI 1.10+, Tiktoken 0.4+, Jinja2 3.0+, pytest 7+, pytest-asyncio, pytest-cov, pytest-mock. Auth: python-jose 3.3+, passlib/bcrypt, slowapi. Observability: Prometheus instrumentator 6.0+, Sentry 1.32+, Tenacity 8.2+, PyBreaker 1.0+, cachetools 5.3+, httpx 0.25+.
- **Frontend:** React 18.2, TypeScript 5.2, Vite 4.4, Zustand 4.4, TanStack React Query 5.90, React Hook Form 7.69, Zod 4.2, Axios 1.6, ReactFlow 11.11, Vitest 4.0.16, Playwright 1.57, ESLint 8.45.
- **Contraintes:** Pas de pyproject.toml (requirements.txt). Frontend en ESM (`"type": "module"`). Pas de secret en dur : `.env` + `config/*.json`.

---

## Critical Implementation Rules

### Language-Specific Rules

- **Python:** Imports obligatoires : `from core.context.context_builder import ...`, `from core.prompt.prompt_engine import ...`, `from core.llm.llm_client import ...` (jamais `context_builder`, `prompt_engine`, `llm_client` en racine — test `test_no_deprecated_imports`). Configuration via `ConfigurationService` uniquement (pas `config_manager` racine). Annotations de types + docstrings PEP257. Pas de `except Exception` silencieux ; logging contextualisé. Windows-first : `pathlib.Path`, UTF-8.
- **TypeScript:** Types alignés sur schémas backend Pydantic (`frontend/src/types/api.ts`). ESLint max-warnings 0 ; pas de désactivation non justifiée.

### Framework-Specific Rules

- **FastAPI:** Routers dans `api/routers/`, schemas dans `api/schemas/`, logique métier dans `services/`. Injection via `api/container.py` (ServiceContainer) et `api/dependencies.py` — pas de singletons globaux. Versioning `/api/v1/`. Exceptions via `api/exceptions.py`, handler global.
- **React:** Logique dans `frontend/src/` — composants (`components/`), store Zustand (`store/`), client API par domaine (`api/*.ts`). Pas de logique métier dans le frontend ; tout passe par l’API REST. Routes protégées avec `ProtectedRoute`, JWT en localStorage, refresh via intercepteur axios.

### Testing Rules

- **Backend:** pytest uniquement (pytest-asyncio, pytest-mock). Structure miroir : `tests/api/`, `tests/services/`, `tests/utils/`. Fixtures dans `tests/conftest.py`. `@pytest.mark.asyncio` obligatoire pour async. Toujours mocker OpenAI, GDD, env. **Interdit** : tests hardcodés sur entités GDD spécifiques (personnages, lieux) ; utiliser données génériques ou fixtures.
- **Frontend:** Vitest + React Testing Library ; E2E Playwright. Mocks pour client API.
- **Règle globale:** Tous les tests existants doivent rester verts ; red-green-refactor.

### Code Quality & Style Rules

- **Organisation:** Conserver `core/`, `domain/`, `services/`, `ui/`, `models/`, `api/`. Réutiliser les services, pas dupliquer. GDD : `data/GDD_categories/` (dossier réel, maintenance manuelle — voir `docs/deployment/DATA_MAINTENANCE.md`). Variables d’env : `GDD_CATEGORIES_PATH`, `GDD_IMPORT_PATH`. Logs : `data/logs/` (archivage automatique).
- **Champs GDD:** Métadonnées = champs avant "Introduction" ; contexte narratif = "Introduction" et après. Champs essentiels définis dans `context_organizer` (ESSENTIAL_*). Voir `.cursor/rules/field_classification.mdc`.
- **Documentation:** Ne pas supprimer les commentaires existants. Docstrings sur fonctions/méthodes/classes modifiées ou ajoutées.

### Development Workflow Rules

- **Dev:** `npm run dev` (racine) ou `python -m api.main` (API seule), `cd frontend && npm run dev` (frontend seule). Cache Vite : `npm run dev:clean` si changements non visibles.
- **Tests:** `npm run test` (pytest), `npm run test:frontend` (Vitest), `npm run test:e2e` (Playwright). Vérification venv : `npm run verify:venv` ; setup : `npm run setup`.
- **Références:** `README_API.md`, `_bmad-output/` (planning + ADRs), `docs/` (technique), `.cursor/rules/*.mdc` (backend_api, frontend, logging, tests, gdd_paths, field_classification).

### Critical Don't-Miss Rules

- **Ne jamais** : mettre de secrets en dur ; utiliser `config_manager.py` racine ; créer des singletons globaux pour les services ; écrire des tests dépendant de personnages/lieux GDD réels ; ignorer les types ou les docstrings sur le code touché.
- **Toujours** : utiliser `ConfigurationService` pour la config ; passer par `ServiceContainer` / `api/dependencies.py` pour l’injection ; mocker LLM et I/O dans les tests ; garder la logique métier dans `services/` (pas dans les routers ni le frontend).
- **Sécurité:** CORS configuré, validation des entrées, pas de secrets dans logs ou réponses. En prod : HTTPS, cache HTTP activé (TTL configurable).

### Domain-Specific & Unobvious Rules (recherche complémentaire)

- **Imports dépréciés (régression):** Ne jamais réintroduire `from context_builder import`, `from prompt_engine import`, `from llm_client import` ni `import context_builder` / `prompt_engine` / `llm_client`. Utiliser `core.context.context_builder`, `core.prompt.prompt_engine`, `core.llm.llm_client`. Le test `tests/test_no_deprecated_imports.py` échoue si un fichier .py (hors wrappers racine) utilise ces patterns. Fichiers racine `context_builder.py`, `config_manager.py`, `prompt_engine.py` = wrappers de compatibilité uniquement.
- **Configuration:** Nouveau code → `ConfigurationService` (injecté via `Depends(get_config_service)` ou `container.get_config_service()`). En interne, `core/context/context_builder.py` et `services/context_builder_factory.py` utilisent encore `get_config_manager()` pour chemins GDD — legacy, ne pas étendre.
- **Documents vs Unity dialogues:** `/api/v1/documents` = documents canoniques (GET/PUT par id avec revision). Ne pas accepter nodes/edges sur PUT document ; ne jamais reconstruire le document à partir du graphe. Source de vérité = document. `/api/v1/unity-dialogues` = list/read par filename (espace existant). Validateur : `api/utils/unity_schema_validator.py` — `validate_unity_json_structured()`.
- **Unity JSON (v1.1.0):** Format document = `{ schemaVersion, nodes }`. Export/serialisation : `json.dumps(..., ensure_ascii=False)` pour préserver caractères non-ASCII. Ne pas casser `choiceId`, ordre de `choices[]`, `node.id` lors de normalisations ou validations.
- **LLM / OpenAI:** Modèles GPT-5 (`gpt-5.2`, `gpt-5.2-pro`, `gpt-5-mini`, `gpt-5-nano`) utilisent **Responses API** uniquement (`client.responses.create`), pas Chat Completions. Voir `.cursor/rules/llm.mdc` et `docs/architecture/OPENAI_API_GPT5.md`.
- **Structured Output (prompts):** Ne pas inclure dans le prompt d’instructions redondantes avec le schéma (ex. "ne génère pas d’IDs") ; inclure uniquement la logique métier et les formats spécifiques. Référence `docs/prompts/STRUCTURED_OUTPUT_EXPLANATION.md` et `.cursor/rules/structured_output.mdc`.
- **Frontend TestNode / graphe:** Source de vérité = choix parent (JSON Unity). TestNodes = vues dérivées ; sync via `frontend/src/utils/testNodeSync.ts`. Ne pas exporter les TestNodes ; seuls les champs `test` / `test*Node` dans les choix sont exportés. Référence `.cursor/rules/testnode_sync.mdc`.
- **Tests API:** Mocker `ConfigurationService` via `app.dependency_overrides[get_config_service] = lambda: mock_service` ou fixture avec `Depends` override ; voir `tests/api/test_config_field_validation.py`, `tests/api/test_documents.py`.

---

## Usage Guidelines

**For AI Agents:**

- Lire ce fichier avant d’implémenter du code.
- Suivre toutes les règles documentées ; en cas de conflit avec une story, les exigences de la story priment.
- En cas de doute, privilégier l’option la plus stricte.
- Mettre à jour ce fichier si de nouveaux patterns émergent (après validation).
