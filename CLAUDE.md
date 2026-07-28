# CLAUDE.md

Fichier d'instructions canonique du dépôt. `AGENTS.md` n'est qu'un pointeur vers celui-ci.

DialogueGenerator est une app React + FastAPI de génération de dialogues RPG via LLM. Pas de base de données ni de Docker — toutes les données sont fichiers (JSON dans `data/`).

## Règles toujours actives

@.claude/rules/application_role.md
@.claude/rules/agentivity.md
@.claude/rules/shell_discipline.md
@.claude/rules/meta_agent.md
@.claude/rules/python.md
@.claude/rules/env.md
@.claude/rules/git_commit.md
@.claude/rules/ci_before_push.md

## Routage des règles conditionnelles

Cursor attachait ces règles automatiquement par glob. Claude Code n'a pas ce mécanisme : **lis la règle correspondante avant de toucher aux fichiers listés**.

| Tu touches à… | Lis d'abord |
|---|---|
| `api/**/*.py` (routers, schemas) | `.claude/rules/backend_api.md` |
| `api/schemas/**`, validation Unity, erreurs inline graphe | `.claude/rules/api_validation_errors.md` |
| `frontend/**` (général) | `.claude/rules/frontend.md` |
| `frontend/**/*.{ts,tsx,css}` — layout, mobile, tactile | `.claude/rules/responsive_frontend.md` + skill `dialogue-frontend` |
| `frontend/src/components/graph/**`, `graphStore.ts`, `*Slice.ts` | `.claude/rules/graph_editor.md` |
| `testNodeSync.ts`, `TestNode.tsx` | `.claude/rules/testnode_sync.md` |
| `usePromptPreview.ts`, `StructuredPromptView.tsx` | `.claude/rules/prompt_structure.md` |
| `authStore.ts`, `components/auth/**`, `App.tsx`, `e2e/auth*` | `.claude/rules/guest_first_auth.md` |
| `core/llm/**`, `constants.py`, `llm_config.json`, `factories/**` | `.claude/rules/llm.md` + skill `llm-model-update` |
| `models/dialogue_structure/**`, `unity_dialogue_generation_service.py` | `.claude/rules/unity_dialogue_generation.md` + `.claude/rules/structured_output.md` |
| GDD sur disque, loaders, shards, cache, fingerprints | `.claude/rules/gdd_paths.md` |
| `context_field_detector`, `context_organizer`, `ContextFieldSelector` | `.claude/rules/field_classification.md` |
| `services/notion_api_client.py`, `notion_import_service.py` | `.claude/rules/notion_gdd_content_fetch.md` |
| `services/gdd_notion_sync*.py`, `data/gdd_notion_sync/settings.json` | `.claude/rules/gdd_notion_sync_builder.md` |
| `services/game_systems_*.py`, `mechanics_systems.py`, systems frontend | `.claude/rules/game_systems_integration.md` |
| `tests/**/*.py` | `.claude/rules/tests.md` + `.claude/rules/tests_patterns.md` |
| `tests/**/*integration*.py`, `test_*_real*.py` | `.claude/rules/tests_integration.md` |
| Tests frontend (Vitest, RTL, Playwright), tout bug UI | `.claude/rules/frontend_testing.md` |
| Appeler l'API au lieu de réimplémenter | `.claude/rules/api_usage.md` + skill `api-runbook` |
| Déployer, nginx, systemd, `.env` prod | `.claude/rules/deployment.md` |
| Bump de version, tag, canvas versions | `.claude/rules/app_versioning.md` + skill `prod-release` |
| Logs, archivage, rotation, consultation API | `.claude/rules/logging.md` |
| Flags de verbosité, diagnostic | `.claude/rules/debugging.md` |
| Commandes, tests, venv — workflow transverse | `.claude/rules/workflow.md` |
| Déléguer à un subagent, revue multi-agents | `.claude/rules/subagents.md` |
| Écrire une règle / skill / commande / subagent | `.claude/rules/claude_harness_authoring.md` |
| `.github/workflows/**` — CI, merge `data/`, relais `workflow_dispatch` | `.claude/rules/github_automation.md` |
| `ui/**/*.py`, `main_app.py` | `.claude/rules/ui.md` — ⚠️ **déprécié** (PySide6) |

