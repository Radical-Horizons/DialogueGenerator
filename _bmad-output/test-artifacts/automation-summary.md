---
stepsCompleted: ['step-01-preflight-and-context', 'step-02-identify-targets', 'step-03-generate-tests', 'step-03c-aggregate']
lastStep: 'step-03c-aggregate'
lastSaved: '2026-03-07'
inputDocuments:
  - _bmad/tea/config.yaml
  - _bmad/tea/testarch/tea-index.csv
  - _bmad/tea/testarch/knowledge/test-levels-framework.md
  - _bmad/tea/testarch/knowledge/test-priorities-matrix.md
  - _bmad/tea/testarch/knowledge/data-factories.md
  - _bmad/tea/testarch/knowledge/selective-testing.md
  - _bmad/tea/testarch/knowledge/ci-burn-in.md
  - _bmad/tea/testarch/knowledge/test-quality.md
---

# Test Automation Summary — DialogueGenerator

## Step 1: Preflight & Context (complété)

### 1. Stack détectée

- **`test_stack_type`** (config) : `auto`
- **Indicateurs projet** : `conftest.py`, `tests/` (pytest), pas de `package.json`/Playwright à la racine du workspace.
- **Résultat** : `{detected_stack}` = **backend** (Python / FastAPI / pytest).

### 2. Vérification du framework

- **Backend** : `tests/conftest.py` présent, `TestClient` FastAPI, `ServiceContainer` injecté.
- **Conclusion** : framework de test prêt — pas besoin d’exécuter le workflow « framework » en premier.

### 3. Mode d’exécution

- **BMad-Integrated** : artefacts trouvés (`_bmad-output/planning-artifacts/epics/`, test-design, sprint-status).
- **Mode retenu** : **BMad-Integrated** (stories/critères d’acceptation et test-design utilisables pour cibler les scénarios).

### 4. Contexte chargé

- **Artéfacts BMad** : epics (liste + fichiers), test-design / reviews possibles.
- **Config TEA** : `tea_use_playwright_utils: true`, `tea_use_pactjs_utils: true`, `tea_pact_mcp: mcp`, `tea_browser_automation: auto`, `test_stack_type: auto`.
- **Structure des tests** : `tests/` avec sous-dossiers `api/`, `services/`, `integration/`, `core/`, `repositories/`, `utils/`, `models/`, `middleware/`, `manual/`.
- **Fragments de connaissance (core)** : test-levels-framework, test-priorities-matrix, data-factories, selective-testing, ci-burn-in, test-quality.
- **Playwright Utils** : profil API-only non chargé (stack backend-only Python ; pas de tests Playwright dans le projet).
- **Pact** : config activée mais aucun indicateur Pact dans le repo ; fragment contract-testing/pact-mcp disponible si besoin plus tard.

### 5. Synthèse des entrées

| Élément            | Valeur |
|--------------------|--------|
| Stack              | backend (Python/pytest/FastAPI) |
| Mode               | BMad-Integrated |
| Répertoire tests   | `tests/` |
| Répertoire source  | racine projet |
| Cible de couverture| `critical-paths` (défaut workflow) |
| Artéfacts BMad     | epics, test-design disponibles |

---

## Step 2: Cibles d’automatisation (complété)

### 1. Cibles identifiées (BMad-Integrated + backend)

**Analyse des routes API (source : `api/routers/` + `api/main.py`) :**

| Domaine | Routes / responsabilités | Existant tests |
|--------|----------------------------|----------------|
| **Auth** | POST /login, /refresh, GET /me, POST /logout | test_auth.py |
| **Health** | GET /health, /api/v1/healthcheck, /health/detailed | test_health.py, test_health_check.py |
| **Graph** | CRUD graphe, generate, estimate, regenerate, accept/reject, streaming jobs | test_graph_*.py, test_streaming_router.py |
| **Config** | GET/PUT config, context fields, presets, flags, validation | test_config*.py, test_presets*.py, test_mechanics_flags.py |
| **Context** | Récupération/constitution du contexte, champs, format | test_context*.py |
| **Dialogues / Unity** | Dialogues Unity CRUD, schéma, export | test_dialogues.py, test_unity_dialogues*.py |
| **Documents** | GET/PUT documents, révisions, layout | test_documents.py |
| **Costs / LLM usage** | Coûts, budgets, usage par dialogue / global | test_costs.py, test_llm_usage*.py |
| **Logs** | Recherche, stats, fichiers, frontend | test_logs.py |
| **Vocabulary / Narrative guides** | Vocabulaire, guides narratifs | test_vocabulary.py, test_narrative_guides*.py |
| **Presets** | CRUD presets, validation | test_presets*.py |
| **Streaming** | Jobs de génération, stream, cancel, status | test_streaming_router.py |

**Services (logique métier)** : nombreux tests sous `tests/services/` (orchestrateurs, génération, contexte, coûts, GDD, etc.). Intégration partielle sous `tests/integration/`.

