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
- **Frontend Vitest**: All 537 tests pass as of last run. If a test suddenly fails, check whether it tests a feature that was silently removed rather than assuming the test is obsolete.
- **Windows-first codebase**: Many npm scripts use PowerShell (`scripts/*.ps1`). On Linux, use the Node.js equivalents directly (e.g., `node scripts/dev.js`, `node scripts/getPythonPath.js -m pytest tests/`).

### Commands reference

See `.cursor/rules/workflow.mdc` for the full command reference. Key commands:

- **Backend tests**: `.venv/bin/python -m pytest tests/ -x --tb=short`
- **Frontend lint**: `cd frontend && npx eslint . --ext ts,tsx`
- **Frontend tests**: `cd frontend && npx vitest run`
- **Start dev**: `npm run dev` or start backend/frontend separately as shown above

## Learned User Preferences

- Never delegate deterministic frontend behavior to the API or LLM; if the user has selected a choice and triggers AI generation, the parent→node connection is the front-end's responsibility, not an API suggestion.
- Require runtime log evidence before proposing bug fixes; never speculate from code alone.
- Prefer small, targeted SOLID/KISS fixes over accumulating defensive guards from multiple hypotheses; revert rejected-hypothesis code before pursuing new ones.
- Create regression unit tests for any non-trivial bug fix, especially in state management code.
- Do not add comments that narrate what code does; comments must explain non-obvious intent or constraints only.
- When a pre-existing test fails, verify whether the tested feature was silently removed before dismissing the test as obsolete; restore the feature if it still belongs in the UI.
- Large component refactors need two passes: first extract logic into hooks, then extract JSX blocks into dedicated child components.

## Learned Workspace Facts

- Use `mergeFormDataIntoNodeData()` instead of spread (`{ ...nodeData, ...formValues }`) when flushing `NodeEditorPanel` form state on selection change; the spread overwrites `choices[N].targetNode` written by `connectNodes`, breaking the edge connection.
- Node generation connection flow: API response → `connectNodes(parentId, newId, targetChoiceIndex, 'choice')` in `generationSlice` → `choices[N].targetNode` set in `edgeSlice` → `NodeEditorPanel` selection-change flush must preserve this field via `mergeFormDataIntoNodeData`.
- Frontend has 7 pre-existing ESLint errors (unused vars); these are known, do not treat as regressions.
- GraphEditor JSX is split into dedicated components in `frontend/src/components/graph/`: `GraphEditorHeader` (toolbar), `GraphValidationPanel` (overlay), `DialogueCostModal`, `GraphExportFormatDialog`. `GraphEditorHeader` calls `useGraphStore()` internally to avoid prop drilling.
- The `exportToUnity` store action (in `persistenceSlice`) serializes graph nodes to Unity JSON format; its trigger button lives in `GraphEditorHeader` and downloads a `.json` file named after `dialogueMetadata.filename`.
- The `continual-learning` skill uses **in-context conversation history only** — it never reads from `agent-transcripts/` files on disk (that folder does not exist on this system).
