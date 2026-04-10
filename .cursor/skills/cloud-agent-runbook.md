---
name: cloud-agent-runbook
description: Minimal run and test guide for Cloud agents — setup, auth, env toggles, and area-specific test commands (backend, frontend, E2E).
---

# Cloud agent runbook (DialogueGenerator)

Use this skill when you need to **run the app**, **log in**, **toggle dev behavior via environment**, or **execute the right tests** without rereading the whole repo.

## First-time setup

1. **Copy env**: `.env` is gitignored. From repo root: copy `.env.example` → `.env`. Cloud sandboxes often ship a pre-filled `.env`; if missing, create it from the example.
2. **Install**: `npm run install:all` runs the Windows venv script; on Linux Cloud agents where PowerShell is absent, do the equivalent:
   - Create venv: `python3 -m venv .venv` then `".venv/bin/pip" install -r requirements.txt` (or follow `README.md` / `npm run setup` if PowerShell is available).
   - Frontend deps: `npm --prefix frontend install`
3. **Python on PATH**: Dev scripts expect `python` in PATH. On Linux: `sudo ln -sf "$(command -v python3)" /usr/local/bin/python` if `python` is missing.
4. **LLM key**: Not required for many flows. Without `OPENAI_API_KEY`, the backend uses **`DummyLLMClient`** (mock generation). Set a real key only when testing real LLM calls or certain E2E specs.

## Auth and login (UI)

- **Default dev credentials** (documented in `AGENTS.md`): username `admin`, password `admin123`.
- **JWT vs no JWT**: With `DISABLE_AUTH=true` (default in `.env.example`), the API uses a mock user; the UI still may show a login screen for flows that exercise auth — use the defaults above when the app expects credentials.
- **Strict JWT locally**: Set `DISABLE_AUTH=false` in `.env`, restart API, then obtain a token via `/login` as documented in API docs (`README_API.md`). Playwright’s default `webServer` env forces `DISABLE_AUTH=true` for stable E2E; see `playwright.config.ts` comments if you need auth-strict E2E.

## Start the application

| Goal | Command | Notes |
|------|---------|--------|
| Full stack (typical) | `npm run dev` | Backend **4243**, frontend **3000** (`AGENTS.md`). |
| Faster API startup (dev only) | `npm run dev:fast` | Sets skip flags for startup validation/log cleanup; **not** for production. |
| Backend only | `npm run dev:back` or `npm run start:api` | API module `api.main`. |
| Frontend only | `npm run dev:front` | Vite; ensure API is up if you need data. |
| Health | Open `http://localhost:4243/health` | Optional `HEALTH_CHECK_LLM_PING` in `.env` controls LLM ping (can be slow). |

**Ports stuck / zombies**: `npm run dev:check` (add `--clean` to auto-clean). **Stop**: `npm run dev:stop`.

## Environment toggles (“feature flags”)

There is no separate feature-flag service; behavior is controlled by **environment variables** (see `.env.example`).

| Variable | Role |
|----------|------|
| `ENVIRONMENT` | `development` vs `production` (stricter config validation in prod). |
| `DISABLE_AUTH` | `true` = JWT bypass + mock user for local/dev and default tests. **`true` is forbidden when `ENVIRONMENT=production`.** |
| `AUTH_RATE_LIMIT_ENABLED` | Rate limit on auth routes; Playwright and `tests/conftest.py` disable this for stability. |
| `OPENAI_API_KEY` | Real LLM; omit or dummy → mock client for basic dev/tests. |
| `SKIP_STARTUP_CONTEXT_VALIDATION` / `SKIP_STARTUP_LOG_CLEANUP` | Faster startup (also triggered by `npm run dev:fast`). |
| `GDD_CACHE_ENABLED`, `GDD_DISK_CACHE`, HTTP cache vars | GDD / HTTP caching; useful if debugging stale context. |
| `LOG_LEVEL`, `LOG_FORMAT` | Logging verbosity and JSON vs text. |
| `VITE_API_BASE_URL` | Frontend→API base; Playwright forces empty string so Vite proxies `/api` to **4243** (see `playwright.config.ts`). |

**Tests**: Prefer `monkeypatch.setenv` / `patch.dict(os.environ, ...)` in pytest, or Playwright’s `webServer.env`, instead of committing secrets or relying on a shared machine `.env`.

---

## By codebase area

### Root / tooling

- **Verify venv**: `npm run verify:venv` (PowerShell on Windows; on Linux use `node scripts/getPythonPath.js` success as a smoke check).
- **Config snapshot** (debug): `npm run config:snapshot`.
- **Version sync** (if you touch version fields): `npm run version:sync` / `npm run verify:app-version`.

### Backend (`api/`, `services/`, `core/`, `tests/`)

- **Run all backend tests**: `npm test` or `node scripts/getPythonPath.js -m pytest tests/`.
- **API tests only** (FastAPI `TestClient`, no running server): `npm run test:api` or `pytest tests/api/`.
- **Targeted**: `node scripts/getPythonPath.js -m pytest tests/path/test_file.py -k "pattern" --tb=short`.
- **Fixtures note**: `tests/conftest.py` sets `DISABLE_AUTH=true` and `AUTH_RATE_LIMIT_ENABLED=false` by default so suites stay stable.

### Frontend (`frontend/`)

- **Lint** (baseline must stay clean): `npm --prefix frontend run lint`.
- **Unit tests (Vitest) — agents**: **Always scope** the run; do not run the full suite unless the user asks.
  - Single file: `cd frontend && npx vitest run src/path/Component.test.tsx --reporter=dot`
  - After edits: `npm run test:frontend:quick` (from repo root) or `cd frontend && npm run test:quick`
- **CI-style JSON report**: `npm run test:frontend:vitest` → `tmp/vitest-report.json`; summary helper `npm run test:frontend:vitest:summary`.
- **Full frontend gate** (slower): `npm run test:frontend` (PowerShell script on Windows; on Linux run lint + targeted Vitest + `npm --prefix frontend run build` as needed).

### End-to-end (`e2e/`, Playwright)

- **Default**: `npm run test:e2e` — starts API + Vite via `playwright.config.ts` unless `reuseExistingServer` reuses existing processes (non-CI).
- **Reliable full run in CI/agent mode**: `npm run test:e2e:verify` sets `CI=true` so Playwright **always** spawns fresh servers (avoids stale `:3000` / `ERR_CONNECTION_REFUSED`).
- **Focused suites**: e.g. `npm run test:e2e:cost`, `npm run test:e2e:llm` (see root `package.json`).
- **Parallel many specs**: split by file across tasks; do not give every worker the entire suite without sharding (see `.cursor/commands/playwright-e2e-parallel.md`).

### Logs and debugging

- **Archived logs**: `data/logs/logs_YYYY-MM-DD.json` (see `.cursor/rules/logging.mdc`).
- **UI changes**: Starting the app and checking the browser is the expected proof for visual/UX work (`workflow.mdc` — Preuve UI).

---

## How to update this skill

When you discover a **new command**, **env variable**, **port**, **test trick**, or **Cloud/Linux workaround**:

1. Add it **under the matching codebase area** above (or extend the env table if it is global).
2. Keep entries **command-oriented** (copy-pasteable lines).
3. If the knowledge belongs to the whole team long-term, also mirror it in **`AGENTS.md`** or **`.cursor/rules/workflow.mdc`** when appropriate; this skill should stay a **short** Cloud-oriented digest, not a duplicate of every doc.
