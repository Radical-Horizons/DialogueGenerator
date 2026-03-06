# AGENTS.md

This file provides instructions for AI agents working on the DialogueGenerator codebase.

## Project Overview

DialogueGenerator is a tool for generating AI-driven RPG dialogue. It takes Game Design Document (GDD) data and LLM output to produce Unity-compatible JSON dialogue nodes. The architecture is a React frontend + FastAPI backend with reusable Python services.

## Tech Stack

- **Backend**: Python 3.11, FastAPI, Pydantic v2, uvicorn
- **Frontend**: React 18, TypeScript 5, Vite 4, Zustand, React Router 6, ReactFlow, TanStack Query
- **LLM**: OpenAI SDK (gpt-5.2 default), Mistral SDK (multi-provider)
- **Testing**: pytest (backend), Vitest + React Testing Library (frontend), Playwright (E2E)
- **CI**: GitHub Actions — pytest + Vitest on PRs to `main`

## Repository Structure

```
api/              # FastAPI backend (routers, schemas, services, middleware, container)
core/             # Business logic modules (context, prompt, llm)
services/         # Reusable application services (generation, validation, rendering)
frontend/         # React + TypeScript frontend (Vite, Zustand, ReactFlow)
models/           # Pydantic data models (dialogue_structure, prompt_structure)
config/           # JSON config files (llm, prompts, scene instructions, author profiles)
data/             # GDD data (GDD_categories/), logs, interactions, llm_usage
tests/            # All pytest tests (api/, services/, core/, integration/)
e2e/              # Playwright E2E specs
scripts/          # Dev/deploy scripts (Node.js, PowerShell, Python, Shell)
docs/             # Project documentation
```

## Setup

```bash
npm run setup         # Create venv + install all dependencies
npm run verify:venv   # Verify venv is correctly configured
```

On Linux/CI without PowerShell, set up manually:

```bash
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
cd frontend && npm install
```

Required environment variables (copy `.env.example` to `.env`):
- `OPENAI_API_KEY` — required for LLM generation
- `JWT_SECRET_KEY` — required (use a strong random value in production)
- `ENVIRONMENT` — `development` or `production`

## Running the Application

```bash
npm run dev           # Start backend (port 4243) + frontend (port 3000)
npm run dev:back      # Backend only
npm run dev:front     # Frontend only
```

## Testing

### Backend (pytest)

```bash
# All tests
pytest tests/ -v --tb=short

# Specific test directories
pytest tests/api/ -v
pytest tests/services/ -v
pytest tests/core/ -v

# By marker
pytest -m unit
pytest -m integration
pytest -m api
pytest -m service
```

Configuration: `pytest.ini` — pythonpath is `.`, asyncio_mode is `auto`.

Test markers: `unit`, `integration`, `slow`, `api`, `service`.

Key fixtures (in `tests/conftest.py`):
- `client` — FastAPI `TestClient` instance
- `disable_rate_limiting` — auto-applied, disables rate limiting via env var
- `setup_service_container` — auto-applied, initializes `ServiceContainer` in `app.state`

### Frontend (Vitest)

```bash
cd frontend
npm run test -- --run    # Single run (CI mode)
npm run test             # Watch mode
npm run test:coverage    # With coverage
```

### E2E (Playwright)

```bash
npx playwright test                    # All E2E specs
npx playwright test e2e/auth.spec.ts   # Specific spec
```

Playwright config: `playwright.config.ts` — testDir `./e2e`, baseURL `http://localhost:3000`, chromium only.

### CI

GitHub Actions (`.github/workflows/ci.yml`) runs on PRs and pushes to `main`:
- **Backend job**: Python 3.11, `pip install -r requirements.txt`, `pytest tests/ -v --tb=short`
- **Frontend job**: Node 20, `npm ci` in `frontend/`, `npm run test -- --run`

Ensure both pytest and Vitest pass before considering a change complete.

## Architecture

### Dependency Injection

The backend uses `api/container.py` (`ServiceContainer`) for dependency management. The container is initialized in `app.state` at API startup (`api/main.py` lifespan). All FastAPI dependencies use `api/dependencies.py` which accesses the container via `request.app.state.container`.

### Import Conventions

Use imports from `core/` submodules:
```python
from core.context.context_builder import ContextBuilder
from core.prompt.prompt_engine import PromptEngine
from core.llm.llm_client import LLMClient
```

Root-level files (`context_builder.py`, `prompt_engine.py`, `llm_client.py`) are deprecated compatibility wrappers.

### Configuration

Use `services.configuration_service.ConfigurationService` exclusively. Do not use the root-level `config_manager.py` (deprecated).

### Frontend State Management

- **Zustand** stores in `frontend/src/store/` (auth, graph, generation, vocabulary, preset)
- **React Query** (`@tanstack/react-query`) for server state
- **Axios** client in `frontend/src/api/` with per-domain API modules
- **React Hook Form** + **Zod** for form validation

### API Structure

FastAPI routers under `api/routers/` expose endpoints at `/api/v1/`. Key routers: auth, dialogues, context, config, graph, streaming, unity_dialogues, presets, costs.

Schemas are in `api/schemas/`, middleware in `api/middleware/`.

## Coding Conventions

### Python
- Full type annotations + PEP 257 docstrings on all functions, methods, and classes
- No silent `except Exception` — use meaningful error messages + contextual logging
- No hardcoded secrets — use environment variables and config files
- Use `pathlib.Path` for file paths, `utf-8` encoding explicitly
- Preserve existing comments; do not remove them

### TypeScript/React
- TypeScript strict mode
- Types in `frontend/src/types/`
- Components organized by feature in `frontend/src/components/`
- ESLint with `@typescript-eslint` rules

### GDD Data Paths

- Category files: `data/GDD_categories/` (manually maintained folder)
- Vision file: `data/Vision.json`
- Configurable via `GDD_IMPORT_PATH` env var

## Key Files

| File | Purpose |
|------|---------|
| `api/main.py` | FastAPI app entry point, lifespan, CORS, middleware |
| `api/container.py` | ServiceContainer — dependency injection |
| `api/dependencies.py` | FastAPI dependency injection helpers |
| `core/context/context_builder.py` | GDD context construction |
| `core/prompt/prompt_engine.py` | LLM prompt construction |
| `core/llm/llm_client.py` | LLM client interface + implementations |
| `services/dialogue_generation_service.py` | Main dialogue generation logic |
| `services/configuration_service.py` | Centralized configuration management |
| `frontend/src/api/client.ts` | Axios HTTP client setup |
| `frontend/src/store/` | Zustand state stores |
| `tests/conftest.py` | Global pytest fixtures |
| `app_config.json` | Default LLM model, temperature, token limits |
| `config/llm_config.json` | LLM provider configuration |
| `.env.example` | Environment variable template |
