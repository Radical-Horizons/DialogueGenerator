# AGENTS.md

## Cursor Cloud specific instructions

### Overview

DialogueGenerator is a React + FastAPI app for generating RPG dialogues via LLMs. No database or Docker required — all data is file-based (JSON in `data/`).

### Services

| Service | Port | Start command |
|---------|------|---------------|
| FastAPI backend | 4243 | `.venv/bin/python -m api.main` (with `API_PORT=4243 RELOAD=true`) |
| Vite frontend | 3000 | `cd frontend && npx vite --host 0.0.0.0 --port 3000` |

Both can be started together with `npm run dev` (uses `node scripts/dev.js`).

### Non-obvious caveats

- **`python` symlink required on Linux**: The dev scripts (`scripts/dev.js`) check for `python` in PATH. On Linux, create a symlink: `sudo ln -sf /usr/bin/python3 /usr/local/bin/python`.
- **`python3-venv` system package required**: On Ubuntu/Debian, install `python3.12-venv` before creating the venv.
- **`.env` file**: Copy from `.env.example`. Required for JWT auth and config. Default dev credentials: `admin` / `admin123`.
- **No real LLM key needed for basic dev**: Without `OPENAI_API_KEY`, the backend uses `DummyLLMClient` (mock responses). Set a real key for actual dialogue generation.
- **Frontend ESLint**: Has 7 pre-existing lint errors (unused vars). This is a known state.
- **Frontend Vitest**: Has 4 pre-existing test failures in `SelectedContextSummary.test.tsx`. This is a known state.
- **Windows-first codebase**: Many npm scripts use PowerShell (`scripts/*.ps1`). On Linux, use the Node.js equivalents directly (e.g., `node scripts/dev.js`, `node scripts/getPythonPath.js -m pytest tests/`).

### Commands reference

See `.cursor/rules/workflow.mdc` for the full command reference. Key commands:

- **Backend tests**: `.venv/bin/python -m pytest tests/ -x --tb=short`
- **Frontend lint**: `cd frontend && npx eslint . --ext ts,tsx`
- **Frontend tests**: `cd frontend && npx vitest run`
- **Start dev**: `npm run dev` or start backend/frontend separately as shown above
