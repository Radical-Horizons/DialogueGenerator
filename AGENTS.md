# AGENTS.md — DialogueGenerator

AI dialogue generation tool for RPGs: LLM + GDD → JSON Unity.

## Architecture

```
Frontend React (frontend/) ↔ API REST FastAPI (api/) ↔ Services (services/) ↔ LLM / GDD / Storage
```

### Directory Layout

| Directory | Purpose |
|-----------|---------|
| `api/` | FastAPI backend — routers, schemas (Pydantic), middleware, DI container |
| `core/` | Business logic — `context/` (GDD builder), `prompt/` (prompt engine), `llm/` (OpenAI/Mistral clients) |
| `services/` | Reusable services — generation, rendering, configuration, context processing, repositories |
| `frontend/` | React + TypeScript + Vite SPA — components, Zustand stores, API client, hooks |
| `models/` | Pydantic domain models — dialogue structures, LLM usage |
| `config/` | Configuration files — LLM config, system prompts, scene instructions, author profiles |
| `data/` | Runtime data — `GDD_categories/`, `interactions/`, `presets/`, `logs/` |
| `tests/` | pytest test suite — mirrors source structure |
| `e2e/` | Playwright E2E tests |
| `scripts/` | Dev/build/deploy scripts (Node.js + PowerShell + Python) |
| `docs/` | Structured documentation with `docs/index.md` as entry point |
| `.cursor/rules/` | Cursor rules (`.mdc` files) — project conventions per domain |

### Key Patterns

- **Dependency injection**: `api/container.py` (`ServiceContainer`) initialized in `app.state`. All FastAPI deps via `api/dependencies.py`.
- **No singletons**: Use the DI container, not global state.
- **Service reuse**: Business logic lives in `services/`, consumed by both the API and tests. Never duplicate logic in routers.
- **Routers are thin**: HTTP handling only. Delegate to services.
- **Configuration**: Use `services.configuration_service.ConfigurationService` (not the deprecated root `config_manager.py`).
- **Imports**: Prefer `from core.context.context_builder import ContextBuilder` over deprecated root-level wrappers.
- **Root wrappers** (`context_builder.py`, `prompt_engine.py`, `llm_client.py` at root): Compatibility shims, will be removed in v2.0.

## Setup

```bash
npm run setup          # Create venv + install all Python/Node deps
cp .env.example .env   # Then set OPENAI_API_KEY, JWT_SECRET_KEY
npm run dev            # Launch backend (port 4243) + frontend (port 3000)
```

### Environment

- **Python 3.10+**, venv in `.venv/`. All npm scripts auto-detect the venv.
- **Node.js 20+**, frontend deps in `frontend/node_modules/`.
- **`.env`** at project root (gitignored). See `.env.example` for all variables.
- Required env vars: `OPENAI_API_KEY`, `JWT_SECRET_KEY`, `ENVIRONMENT`.

### Useful Commands

| Command | What it does |
|---------|-------------|
| `npm run dev` | Start backend + frontend (dev mode) |
| `npm run dev:clean` | Dev with Vite cache cleared |
| `npm run dev:check` | Diagnose zombie processes / blocked ports |
| `npm run dev:stop` | Stop all services |
| `npm test` | Run all backend tests (pytest) |
| `npm run test:api` | Run API tests only |
| `npm run test:frontend` | Build + lint + unit tests (frontend) |
| `npm run test:e2e` | Playwright E2E (requires running servers) |
| `npm run test:all` | Backend + frontend tests |
| `npm run verify:venv` | Verify venv health |

## Testing

### Backend (pytest)