## Services

| Service | Port | Commande |
|---------|------|----------|
| Backend FastAPI | 4243 | `npm run start:api` (ou `.venv/bin/python -m api.main` avec `API_PORT=4243 RELOAD=true`) |
| Frontend Vite | 3000 | `cd frontend && npx vite --host 0.0.0.0 --port 3000` |

Les deux ensemble : `npm run dev` (via `node scripts/dev.js`).

## Tests — niveaux T0–T3

Grille complète : **`/test-tiers`**. Obligations agents et protocole Vitest : `.claude/rules/workflow.md`.

- **Backend** : `npm run test:backend:smoke` (T0) · `test:backend:fast` (T2) · `test:backend:full` (T3)
- **Agrégat T0** : `npm run test:smoke` · **Pré-merge T2** : `npm run test:premerge`
- **E2E** : `npm run test:e2e:smoke` (fumée) · `npm run test:e2e:verify` (complet) · `npm run test:e2e:pwa` (PWA, non inclus dans verify)
- **Lint frontend** : `npm --prefix frontend run lint` — baseline **zéro erreur**

**Exécuter les tests, pas seulement les suggérer.** Ne jamais annoncer « vert » sans sortie de commande. Quand on te demande de corriger un test, **relance-le après le correctif** et montre la preuve.

**Preuve UI** : pour tout flux utilisateur, une preuve complète exige aussi `npm run dev` + vérification navigateur — pas seulement les tests.

## Appeler l'API

Pour **sync GDD**, **contexte**, **documents**, **graphe** ou toute action backend : **appelle l'API REST**, ne réimplémente pas la logique dans des scripts jetables.

1. **Cookbook d'abord** : `.claude/skills/api-runbook/references/cookbook.md` — si la tâche y figure, **exécute immédiatement** (pas de recherche de code, pas de curl).
2. Invocation unique : `npm run api:invoke -- -Method … -Path …`
3. Sync personnages (Uresaïr, Valkazer…) : health → `POST /api/v1/gdd-notion-sync/sync?category_file=Personnages.json` → `GET …/status` — **3 commandes max**.
4. Commande `/api-runbook` · subagent **`api-operator`**.

## Subagents

Spécialistes dans `.claude/agents/`. Invocables via l'outil `Agent` avec leur `subagent_type`.

| Subagent | Rôle |
|----------|------|
| `api-operator` | Exécute les appels REST (sync, contexte, health) |
| `api-contracts-reviewer` | Dérive schémas / routers / client frontend |
| `graph-editor-reviewer` | Slices Zustand, React Flow, stale closures |
| `llm-pipeline-reviewer` | Streaming SSE, gouvernance des coûts, clients LLM |
| `context-gdd-reviewer` | Cache GDD, pipeline contexte, budget tokens |
| `security-reviewer` | Auth, JWT, secrets, CORS |
| `backend-services-reviewer` | Couche `services/`, sync Notion, export Unity |
| `test-coverage-reviewer` | Trous de couverture pytest + Vitest |
| `playwright-e2e-specialist` | Lance et corrige les specs `e2e/` |
| `transcript-history-researcher` | Fouille les sessions passées (Claude + archive Cursor) |

**Seuil** : **≤ 3 subagents** → autonomie, aucune confirmation. **> 3** → annoncer et demander un feu vert court avant de lancer.

**Revue globale** (« full review », « holistic », « tout le codebase ») → **7 reviewers en parallèle** dans un seul message, puis synthèse : commande **`/full-review`**. Au-dessus du seuil, donc : proposer la commande et attendre — sauf si l'utilisateur a tapé `/full-review` lui-même, ce qui vaut confirmation. Un seul agent qui « fait les sept » n'est pas équivalent.

