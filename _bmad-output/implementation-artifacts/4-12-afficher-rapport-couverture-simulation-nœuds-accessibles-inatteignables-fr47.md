# Story 4.12 : Afficher rapport couverture simulation (FR47)

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **utilisateur créant des dialogues**,
I want **voir un rapport de couverture après chaque simulation de flux (% nœuds accessibles, inatteignables)**,
so that **je peux évaluer la complétude du dialogue d'un coup d'œil et identifier les zones à améliorer**.

## Acceptance Criteria

1. **Given** la simulation de flux est lancée (Story 4.11), **When** la réponse arrive, **Then** `SimulateFlowResponse` inclut un objet `coverage` avec : `total_nodes` (nœuds contenu = non-END, non-testNode), `accessible_count`, `dead_end_count`, `cul_de_sac_count`, `coverage_percentage` (float arrondi à 1 décimale) ; un graphe sans nœud d'entrée résolu retourne `coverage.total_nodes == 0` et `coverage_percentage == 100.0`.
2. **Given** `FlowSimulationPanel` reçoit la réponse de simulation, **When** `coverage` est présent, **Then** une section « Couverture » affiche : pourcentage en badge coloré (vert ≥ 90 %, orange 70–89 %, rouge < 70 %), fraction `accessible/total`, comptes dead ends et cul-de-sacs ; si `coverage` est absent ou `total_nodes == 0`, la section ne s'affiche pas.
3. **Given** tous les nœuds contenu sont accessibles, **When** la simulation est lancée, **Then** `coverage_percentage == 100.0` et le badge est vert.
4. **Given** la couverture est < 70 %, **When** le badge s'affiche en rouge, **Then** aucun message bloquant n'est émis — l'indicateur est informatif uniquement.
5. **Tests** : **pytest** ciblé `simulate-flow` (coverage stats sur fixtures synthétiques) ; **Vitest** (`FlowSimulationPanel` avec section couverture) ; `npm --prefix frontend run lint` sans régression.

## Tasks / Subtasks