- **Framework**: pytest + pytest-asyncio + pytest-mock. No `unittest`.
- **Config**: `pytest.ini` — `asyncio_mode = auto`, `testpaths = tests`.
- **Structure**: `tests/` mirrors source layout (`tests/api/`, `tests/services/`, `tests/models/`, `tests/utils/`, `tests/middleware/`, `tests/integration/`).
- **Naming**: `test_<module>.py`, functions `test_<scenario>`, classes `Test<Class>`.
- **Fixtures**: Global fixtures in `tests/conftest.py` (TestClient, ServiceContainer).
- **Markers**: `@pytest.mark.asyncio`, `@pytest.mark.unit`, `@pytest.mark.integration`, `@pytest.mark.api`, `@pytest.mark.slow`.
- **Mocking**: Always mock LLM calls, file I/O, network. Use `pytest-mock` / `AsyncMock`.
- **No hardcoded GDD entities**: Never test against specific character/location names. Use dynamic selection (`items[0]`).

```bash
pytest tests/ -v --tb=short       # All tests
pytest tests/api/ -v              # API only
pytest tests/services/ -v         # Services only
pytest tests/ -k "not api"        # Unit tests only
pytest tests/ --cov=api --cov=services --cov-report=html  # With coverage
```

### Frontend (Vitest + React Testing Library)

- **Unit tests**: `frontend/src/**/*.test.ts(x)`.
- **Run**: `cd frontend && npm test -- --run` or `npm run test:frontend` from root.
- **Mocking**: Mock API client for component tests.

### E2E (Playwright)

- **Specs**: `e2e/*.spec.ts`.
- **Requires**: Running servers (`npm run dev`) + `.env` with `OPENAI_API_KEY` for LLM-dependent specs.
- **Run**: `npm run test:e2e`.

### CI

GitHub Actions (`.github/workflows/ci.yml`): runs on PRs to `main` and pushes to `main`.
- **Backend job**: Python 3.11, `pytest tests/ -v --tb=short`.
- **Frontend job**: Node 20, `npm run test -- --run` in `frontend/`.

## Code Conventions

### Python

- **Type annotations**: Complete type hints on all functions, methods, classes.
- **Docstrings**: PEP 257 on all public functions/methods/classes.
- **Error handling**: Meaningful messages + contextual logging. No silent `except Exception`.
- **Paths**: Use `pathlib.Path`. Assume Windows-first (UTF-8 encoding, no POSIX assumptions).
- **Secrets**: Never hardcode. Use env vars and config files (`config/*.json`).
- **Logging**: Structured logs archived to `data/logs/`. See `api/utils/log_file_handler.py`.

### TypeScript / React

- **State management**: Zustand stores in `frontend/src/store/`.
- **API client**: Axios-based in `frontend/src/api/client.ts` with interceptors.
- **Types**: `frontend/src/types/api.ts` aligned with backend Pydantic schemas.
- **Components**: Modular structure under `frontend/src/components/` (layout, auth, context, generation, graph, shared).
- **Routing**: React Router with protected routes.
- **Auth**: JWT in localStorage, auto-refresh via axios interceptor.

### API

- **Versioning**: All endpoints under `/api/v1/`.
- **Auth**: JWT — `POST /api/v1/auth/login` to get tokens. Default dev credentials: `admin` / `admin123`.
- **Docs**: Swagger at `/api/docs`, ReDoc at `/api/redoc` (auto-generated by FastAPI).
- **Validation**: Pydantic schemas in `api/schemas/`. Double validation (API + business layer).
- **Error handling**: Centralized in `api/exceptions.py` with global handler.

## Data

- **GDD files**: JSON files in `data/GDD_categories/` (manually maintained). Vision data in `data/Vision.json`.
- **Interactions**: Generated dialogues stored as JSON in `data/interactions/`.
- **Presets**: Saved generation presets in `data/presets/`.
- **Logs**: Archived in `data/logs/logs_YYYY-MM-DD.json` (auto-rotated, 30-day retention).
- **Config files**: `config/llm_config.json`, `config/system_prompts.json`, `config/llm_pricing.json`, etc.

## Documentation

- **Primary**: `README.md` (overview), `README_API.md` (API reference).
- **Structured docs**: `docs/` with index at `docs/index.md`.
- **Latest artifacts**: `_bmad-output/planning-artifacts/` and `_bmad-output/implementation-artifacts/` may contain more recent documentation than `docs/`.
- **Cursor rules**: `.cursor/rules/*.mdc` — one rule per domain, concise, maintained.
