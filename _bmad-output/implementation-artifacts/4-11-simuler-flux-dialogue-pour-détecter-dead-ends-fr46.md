# Story 4.11 : Simuler flux dialogue pour détecter dead ends (FR46)

Status: ready-for-dev



## Story

As a **utilisateur créant des dialogues**,
I want **simuler le flux de dialogue pour détecter les dead ends (nœuds inatteignables) et les cul-de-sacs (nœuds sans sortie hors END)**,
so that **je peux garantir que tous les chemins narratifs sont accessibles au joueur et qu'aucun chemin ne se termine de manière involontaire**.

## Acceptance Criteria

1. **Given** un dialogue avec un nœud dont aucun chemin depuis START n'y mène, **When** la simulation de flux est lancée (`POST .../simulate-flow`), **Then** ce nœud est retourné comme **dead end** (sévérité `error`) avec un message identifiant son `stableId` ; un dialogue entièrement valide retourne des listes vides sans erreur HTTP.
2. **Given** un dialogue avec un nœud atteignable depuis START mais dont **toutes les connexions sortantes aboutissent à END** (ou aucune connexion sortante hors END), **When** la simulation est lancée, **Then** ce nœud est retourné comme **cul-de-sac** (sévérité `warning`, non-bloquant) ; les nœuds END eux-mêmes ne sont pas marqués cul-de-sac.
3. **Given** plusieurs dead ends ou cul-de-sacs, **When** la simulation est lancée, **Then** **tous** sont retournés dans la réponse ; la simulation se termine en **< 1 s** sur un graphe de 500+ nœuds.
4. **Given** le frontend affiche le panneau `FlowSimulationPanel`, **When** la réponse arrive, **Then** les dead ends (erreurs) et cul-de-sacs (warnings) sont affichés dans des listes distinctes avec icône, count et message ; un **clic** sur un item déclenche `requestFitViewOnNodeIds` sur le nœud concerné (même pattern que les autres panneaux validation).
5. **Given** l'utilisateur corrige un dead end (crée une connexion vers le nœud), **When** une sauvegarde du graphe est effectuée ou la simulation est manuellement relancée, **Then** la liste est **mise à jour** et l'item disparu ne s'affiche plus.
6. **Tests** : **pytest** (simulation sur fixtures synthétiques — pas de noms GDD réels) ; **Vitest** (`FlowSimulationPanel` + `pruneGraphValidationDiagnostics`) ; `npm --prefix frontend run lint` sans régression.

## Tasks / Subtasks