**OpenAPI** : pas de fichier `openapi.yaml`/`swagger.json` dans le repo ; les contrats sont déduits du code FastAPI.

### 2. Niveaux de test retenus

- **Unit** : logique pure (calculs, normalisation, parsing, builders) — déjà bien couvert (services, models, utils).
- **API (integration)** : contrats des routes, codes HTTP, schémas de réponse, erreurs — à renforcer sur les chemins critiques et les cas limites.
- **E2E** : non applicable dans ce workflow (stack backend-only) ; les E2E existants (frontend/Playwright) sont hors périmètre du workspace actuel.

### 3. Priorités (matrice P0–P3)

| Cible | Priorité | Justification |
|-------|----------|----------------|
| Auth (login, refresh, /me, logout) | **P0** | Sécurité, accès à l’API |
| Health / healthcheck | **P0** | Monitoring, déploiement |
| Graph : génération, jobs, streaming, cancel | **P1** | Cœur métier, flux critique |
| Config / context fields / presets | **P1** | Configuration utilisateur, cohérence |
| Dialogues Unity CRUD + schéma | **P1** | Données centrales du produit |
| Costs / LLM usage / budgets | **P1** | Gouvernance coûts, facturation |
| Documents (GET/PUT, révisions) | **P1** | Persistance, concurrence (epic 16) |
| Logs (recherche, stats, frontend) | **P2** | Observabilité, debug |
| Vocabulary, narrative guides, mechanics flags | **P2** | Fonctionnalités secondaires |

### 4. Plan de couverture

- **Objectif** : `critical-paths` (chemins critiques + P0/P1).
- **Cibles par niveau**  
  - **API** : renforcer les tests existants pour Auth, Health, Graph (génération + jobs), Config/context/presets, Dialogues Unity, Costs, Documents ; ajouter cas d’erreur (4xx/5xx) et validation des schémas là où manquant.  
  - **Unit** : conserver et compléter si besoin les tests services/utils/models (edge cases, erreurs).
- **Périmètre** : pas de duplication inutile ; priorité aux scénarios non couverts ou fragiles (streaming, concurrence, validation).
- **Justification** : BMad-Integrated + backend seul → focus API et unit ; epics 0, 1, 16 done → cibles alignées sur ces périmètres et sur les prochains (epic 2, 3, 4).

### 3b. Brownfield — Découverte existant + gaps (run 2026-03-07)

**Existing coverage (déduit des tests API)** :  
Routes appelées dans `tests/api/` : `/health`, `/api/v1/auth/login`, `/api/v1/auth/me`, `/api/v1/config/*`, `/api/v1/context/*`, `/api/v1/presets/*`, `/api/v1/unity-dialogues/*`, `/api/v1/dialogues/*`, `/api/v1/documents/*`, `/api/v1/costs/*`, `/api/v1/llm-usage/*`, `/api/v1/logs/*`, `/api/v1/mechanics/flags*`, `/api/vocabulary*`, `/api/narrative-guides*`, streaming jobs (POST/GET cancel/stream/status). Fichiers : `test_health.py`, `test_auth.py`, `test_*.py` (config, context, presets, documents, costs, llm_usage, logs, mechanics_flags, vocabulary, streaming, graph, unity_dialogues, dialogues, etc.).

**Gaps (non couverts)** :
- **GET /api/v1/healthcheck** (alias monitoring)
- **GET /health/detailed**
- **POST /api/v1/auth/refresh**
- **POST /api/v1/auth/logout**
- **GET /debug/prompt-engine** (P3, optionnel)

**Coverage plan pour génération (gaps uniquement)** :  
Cibles transmises à l’étape 3 : healthcheck, health/detailed, auth/refresh, auth/logout. (debug/prompt-engine en P3 optionnel.)

### 5. Prochaine étape

Chargement de l’étape 3 (génération des tests) pour produire les scénarios **uniquement sur les gaps** ci-dessus.

---

## Step 3 & 3C: Génération et agrégation (run 2026-03-07)

**Mode d’exécution** : sequential (backend only — API + Backend workers).

**Fichiers générés** :
- `tests/api/test_health_auth_gaps.py` — 5 tests P0 (healthcheck, health/detailed, auth/refresh x2, auth/logout).

**Backend** : aucun fichier (aucun gap service ciblé pour cette run).

**Résumé** :
- Stack : backend
- Total tests générés : 5 (API), 0 (backend)
- Fichiers créés : 1
- Fixtures : `client` (déjà dans conftest)
- Priorité : P0 = 5, P1 = 0, P2 = 0, P3 = 0

**Sorties workers** : `_bmad-output/test-artifacts/tea-automate-api-tests-2026-03-07T14-29-25.json`, `tea-automate-backend-tests-2026-03-07T14-29-25.json`.

---
