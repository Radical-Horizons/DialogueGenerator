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

### Mandat d'agentivité

- **Priorité** : meilleur résultat produit et respect des processus du repo — pas l'auto-limitation sur tokens, nombre de subagents ou « scope minimal » au détriment d'une revue ou d'un diagnostic complets.
- **Budget** : l'utilisateur arbitre coût et durée ; l'agent ne raccourcit pas un flux documenté (ex. revue holistique) pour « économiser » sans instruction explicite.
- **Règle Cursor** : `.cursor/rules/agentivity.mdc` (`alwaysApply`) — à lire en cas de tension entre consignes.
- **Revues globales** : synonymes (*full review*, *entire codebase*, *holistic*) → **7 reviewers** en parallèle + synthèse ; voir section Subagents et la commande `.cursor/commands/full-review.md`.

### Meta-Agent Protocol (Inspiration: Meta-Harness)

- **Diagnostic over Speculation**: Always run `.\scripts\meta-diagnostic.ps1` or read raw logs in `data/logs/*.json` before proposing a fix.
- **Rules Evolution**: If a task fails or a pattern is discovered, update or create a `.cursor/rules/*.mdc` file immediately.
- **Transcript Mining**: Use `python scripts/peek_cursor_transcript.py search "pattern"` to retrieve solutions from past sessions (10M+ tokens of diagnostic history).

### Scaffolding (default behavior)

- Prefer **tools over guessing**: search the repo, read callers, open MCP tool descriptors before calling, run commands that **prove** the change (pytest/Vitest ciblé, lint). « Plus petit test utile » = preuve, pas excuse pour éviter une étape de processus requise.
- **UI / flux utilisateur** : une preuve complète exige aussi **`npm run dev` + vérification dans le navigateur** (pas seulement les tests). Voir `.cursor/rules/workflow.mdc` (section **Preuve UI**).
- **Run tests, do not only suggest them**: in Agent mode, **execute** the relevant pytest/Vitest/lint commands and report outcomes; do not claim “done” or “green” without command output. Full policy: `.cursor/rules/workflow.mdc` (obligation agents — exécution réelle des tests).
- **Real environment**: you can execute shell commands and network fetches; use them instead of dumping long “you should run…” lists when the task is to verify or fix.

### Non-obvious caveats

- **`python` symlink required on Linux**: The dev scripts (`scripts/dev.js`) check for `python` in PATH. On Linux, create a symlink: `sudo ln -sf /usr/bin/python3 /usr/local/bin/python`.
- **`python3-venv` system package required**: On Ubuntu/Debian, install `python3.12-venv` before creating the venv.
- **`.env` file**: Copy from `.env.example`. Required for JWT auth and config. Default dev credentials: `admin` / `admin123`.
- **Local dev auth (owner intent)** : defaults (`DISABLE_AUTH` / `SecurityConfig.disable_auth`, mock `admin`, frontend dev shortcuts) exist so **local dev stays frictionless**. **Do not** remove or harden that path for “security best practice” unless the owner explicitly asks. Production is enforced separately (`ENVIRONMENT=production` + `SecurityConfig.validate_config()`). When fixing auth-adjacent bugs, keep local behavior unchanged; scope hardening to production-only or clearly documented opt-in.
- **No real LLM key needed for basic dev**: Without `OPENAI_API_KEY`, the backend uses `DummyLLMClient` (mock responses). Set a real key for actual dialogue generation.
- **Frontend ESLint**: `npm --prefix frontend run lint` is green. Treat any new lint error as a regression to fix, not as accepted baseline debt.
- **Frontend Vitest (agents)** : protocole détaillé, PowerShell et sortie fichier → **`.cursor/rules/workflow.mdc`** (section Vitest + Frontend tests Windows). Si un test échoue, vérifier qu'une feature n'a pas été silencieusement retirée avant de le considérer obsolète.
- **Windows-first codebase**: Many npm scripts use PowerShell (`scripts/*.ps1`). On Linux, use the Node.js equivalents directly (e.g., `node scripts/dev.js`, `node scripts/getPythonPath.js -m pytest tests/`).

### Subagents (`.cursor/agents/`)

Specialized reviewers — invoke with `/name` or naturally. See `.cursor/rules/subagents.mdc` for the full reference.

| Subagent | Model | Purpose |
|----------|-------|---------|
| `api-contracts-reviewer` | fast | Schema/router/client drift |
| `graph-editor-reviewer` | inherit | Zustand slices, React Flow, stale closures |
| `llm-pipeline-reviewer` | fast | Streaming SSE, cost governance, LLM clients |
| `context-gdd-reviewer` | fast | GDD cache, context pipeline, token budget |
| `security-reviewer` | fast | Auth, JWT, secrets, CORS |
| `backend-services-reviewer` | fast | services/ layer, Notion sync, Unity export |
| `test-coverage-reviewer` | fast | pytest + Vitest coverage gaps |
| `transcript-history-researcher` | fast | Optional helper to grep/mining past Cursor session JSONL on disk (e.g. rules/process retros) |
| `playwright-e2e-specialist` | fast | Run/fix Playwright `e2e/` — voir `.cursor/agents/playwright-e2e-specialist.md` |