**E2E en parallèle** → `/playwright-e2e-parallel`. Chaque enfant reçoit des **chemins de specs explicites** ; jamais `npx playwright test` nu.

## BMAD

BMAD est installé pour Claude Code (`_bmad/_config/manifest.yaml` → `ides: [claude-code]`). Les skills vivent dans `.claude/skills/bmad-*` et se déclenchent naturellement ou via `/nom-du-skill`. Point d'entrée en cas de doute : **`/bmad-help`**.

Boucle de dev non supervisée : **bmad-loop** (`bmad-loop run`, `bmad-loop tui`). Config : `.bmad-loop/policy.toml`. Prérequis installés : `psmux` (multiplexeur Windows) et le CLI `claude`. Le worktree doit être **propre** avant `bmad-loop run`.

⚠️ Ne jamais écrire à la main sous `_bmad/` : l'installeur BMAD en est propriétaire et régénère tout. Les surcharges durables vont dans `_bmad/custom/` (un fichier `<nom-du-skill>.toml` par skill surchargé).

**Brownfield** : le dépôt a déjà ~259 fichiers pytest, ~231 Vitest et 20 specs Playwright. La contrainte « ne pas regénérer de tests déjà couverts » est injectée via `_bmad/custom/bmad-testarch-automate.toml` (`persistent_facts`) — elle remplace l'ancienne règle `tea_automate_brownfield.md`, devenue caduque quand les workflows TEA sont passés en skills.

## Caveats non évidents