- **Task 1** : Endpoint `POST /simulate-flow` — détection dead ends + cul-de-sacs (AC: #1, #2, #3, #6)
  - 🔴 Test échoue : `POST /simulate-flow` avec graphe contenant un nœud inatteignable → corps de réponse avec au moins un item `type: "dead_end_node"`, `severity: "error"` ; graphe avec nœud atteignable sans sortie hors END → item `type: "cul_de_sac_node"`, `severity: "warning"` ; graphe entièrement valide → listes `dead_ends` et `cul_de_sacs` vides, HTTP 200.
  - 🟢 Implémenter `_validate_dead_ends` + `_validate_cul_de_sacs` dans `GraphValidationService` (réutiliser `_find_reachable_nodes` + `_resolve_graph_entry_node_id`) ; endpoint `POST /simulate-flow` dans `api/routers/graph.py` ; schéma Pydantic `SimulateFlowRequest` / `SimulateFlowResponse` (voir Dev Notes).
  - 🔵 Refactor : si `_validate_dead_ends` et `_validate_unreachable_nodes` se recoupent, extraire un helper BFS unique ; nommer les cas pytest d'après le comportement observable (ex. `test_unreachable_node_is_dead_end`), pas d'après le chemin de code.
- **Task 2** : Frontend — `FlowSimulationPanel` + intégration labels / topology (AC: #4, #5, #6)
  - 🔴 Test échoue : rendu `FlowSimulationPanel` avec 2 dead ends et 1 cul-de-sac → affiche count `"2 dead ends"`, count `"1 cul-de-sac"` et les messages correspondants ; clic sur item dead end → `requestFitViewOnNodeIds` appelé avec le bon `nodeId` ; rendu avec réponse vide → aucun item affiché, message "Aucun problème détecté".
  - 🟢 Créer `FlowSimulationPanel.tsx` (dans `frontend/src/components/graph/`) + ajouter `dead_end_node` et `cul_de_sac_node` à `validationPanelLabels.ts`, `graphStructuralValidation.ts` (style orange/rouge), `graphValidationSummary.ts` (`summarizeGraphValidationWarnings`) et `pruneGraphValidationDiagnostics.ts` ; connecter au toolbar / bouton validation existant (même discipline que `GraphContextDroppingPanel`, `GraphAiSlopPanel`).
  - 🔵 Refactor : si `FlowSimulationPanel` dépasse ~300 lignes, extraire la liste dead ends et la liste cul-de-sacs en sous-composants ; vérifier que les cas de test Vitest nomment les behaviors (`renders dead end count`, `navigates on item click`).

## Dev Notes

- **Réutiliser impérativement** : `_find_reachable_nodes(start_id, edges)` et `_resolve_graph_entry_node_id(nodes)` dans `GraphValidationService` (BFS forward déjà validé par 4-5/4-6). Ne pas dupliquer la logique de résolution du nœud d'entrée.
- `**_validate_unreachable_nodes` existant** : est déjà appelé dans `validate_graph()`; la nouvelle méthode `_validate_dead_ends` peut en partager le résultat (passer le set `reachable` en paramètre ou extraire le calcul). Objectif : zéro BFS redondant.
- **Définition cul-de-sac** : nœud dialogue **atteignable** dont toutes les arêtes sortantes pointent vers un nœud de type END (ou absence totale d'arêtes sortantes pour un nœud non-END). Ne pas déclencher sur les TestNodes ni sur END lui-même.
- **Schéma réponse** : suivre la convention `ValidationResult` (`errors: List[ValidationError]`, `warnings: List[ValidationError]`) déjà utilisée par `/validate` pour cohérence — ou exposer deux listes nommées `dead_ends` / `cul_de_sacs` si la lisibilité API le justifie (documenter le choix dans le fichier schemas).
- **Endpoint** : `POST /api/v1/unity-dialogues/graph/simulate-flow` ; corps identique à `/validate` (`SimulateFlowRequest` avec `nodes` + `edges`) ; pas d'appel LLM.
- **Performance** : BFS est O(V+E) — aucun algorithme polynomial supplémentaire. Tester avec fixture synthétique 500 nœuds pour valider < 1 s (assert `time < 1.0` dans le test d'intégration si faisable).
- **Frontend patterns** : `GraphAiSlopPanel.tsx`, `GraphContextDroppingPanel.tsx` et `CyclesSummary.tsx` sont les références directes pour l'intégration toolbar / état Zustand / click-to-focus. Ne pas introduire de `CustomEvent` ou dispatch `window` — utiliser `graphViewStore.requestFitViewOnNodeIds()`.
- **Pruning** : `pruneGraphValidationDiagnostics.ts` doit gérer `dead_end_node` et `cul_de_sac_node` lors de suppressions de nœuds.
- **Tests** : fixtures synthétiques uniquement (`nodeA → nodeB → END` ; `nodeC` isolé, etc.) — aucun nom GDD réel. Voir `tests/api/test_graph_validate.py` pour le pattern de test API existant (classe `TestGraphValidate`, méthodes additive).

### Project Structure Notes

- Backend : `services/graph_validation_service.py` (extension additive), `api/routers/graph.py` (nouveau endpoint), `api/schemas/graph.py` ou module dédié, `tests/api/test_graph_validate.py`, `tests/services/test_graph_validation_service.py`.
- Frontend : `frontend/src/components/graph/FlowSimulationPanel.tsx` (+ test), `frontend/src/utils/graphValidationSummary.ts`, `frontend/src/utils/graphStructuralValidation.ts`, `frontend/src/utils/pruneGraphValidationDiagnostics.ts`, `frontend/src/components/graph/validationPanelLabels.ts`.
- Données : aucun fichier persisté (résultat calculé à la demande, pas de rapport stocké — voir Story 4.12 pour le rapport de couverture).

### References

- [Source: `_bmad-output/planning-artifacts/epics/epic-04.md` — Story 4.11, FR46]
- [Source: `services/graph_validation_service.py` — `_find_reachable_nodes`, `_validate_unreachable_nodes`, `_resolve_graph_entry_node_id`]
- [Source: `api/routers/graph.py` — router prefix `/api/v1/unity-dialogues/graph`, patterns endpoint existants]
- [Source: `frontend/src/components/graph/GraphAiSlopPanel.tsx`, `GraphContextDroppingPanel.tsx`, `CyclesSummary.tsx`]
- [Source: `frontend/src/utils/pruneGraphValidationDiagnostics.ts`, `graphStructuralValidation.ts`, `graphValidationSummary.ts`]
- [Source: `_bmad-output/project-context.md`]
- [Source: `_bmad-output/implementation-artifacts/4-10-configurer-règles-validation-anti-context-dropping-fr45.md` — pattern Dev Notes, discipline états Zustand]

## Dev Agent Record

### Agent Model Used

*(à compléter par l'agent dev)*

### Debug Log References

### Completion Notes List

### File List

## Architecture Compliance

- **FastAPI** : Router mince — logique dans `services/`; injection via `ServiceContainer` / `api/dependencies.py` ; pas de singleton global.
- **React** : Zustand + hooks ; pas de `CustomEvent` ni de `window` dispatch ; `graphViewStore.requestFitViewOnNodeIds()` pour navigation.
- **Windows-first** : `pathlib.Path`, UTF-8 (pas d'I/O fichier dans cette story — applicable si ajout futur de rapport persisté).

## Library / Framework Requirements

- Python : stdlib (`collections.deque` pour BFS) + Pydantic v2 — aucune dépendance nouvelle.
- Frontend : composants et tokens UI alignés sur les panneaux validation existants ; pas de nouvelle bibliothèque graphique (rapport visuel réservé à Story 4.12).

## File Structure Requirements

- Limite **~300 lignes** par fichier source touché ; découper en sous-composants ou helpers si dépassé.

## Testing Requirements

- `pytest` ciblé sur `services/graph_validation_service.py` + route `simulate-flow`.
- `vitest` ciblé sur `FlowSimulationPanel.test.tsx` + `pruneGraphValidationDiagnostics.test.ts`.
- `npm --prefix frontend run lint` sans régression (ESLint max-warnings 0).
- Tiers : `.cursor/commands/test-tiers.md`, `.cursor/rules/workflow.mdc`.

## Previous Story Intelligence

- **4.10 (ready-for-dev)** : pattern `ContextDroppingRulesEditor`, persistance `data/…/rules.json`, discipline états Zustand distincts par panneau — reprendre la même discipline pour `FlowSimulationPanel`.
- **4.9 (done)** : `GraphContextDroppingPanel` — référence directe pour intégration toolbar / Zustand / click-to-focus.
- **4.6 (done)** : `_validate_cycles` + `CyclesSummary` + `layoutIntentionalCycles` — pattern extraction sous-composant, `pruneGraphValidationDiagnostics` étendu de manière additive.
- **4.5 (done)** : `_validate_orphan_nodes` + `_validate_unreachable_nodes` (BFS) — la story 4.11 **réutilise** ce BFS, ne le réécrit pas.
- **Fichiers chauds** : `services/graph_validation_service.py`, `api/routers/graph.py`, `frontend/src/utils/pruneGraphValidationDiagnostics.ts`, `frontend/src/components/graph/validationPanelLabels.ts`, `frontend/src/utils/graphValidationSummary.ts`.

## Git Intelligence Summary

- Commits récents : **FR44** context dropping, **FR43** AI slop, **FR42** LLM judge — chaque feature ajoute un panneau Zustand + endpoint + service dédié avec zéro régression sur les autres. Story 4.11 suit le même modèle additive.
- Pattern commits : `feat(validation): FR4X description` — convention à respecter.

## Latest Tech Information

- Stack actuelle : FastAPI 0.104+, Pydantic v2, React 18.2, Zustand 4.4, Vitest 4.0.16. Aucune mise à niveau requise.
- BFS Python avec `collections.deque` — O(V+E), largement suffisant pour 500+ nœuds < 1 s.

## Project Context Reference

- `_bmad-output/project-context.md` — API documents vs unity-dialogues, tests sans GDD réel, logique métier hors routers, injection `ServiceContainer`.

## Story completion status

**Statut :** ready-for-dev  
**Note :** Ultimate context engine analysis completed — story 4.11 FR46 ; s'appuie sur le BFS existant (`_find_reachable_nodes`) et les patterns établis dans 4-5/4-6/4-9/4-10 pour ajouter simulation de flux (dead ends + cul-de-sacs) sans régression.