**Playwright + `Task` (important)** : l’enum **`subagent_type`** **ne liste pas** `playwright-e2e-specialist`. Pour paralléliser : **plusieurs `Task`** en `generalPurpose`, prompt avec **commande Playwright incluant des chemins explicites** (`npx playwright test e2e/foo.spec.ts …`). **Ne pas** donner à chaque enfant la suite entière sans arguments — chaque enfant = 1 spec ou un petit lot ; la **full liste** reste une passe **unique** du parent ou de la CI après les lots. Voir `.cursor/commands/playwright-e2e-parallel.md`.

**Preuve suite E2E complète (agents / CI locale)** : `npm run test:e2e:verify` (`CI=true` + `reuseExistingServer: false`) évite les `ERR_CONNECTION_REFUSED` si un Vite externe sur `:3000` a été réutilisé puis s’est arrêté pendant la suite. **PWA (Story 17.5)** : le smoke manifest + SW utilise `vite build` + `preview` — commande dédiée **`npm run test:e2e:pwa`** (non incluse dans `test:e2e:verify`).

**Full-repo review (no separate orchestrator agent)** : run **Composer** with seven specialist reviewers in parallel, or the parent sends **seven `Task` calls in one turn** (`api-contracts-reviewer`, `graph-editor-reviewer`, `llm-pipeline-reviewer`, `context-gdd-reviewer`, `security-reviewer`, `backend-services-reviewer`, `test-coverage-reviewer`). Then synthesize. A single `Task` that “does all seven” in one child run is **not** equivalent to seven isolates.

**Cursor session files on disk** : only relevant when you are explicitly mining *past chats* for patterns. Use whatever works (`Task` + subagent, `scripts/peek_cursor_transcript.py`, or targeted grep). Goal is to improve **this agent’s behavior in the repo**, not to maintain a history *of* subagents.

### Commands reference

See `.cursor/rules/workflow.mdc` for the full command reference (including **Vitest agent protocol**). Quick reminders:

- **Backend tests**: `.venv/bin/python -m pytest tests/ -x --tb=short`
- **Frontend lint**: `cd frontend && npx eslint . --ext ts,tsx`
- **Frontend tests**: follow `workflow.mdc` (ciblage, `test:quick`, fichier de sortie sous PowerShell, CI summary)
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

- Graph invariants (flush, `graphViewStore`, API) → **`.cursor/rules/graph_editor.mdc`**. `mergeNodeFormIntoStoreData()` / `mergeDialogueNodeFormIntoStoreData()` / `targetNode` below stay the short reminder.
- Use `mergeNodeFormIntoStoreData()` (dialogue: `mergeDialogueNodeFormIntoStoreData()`) instead of spread (`{ ...nodeData, ...formValues }`) when flushing `NodeEditorPanel` form state on selection change; the spread overwrites `choices[N].targetNode` written by `connectNodes`, breaking the edge connection.
- Node generation connection flow: API response → `connectNodes(parentId, newId, targetChoiceIndex, 'choice')` in `generationSlice` → `choices[N].targetNode` set in `edgeSlice` → `NodeEditorPanel` selection-change flush must preserve this field via `mergeDialogueNodeFormIntoStoreData` / `mergeNodeFormIntoStoreData`.
- Frontend lint baseline is zero error: `npm --prefix frontend run lint` must stay green, and stale `eslint-disable` directives should be removed instead of normalized.
- GraphEditor JSX is split into dedicated components in `frontend/src/components/graph/`: `GraphEditorHeader` (toolbar), `GraphValidationPanel` (overlay), `DialogueCostModal`, `GraphExportFormatDialog`. `GraphEditorHeader` calls `useGraphStore()` internally to avoid prop drilling.
- The `exportToUnity` store action (in `persistenceSlice`) serializes graph nodes to Unity JSON format; its trigger button lives in `GraphEditorHeader` and downloads a `.json` file named after `dialogueMetadata.filename`.
- The `continual-learning` skill uses **in-context conversation history only** — it never reads from `agent-transcripts/` files on disk (that folder does not exist on this system).
- **Stale closure React** : dans un `useCallback`, ne jamais capturer des valeurs de store qui changent entre renders. Utiliser `useRef(value)` (mis à jour à chaque render via `ref.current = value`) pour lire la valeur COURANTE au moment de l'appel, sans re-créer le callback. Exemple : `selectionsRef.current` dans `fetchAndSetSuggestions` de `ContextSelector`.
- Inter-component communication in the graph editor uses `useGraphViewStore` (typed Zustand store), NOT global `window` events. All `CustomEvent` dispatches/listeners have been migrated. See `.cursor/rules/graph_editor.mdc` for the full protocol.
- Graph mutations in `nodeSlice` and `edgeSlice` use `runGraphTransaction()` helper for consistent undo/sync/dirty handling. `layoutSlice` keeps its own custom sync logic.
- **UI responsive (frontend)** : skill `.cursor/skills/dialogue-frontend/SKILL.md` (workflow complet) + règle `.cursor/rules/responsive_frontend.mdc` — tokens `responsiveChrome.ts`, tests + preuve narrow (`npm run dev`). Détail Epic 17 : `references/responsive-epic17.md` dans le skill.