- **`.env`** : copier depuis `.env.example`. Requis pour JWT et config. Credentials seed : `admin` / `admin123` (ou `ADMIN_PASSWORD`).
- **Auth guest-first** : l'UI démarre en session guest (`POST /api/v1/auth/guest`) sans JWT valide ; bouton Connexion → `/login`. **Pas** de bypass Vite. Défaut applicatif `DISABLE_AUTH=false`. Pytest force `true` via `tests/conftest.py`. Prod : `ENVIRONMENT=production` + `SecurityConfig.validate_config()` refuse `disable_auth`.
- **Pas de clé LLM requise** pour le dev de base : sans `OPENAI_API_KEY`, le backend utilise `DummyLLMClient`.
- **Codebase Windows-first** : beaucoup de scripts npm passent par PowerShell (`scripts/*.ps1`). Sous Linux, utiliser les équivalents Node (`node scripts/dev.js`, `node scripts/getPythonPath.js -m pytest tests/`).
- **`python` en PATH requis sous Linux** : `sudo ln -sf /usr/bin/python3 /usr/local/bin/python`. Et installer `python3.12-venv` avant de créer le venv.
- **SDK mistralai** : le code fait `from mistralai import Mistral`, qui exige mistralai **v1.x** (testé 1.12.4). La v2.x casse cet import. Épingler `mistralai>=1.10.0,<2.0.0`.
- **Suite Vitest complète lente** : 10+ min sur VM contrainte. Préférer les runs ciblés ou `npm run test:frontend:quick`.
- **Notion — corps de page complet** : toute lecture du texte d'une page passe par `NotionAPIClient.get_page_content` (markdown API prioritaire, repli blocs). Ne pas dupliquer un export « full body » basé uniquement sur `blocks/.../children`.
- **Historique Cursor** : le dépôt a migré de Cursor vers Claude Code. Les transcripts Cursor (l'essentiel de l'historique diagnostic) restent sous `%USERPROFILE%\.cursor\projects\f-Projets-DialogueGenerator\agent-transcripts\` — voir le subagent `transcript-history-researcher`.

## Préférences utilisateur apprises

- Ne jamais déléguer à l'API ou au LLM un comportement frontend déterministe ; si l'utilisateur a choisi une option et déclenche une génération IA, la connexion parent→nœud est la responsabilité du front, pas une suggestion d'API.
- Exiger des **logs d'exécution** avant de proposer un correctif de bug ; ne jamais spéculer à partir du code seul.
- Préférer des correctifs SOLID/KISS petits et ciblés plutôt qu'accumuler des gardes défensives issues de plusieurs hypothèses ; **revenir en arrière** sur le code d'une hypothèse rejetée avant d'en poursuivre une autre.
- Créer un test de régression pour tout correctif non trivial, surtout en gestion d'état.
- Pas de commentaires qui narrent ce que fait le code ; un commentaire explique une intention ou une contrainte non évidente.
- Quand un test préexistant échoue, **vérifier si la feature testée a été retirée silencieusement** avant de déclarer le test obsolète ; restaurer la feature si elle a toujours sa place.
- Gros refactors de composants en deux passes : d'abord extraire la logique en hooks, puis extraire les blocs JSX en composants enfants.
- Ne pas exiger une validation UI manuelle après chaque user story ; une validation par lot / fin d'epic suffit sauf demande contraire.
- La preuve E2E finale, ce sont les parcours UI (écrans, clics, libellés) ; les tests API sont un filet de sécurité, pas le « done » produit.
- Questions pré-implémentation : français simple, options concrètes ; jargon technique en annexe courte si nécessaire.

## Faits techniques appris

- **Flush du formulaire de nœud** : utiliser `mergeNodeFormIntoStoreData()` (dialogue : `mergeDialogueNodeFormIntoStoreData()`) au lieu d'un spread `{ ...nodeData, ...formValues }` lors du flush de `NodeEditorPanel` au changement de sélection — le spread écrase `choices[N].targetNode` écrit par `connectNodes` et casse la liaison d'arête.
- **Flux de connexion à la génération** : réponse API → `connectNodes(parentId, newId, targetChoiceIndex, 'choice')` dans `generationSlice` → `choices[N].targetNode` posé dans `edgeSlice` → le flush de `NodeEditorPanel` doit préserver ce champ.
- **Stale closure React** : dans un `useCallback`, ne jamais capturer des valeurs de store qui changent entre les renders. Utiliser `useRef(value)` (mis à jour à chaque render) pour lire la valeur **courante** à l'appel sans recréer le callback. Ex. `selectionsRef.current` dans `fetchAndSetSuggestions` de `ContextSelector`.
- **Communication inter-composants du graphe** : via `useGraphViewStore` (store Zustand typé), **pas** d'événements `window` globaux. Tous les `CustomEvent` ont été migrés.
- **Mutations de graphe** : `nodeSlice` et `edgeSlice` passent par `runGraphTransaction()` (undo/sync/dirty cohérents). `layoutSlice` garde sa propre logique.
- **Découpage GraphEditor** : le JSX vit dans `frontend/src/components/graph/` — `GraphEditorHeader` (toolbar), `GraphValidationPanel`, `DialogueCostModal`, `GraphExportFormatDialog`. `GraphEditorHeader` appelle `useGraphStore()` en interne pour éviter le prop drilling.
- **Export Unity** : l'action `exportToUnity` (dans `persistenceSlice`) sérialise les nœuds au format JSON Unity ; son bouton vit dans `GraphEditorHeader` et télécharge un `.json` nommé d'après `dialogueMetadata.filename`.
- **Sampling GPT-5.6** : ne jamais envoyer `temperature` / `top_p` pour Sol/Terra/Luna (400 API). Garde-fou dans `OpenAIParameterBuilder` + `ModelNames.MODELS_WITHOUT_CUSTOM_TEMPERATURE`. Omettre `reasoning.effort` vaut `medium`.
- **Game systems FR94** : logique déterministe dans `services/game_systems_{integration,skill_checks,effort,reputation,social_diagnostics}.py` + miroirs `frontend/src/utils/{skillChecks,effortPreview,reputationFr94,socialDiagnostics,previewSimulationLimits}.ts` ; UI `GameSystemsIntegrationPanel`, preview via `graphViewStore.previewGameSystemsState` et `POST /documents/{id}/preview`. Doc : `docs/guides/game-systems-integration.md`. **Reste à faire** : connexion runtime Unity live (`runtime_source.connected`).
