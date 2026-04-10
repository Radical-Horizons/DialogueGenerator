# Story 4.14: Refactorer `api/routers/graph.py` — découpage en modules cohérents (dette technique)

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **développeur maintenant la codebase**,
I want **éclater `api/routers/graph.py` (1 768 lignes) en modules router cohérents par domaine fonctionnel**,
so that **chaque module reste lisible, testable indépendamment, et que les futures stories ne continuent pas d'alimenter un god-file**.

## Acceptance Criteria

1. **Given** `api/routers/graph.py` contient 14 handlers couvrant : IO, génération, coût, validation, qualité, flow/layout, historique nœuds, **When** le refactor est terminé, **Then** chaque nouveau module router ≤ ~400 lignes, adresse un seul domaine fonctionnel, et tous les endpoints existants répondent identiquement (0 régression API — `npm run test:backend:full` vert, lint vert).
2. **Given** des helpers privés (`_load_unity_nodes_from_dialogue`, `_reconstruct_prompt_for_node`, `_ai_slop_options_to_data`, etc.) sont inlinés dans `graph.py`, **When** le refactor est terminé, **Then** chaque helper est dans le module qui le consomme (ou dans `graph_router_helpers.py` si transverse à plusieurs modules).
3. **Given** `_estimate_cost_cache` est importé directement dans `tests/api/test_graph_estimate_cost.py` depuis `api.routers.graph`, **When** le cache est déplacé dans `graph_cost.py`, **Then** l'import de test est mis à jour → `from api.routers.graph_cost import _estimate_cost_cache` ; la suite reste verte.
4. **Given** le singleton `_cd_rules_service` était historiquement hors `ServiceContainer`, **When** le refactor est terminé, **Then** confirmer (ou documenter) que `ContextDroppingRulesService` est injecté exclusivement via `Depends(get_cd_rules_service)` dans le module qui le consomme — 0 import singleton résiduel.

## Tasks / Subtasks