- [x] Task 1 : Backend — `FlowCoverageStats` dans `SimulateFlowResponse` (AC: #1, #3)
  - [x] 🔴 Test échoue : `POST /simulate-flow` avec graphe 5 nœuds dialogue + 1 END + 2 inatteignables → `response.coverage.total_nodes == 5`, `coverage.dead_end_count == 2`, `coverage.accessible_count == 3`, `coverage.coverage_percentage == 60.0` ; graphe 3 nœuds tous accessibles → `coverage_percentage == 100.0` ; graphe sans START → `coverage.total_nodes == 0`, `coverage_percentage == 100.0`.
  - [x] 🟢 Implémenter `FlowCoverageStats` (schema Pydantic) + `_compute_coverage_stats(nodes, dead_end_ids, cul_de_sac_count)` dans `GraphValidationService` + ajout champ `coverage` à `SimulateFlowResponse` + mise à jour du router `simulate_flow` (3 lignes : extract dead_end_ids + calcul + passage au constructeur) (voir Dev Notes).
  - [x] 🔵 Refactor : nommage tests OK (`test_coverage_excludes_end_and_test_nodes`, `test_full_coverage_when_all_reachable`) ; constante `_NON_CONTENT_NODE_TYPES` extraite au niveau module (`frozenset`) ; pas de boucle redondante avec `_validate_dead_ends` (rôles distincts).

- [x] Task 2 : Frontend — `CoverageSection` dans `FlowSimulationPanel` (AC: #2, #4, #5)
  - [x] 🔴 Test échoue : rendu `FlowSimulationPanel` avec `coverage = { total_nodes: 10, accessible_count: 7, dead_end_count: 3, cul_de_sac_count: 1, coverage_percentage: 70.0 }` → badge « 70% » visible avec classe/attribut orange ; texte « 7 / 10 » présent ; `coverage_percentage: 95.0` → badge vert ; `coverage_percentage: 65.0` → badge rouge ; `coverage` absent → section couverture non rendue.
  - [x] 🟢 Ajout `FlowCoverageStats` à `frontend/src/types/graph.ts` + mise à jour `SimulateFlowResponse` interface ; créer `CoverageSection.tsx` (sous-composant dédié dans `frontend/src/components/graph/`) + intégration dans `FlowSimulationPanel` (voir Dev Notes).
  - [x] 🔵 Refactor : `COVERAGE_COLOR_THRESHOLDS` extrait en constante module-private dans `CoverageSection.tsx` ; cas Vitest nommés d'après seuil observable (`renders green badge for 95% coverage`) ; lint 0 warning.

## Dev Notes

- **Architecture guardrails :**
  - `api/routers/graph.py` (1709 L) — **fichier chaud critique** : changements limités à 2 lignes max dans `simulate_flow()` (appel `_compute_coverage_stats` + ajout `coverage=` dans le constructeur). Aucune logique dans le router.
  - `api/schemas/graph.py` (506 L) — **fichier chaud** : ajouter `FlowCoverageStats` model (~12 L) + champ `coverage: Optional[FlowCoverageStats] = None` dans `SimulateFlowResponse`. Rester concis.
  - `services/graph_validation_service.py` (767 L) — **fichier chaud** : ajouter `_compute_coverage_stats(nodes, dead_end_count, cul_de_sac_count) -> "FlowCoverageStats"` comme méthode statique privée (~15 L). `FlowCoverageStats` peut être importé depuis `api/schemas/graph.py` ou défini comme dataclass locale (préférer l'import pour cohérence Pydantic).
  - `GraphEditorHeader.tsx` (1207 L) — **ne pas modifier** dans cette story.
  - `FlowSimulationPanel.tsx` (234 L) — ajouter `CoverageSection` en sous-composant séparé (`CoverageSection.tsx`) pour rester sous 300 L dans chaque fichier touché.

- **Définition `total_nodes`** : nœuds dont `data.type not in ("end", "testNode")`. Les testNodes sont des vues synthétiques (hors scope utilisateur) ; END est un terminateur. Cette définition est cohérente avec ce que `_validate_dead_ends` cible déjà.

- **`coverage_percentage`** : `round(accessible_count / total_nodes * 100, 1) if total_nodes > 0 else 100.0`. Edge case `total_nodes == 0` (graphe vide ou sans nœud d'entrée) → 100.0 (pas de panique, pas de division par zéro).

- **Pas d'historique dans cette story** : le champ `Historique` du rapport (évolution couverture dans le temps) est hors scope — reporter à une story dédiée si nécessaire. Le rapport est calculé à la demande uniquement.

- **Pas de nouvelle dépendance charting** : pas de Chart.js ni de Recharts. Le badge coloré + fraction textuelle est suffisant (KISS). La visualisation camembert est hors scope pour ce MVP.

- **Frontend patterns à réutiliser** : `FlowSimulationPanel.tsx` (234 L) comme base ; `SimulationItemList` générique existant pour listes dead ends/cul-de-sacs. `CoverageSection.tsx` = sous-composant autonome, même style que les sections existantes du panneau.

- **Qualité bar** : couvrir en test — (a) badge vert/orange/rouge selon seuil, (b) absence de section quand `coverage` manquant, (c) valeurs `total_nodes`, `accessible_count` affichées.

- **Refactor bar (defaults)** : `~300 lignes` max par fichier source touché dans une tâche, `~60 lignes` par fonction, nommage domaine, responsabilité unique des unités exportées.

- **Fichiers chauds :**
  - `api/routers/graph.py` (1709 L) — handler ≤ 30 lignes (déjà dépassé à ~44 L avant cette story) ; changements minimalistes uniquement.
  - `api/schemas/graph.py` (506 L) — ne pas dépasser 525 L au total.
  - `services/graph_validation_service.py` (767 L) — rester sous 790 L.
  - `GraphEditorHeader.tsx` (1207 L) — **ne pas toucher**.

- **Conventions** : nommage snake_case backend / camelCase frontend ; `Optional[FlowCoverageStats]` pour rétrocompatibilité (réponse existante non cassée si `coverage=None` par défaut) ; tests sans noms GDD réels.

### Project Structure Notes

- **Backend :**
  - `api/schemas/graph.py` — nouveau model `FlowCoverageStats`, mise à jour `SimulateFlowResponse`
  - `services/graph_validation_service.py` — nouvelle méthode statique `_compute_coverage_stats`
  - `api/routers/graph.py` — 2 lignes dans `simulate_flow()` handler uniquement
  - `tests/api/test_graph_validate.py` — extension `TestSimulateFlowEndpoint` (classe additive)
  - `tests/services/test_graph_validation_service.py` — extension `TestSimulateFlow` ou nouvelle classe `TestComputeCoverageStats`

- **Frontend :**
  - `frontend/src/types/graph.ts` — ajout `FlowCoverageStats` interface + mise à jour `SimulateFlowResponse`
  - `frontend/src/components/graph/CoverageSection.tsx` — **nouveau** sous-composant (≤ 80 L)
  - `frontend/src/components/graph/FlowSimulationPanel.tsx` — intégration `CoverageSection`
  - `frontend/src/__tests__/FlowSimulationPanel.test.tsx` — extension tests couverture

### References

- [Source: `_bmad-output/planning-artifacts/epics/epic-04.md` — Story 4.12, FR47]
- [Source: `_bmad-output/implementation-artifacts/4-11-simuler-flux-dialogue-pour-détecter-dead-ends-fr46.md` — Dev Notes, File List, Completion Notes]
- [Source: `api/schemas/graph.py` L265-286 — `SimulateFlowRequest`, `SimulateFlowResponse`]
- [Source: `services/graph_validation_service.py` L539-578 — `simulate_flow()`, pattern `_validate_dead_ends`]
- [Source: `api/routers/graph.py` L893-944 — endpoint `/simulate-flow`, pattern de construction de réponse]
- [Source: `frontend/src/components/graph/FlowSimulationPanel.tsx` — composant existant 234 L, `SimulationItemList`]
- [Source: `_bmad-output/project-context.md` — règles FastAPI, Pydantic v2, tests sans GDD]

## Dev Agent Record

### Agent Model Used

claude-4.6-sonnet-medium-thinking

### Debug Log References

### Completion Notes List

**Task 1 — Backend FlowCoverageStats :**
- `api/schemas/graph.py` : ajout `FlowCoverageStats` (Pydantic model, ~18L) + champ `coverage: Optional[FlowCoverageStats]` dans `SimulateFlowResponse`. Rétrocompatible (default=None).
- `services/graph_validation_service.py` : `_compute_coverage_stats(nodes, dead_end_ids, cul_de_sac_count)` méthode statique privée (~30L). Exclut `endNode`, `testNode`, `startNode` via constante de module `_NON_CONTENT_NODE_TYPES`. Gère division par zéro (`total_nodes==0` → 100.0). Reçoit les IDs réels pour filtrer les dead ends non-contenu.
- `api/routers/graph.py` : 3 lignes ajoutées dans `simulate_flow()` — extract `dead_end_ids`, calcul `coverage`, passage au constructeur. Router < 30L ajoutées.
- 🔵 Refactor: `_NON_CONTENT_NODE_TYPES` → `frozenset` module-level ; tests nommés par intention observée.

**Task 2 — Frontend CoverageSection :**
- `frontend/src/types/graph.ts` : ajout `FlowCoverageStats` interface + champ `coverage?: FlowCoverageStats` dans `SimulateFlowResponse`.
- `frontend/src/components/graph/CoverageSection.tsx` : sous-composant autonome (71L). Badge coloré `data-color` (green/orange/red), fraction accessible/total, comptes dead ends et cul-de-sacs. Guard `total_nodes === 0` → `null`.
- `frontend/src/components/graph/FlowSimulationPanel.tsx` : import `CoverageSection` + rendu conditionnel si `last.coverage` présent.
- 🔵 Refactor: `COVERAGE_COLOR_THRESHOLDS` constante module-private ; seuils testables via `data-color` attribute ; lint 0 warning.

**Tests ajoutés :**
- `tests/api/test_graph_validate.py` : classe `TestSimulateFlowCoverage` (5 tests endpoint)
- `tests/services/test_graph_validation_service.py` : classe `TestComputeCoverageStats` (4 tests unitaires)
- `frontend/src/__tests__/FlowSimulationPanel.test.tsx` : describe `CoverageSection (FR47)` (6 tests Vitest)

**Métriques finales :** 49 pytest passed ; 12 Vitest passed ; lint 0 error/warning.

**Code Review (2026-04-09) — Amelia :**
- M1 corrigé : `api/schemas/graph.py` 528→525 L (docstring `FlowCoverageStats` condensé).
- M2 corrigé : `services/graph_validation_service.py` 808→789 L (docstrings `simulate_flow`, `_compute_coverage_stats`, `_validate_dead_ends`, `_validate_cul_de_sacs`, `_resolve_graph_entry_node_id` condensés).
- Issues LOW (L1–L5) documentées, non bloquantes.
- 9 pytest + lint 0 après corrections.

### File List

- `api/schemas/graph.py`
- `services/graph_validation_service.py`
- `api/routers/graph.py`
- `tests/api/test_graph_validate.py`
- `tests/services/test_graph_validation_service.py`
- `frontend/src/types/graph.ts`
- `frontend/src/components/graph/CoverageSection.tsx` (nouveau)
- `frontend/src/components/graph/FlowSimulationPanel.tsx`
- `frontend/src/__tests__/FlowSimulationPanel.test.tsx`