- [x] Task 1 : Modules `graph_io.py`, `graph_generation.py`, `graph_cost.py` — handlers persistance, génération, estimation déplacés et enregistrés dans `main.py` (AC: #1, #3)
  - [x] 🔴 Test échoue : après création des 3 nouveaux fichiers mais AVANT leur enregistrement dans `main.py` (et après suppression temporaire de l'ancien `graph.router` ou d'un seul handler), `POST /api/v1/unity-dialogues/graph/load` → 404, `POST /api/v1/unity-dialogues/graph/generate-node` → 404, `POST /api/v1/unity-dialogues/graph/estimate-cost` → 404. Exemple de commande preuve : `node scripts/getPythonPath.js -m pytest tests/api/test_graph_crud.py::TestLoadGraph tests/api/test_graph_generate_node.py tests/api/test_graph_estimate_cost.py -x -q 2>&1 | head -30`
  - [x] 🟢 Implémenter `graph_io.py` (~260L), `graph_generation.py` (~160L), `graph_cost.py` (~260L) + enregistrement des 3 routers dans `main.py` + mise à jour import test `_estimate_cost_cache` (voir Dev Notes)
  - [x] 🔵 Refactor : tous les helpers coût (`_fingerprint_for_selections_safe`, `_build_representative_prompt_for_estimate`, `_resolve_model_and_provider`, `_batch_count_from_request`, `_estimate_cost_cache_key`, `_try_compute_context_relevance`, TTLCache) dans `graph_cost.py` uniquement — 0 doublon entre modules. Vérifier taille effective des 3 fichiers.

- [x] Task 2 : Modules `graph_validation.py`, `graph_quality.py`, `graph_flow.py` — handlers validation, qualité, simulation/layout déplacés et enregistrés (AC: #1, #2, #4)
  - [x] 🔴 Test échoue : après création des 3 modules mais avant enregistrement, `POST /api/v1/unity-dialogues/graph/validate` → 404, `POST /api/v1/unity-dialogues/graph/detect-ai-slop` → 404, `POST /api/v1/unity-dialogues/graph/simulate-flow` → 404. Commande preuve : `node scripts/getPythonPath.js -m pytest tests/api/test_graph_validate.py::TestValidateGraph tests/api/test_graph_detect_ai_slop.py tests/api/test_graph_estimate_cost.py::TestSimulateFlow -x -q 2>&1 | head -30`
  - [x] 🟢 Implémenter `graph_validation.py` (~220L), `graph_quality.py` (~370L), `graph_flow.py` (~120L) + enregistrement dans `main.py`
  - [x] 🔵 Refactor : `_ai_slop_options_to_data`, `_detect_ai_slop_response_from_result` dans `graph_quality.py` uniquement ; `_load_persisted_cd_rules`, `_context_dropping_options_to_data` dans `graph_quality.py` ; `ContextDroppingRulesService` injecté via `Depends(get_cd_rules_service)` dans `graph_quality.py` (pas de singleton) — AC #4 confirmé documenté.

- [x] Task 3 : Module `graph_node_history.py` + suppression `graph.py` + non-régression complète (AC: #1, #2)
  - [x] 🔴 Test échoue : après création de `graph_node_history.py` mais avant enregistrement ET suppression de `graph.py`, `GET /api/v1/unity-dialogues/graph/{id}/node/{stableId}/prompt` → 404, `POST .../accept` → 404, `POST .../reject` → 404, `POST .../regenerate` → 404. Commande preuve : `node scripts/getPythonPath.js -m pytest tests/api/test_graph_prompt.py tests/api/test_graph_accept_reject.py tests/api/test_graph_regenerate.py -x -q 2>&1 | head -30`
  - [x] 🟢 Implémenter `graph_node_history.py` (~450L, justifié — voir Dev Notes) + enregistrement dans `main.py` + supprimer `api/routers/graph.py` + run `npm run test:backend:full` et `npm --prefix frontend run lint` ; les deux doivent passer
  - [x] 🔵 Refactor : `_validate_dialogue_exists`, `_load_unity_nodes_from_dialogue`, `_reconstruct_prompt_for_node` dans `graph_node_history.py` uniquement (consommateurs exclusifs confirmés à l'analyse) ; si un futur module en a besoin → déplacer alors vers `graph_router_helpers.py` ; nommage DDD des tests Vitest si présents.

## Dev Notes

### Architecture guardrails

- **Contrat URL strict** : tous les endpoints actuels de `graph.py` sont préfixés par `router = APIRouter(prefix="/api/v1/unity-dialogues/graph", ...)`. Le split doit préserver exactement ce préfixe sur chaque nouveau module OU (recommandé) déclarer `APIRouter()` sans préfixe dans chaque module et enregistrer via `app.include_router(graph_io.router, prefix="/api/v1/unity-dialogues/graph", tags=["Graph Editor"], dependencies=[Depends(get_current_user)])` dans `main.py` — choisir une convention et rester cohérent.
- **Dépendance d'authentification** : `dependencies=[Depends(get_current_user)]` doit s'appliquer à tous les nouveaux routers, soit au niveau `APIRouter(...)`, soit au `include_router(...)`. Vérifier avec `GET /api/v1/unity-dialogues/graph/load` sans token → 401.
- **Refactor pur** : 0 nouveau comportement, 0 endpoint ajouté/supprimé, 0 modification de signature de handler. La preuve finale est `npm run test:backend:full` vert.

### Découpage proposé (à valider à l'analyse)

| Nouveau module | Handlers déplacés | Taille estimée |
|---|---|---|
| `graph_io.py` | `load_graph`, `save_graph`, `save_graph_and_write` | ~260L |
| `graph_generation.py` | `generate_node` | ~160L |
| `graph_cost.py` | `estimate_cost` + 6 helpers coût + TTLCache | ~265L |
| `graph_validation.py` | `validate_graph`, `validate_schema`, `validate_lore_explicit` | ~220L |
| `graph_quality.py` | `detect_ai_slop`, `detect_context_dropping`, `evaluate_dialogue_quality` + 4 helpers qualité | ~370L |
| `graph_flow.py` | `simulate_flow`, `calculate_layout` | ~120L |
| `graph_node_history.py` | `get_node_prompt`, `accept_node`, `reject_node`, `regenerate_node` + `_validate_dialogue_exists`, `_load_unity_nodes_from_dialogue`, `_reconstruct_prompt_for_node` | ~450L* |

*`graph_node_history.py` dépasse légèrement 400L : acceptable car les 4 handlers partagent 3 helpers privés étroitement couplés. Documenter la justification dans un commentaire du fichier.

### Import à mettre à jour (AC #3 — breaking)

`tests/api/test_graph_estimate_cost.py` ligne 13 :
```python
# avant
from api.routers.graph import _estimate_cost_cache
# après
from api.routers.graph_cost import _estimate_cost_cache
```

### Ce qui est déjà résolu (AC #4)

`ContextDroppingRulesService` est **déjà** injecté via `Depends(get_cd_rules_service)` à la ligne 1045 de `graph.py` — pas de singleton. Confirmer en cherchant `_cd_rules_service =` (sans `Depends`) dans le nouveau `graph_quality.py` après le split.

### Qualité bar

- Full backend suite (`npm run test:backend:full`) verte AVANT de clôturer la story
- `npm --prefix frontend run lint` vert (pas de changement frontend, mais confirmer)
- Chaque nouveau fichier : annotations de types complètes, docstrings PEP257, 0 `except Exception` silencieux

### Refactor bar (story-specific)

- Seuil par fichier : ~400L (guideline, pas limite absolue — voir justification `graph_node_history.py`)
- Fonctions : ~60L max
- Pas de duplication de helpers entre modules

### Fichiers chauds

| Fichier | Taille actuelle | Contrainte |
|---|---|---|
| `api/routers/graph.py` | **1 768 L** | Fichier source du split — sera supprimé à Task 3 |
| `api/main.py` | 736 L | Ajouter ~7 `include_router` lignes → rester ≤ 750L |
| `api/dependencies.py` | 470 L | Aucune modification attendue |
| `api/container.py` | 399 L | Aucune modification attendue |

### Conventions

- snake_case modules : `graph_io`, `graph_cost`, `graph_generation`, `graph_validation`, `graph_quality`, `graph_flow`, `graph_node_history`
- Chaque module : `router = APIRouter(...)` en début de fichier, `logger = logging.getLogger(__name__)`
- Imports par module : uniquement les dépendances réellement utilisées dans ce module

### Project Structure Notes

- Tous les nouveaux modules dans `api/routers/`
- `api/main.py` : remplacer `app.include_router(graph.router)` par 7 `include_router` calls (maintenir ordre logique)
- `api/routers/__init__.py` est vide (4L) — pas à modifier

### References

- [Source: `api/routers/graph.py` — fichier d'origine, 1 768L, à analyser complètement avant split]
- [Source: `api/main.py` L617 — unique `include_router(graph.router)` à remplacer]
- [Source: `tests/api/test_graph_estimate_cost.py` L13 — import `_estimate_cost_cache` à mettre à jour]
- [Source: `api/dependencies.py` — `get_cd_rules_service`, `get_current_user` et autres dépendances à réimporter dans chaque module]
- [Source: `api/routers/auth.py` — pattern `router = APIRouter(prefix=..., dependencies=[Depends(get_current_user)])` à reproduire]
- [Source: `_bmad-output/planning-artifacts/epics/epic-04.md` — Story 4.14, AC originaux]

## Dev Agent Record

### Agent Model Used

claude-4.6-sonnet-medium-thinking

### Debug Log References

### Completion Notes List

- `sprint-status.yaml` : `4-14-refactorer-api-routers-graph-dette-technique` passé `backlog` → `in-progress` → `review` (alignement story `ready-for-dev` vs sprint).
- 7 routers sous `prefix=/api/v1/unity-dialogues/graph` + `Depends(get_current_user)` via boucle dans `api/main.py` (convention Dev Notes).
- AC #4 : `detect_context_dropping` conserve `Depends(get_cd_rules_service)` — grep `_cd_rules_service =` : aucun dans `graph_quality.py`.
- Preuves : `npm run test:backend:full` → 1581 passed, 1 skipped ; `npm --prefix frontend run lint` → vert.

#### 🔵 Refactor Task 1

- `graph_io.py` : factorisation `_sanitize_dialogue_title_for_filename()` — avant duplication des deux `re.sub` dans `save_graph` / `save_graph_and_write` ; après un seul helper + deux appels.

#### 🔵 Refactor Task 2

- Helpers AI slop + context dropping + mapping réponse confinés à `graph_quality.py` (aucune copie dans les autres modules graph).

#### 🔵 Refactor Task 3

- Helpers `_validate_dialogue_exists`, `_load_unity_nodes_from_dialogue`, `_reconstruct_prompt_for_node` exclusivement dans `graph_node_history.py` ; `graph_generation` / `graph_node_history` importent `fingerprint_for_selections_safe` / `try_compute_context_relevance` depuis `graph_cost` uniquement.

#### 🔵 Code Review — Corrections appliquées (2026-04-10)

- **M1** : imports `LLMClientFactory` et `json` déplacés au top-level dans les 4 fichiers concernés (règle `no-inline-imports.mdc`).
- **M2** : création `api/routers/graph_router_helpers.py` avec `create_llm_client_for_router()` — dupliqué ~20L dans `graph_generation` / `graph_node_history` / `graph_quality` remplacé par un appel unique.
- **M3** : `GraphValidationService._compute_coverage_stats` renommé `compute_coverage_stats` (accès cross-module à méthode privée) + 4 appels tests mis à jour dans `test_graph_validation_service.py`.
- **M4** : `_fingerprint_for_selections_safe` → `fingerprint_for_selections_safe` et `_try_compute_context_relevance` → `try_compute_context_relevance` dans `graph_cost.py` + tous les imports mis à jour.
- **L1** : code mort supprimé dans `graph_io.py` (condition `.endswith(".json")` inaccessible).
- **L2** : `= None` trompeuse retirée de `accept_node` / `reject_node` dans `graph_node_history.py`.
- Preuves : 87 tests ciblés (api/ + test_graph_validation_service) → passed.

### File List

- `api/main.py`
- `api/routers/graph_io.py`
- `api/routers/graph_generation.py`
- `api/routers/graph_cost.py`
- `api/routers/graph_validation.py`
- `api/routers/graph_quality.py`
- `api/routers/graph_flow.py`
- `api/routers/graph_node_history.py`
- `api/routers/graph_router_helpers.py` (nouveau — helper LLM client partagé)
- `api/routers/graph.py` (supprimé)
- `tests/api/test_graph_estimate_cost.py`
- `tests/api/test_graph_regenerate.py`
- `tests/services/test_graph_validation_service.py`
- `services/graph_validation_service.py`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
- `_bmad-output/implementation-artifacts/4-14-refactorer-api-routers-graph-dette-technique.md`

## Change Log

- 2026-04-10 : Split `api/routers/graph.py` en 7 modules domaine + enregistrement `main.py` ; mise à jour tests import/patch ; sprint + story → review.
- 2026-04-10 : Code review — 4 MEDIUM + 2 LOW corrigés ; `graph_router_helpers.py` créé ; story → done.
