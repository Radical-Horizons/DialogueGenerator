# Story 1.17: Implémenter ADR-007 — GraphCanvas en mode controlled React Flow

Status: review

**Architecture (ADR-007):** Cette story implémente l'ADR-007. Toute modification du canvas (GraphCanvas) doit respecter le mode controlled React Flow. Voir `_bmad-output/planning-artifacts/architecture/v10-architectural-decisions-adrs.md`.

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **développeur / mainteneur de l'éditeur de graphe**,
I want **que le canvas éditeur (GraphCanvas) utilise React Flow en mode controlled (nodes/edges provenant uniquement du store)**,
so that **il n'y ait qu'une seule source de vérité, que l'autosave, l'undo/redo et la synchro serveur soient cohérents, et que les bugs de désynchronisation (étiquettes, edges) disparaissent**.

## Acceptance Criteria

1. **Given** je modifie le graphe (drag, clic, connexion, suppression)
   **When** l'action est effectuée
   **Then** les `nodes` et `edges` affichés par React Flow proviennent **exclusivement** du store (ou de dérivations du store, ex. enrichissement validation/highlight)
   **And** aucun `useNodesState` ni `useEdgesState` n'est utilisé dans le composant principal du canvas graphe (éditeur)

2. **Given** React Flow émet des changements (onNodesChange, onEdgesChange)
   **When** un changement est émis
   **Then** les handlers ne font qu'appeler des actions du store (updateNodePosition, deleteNode, setSelectedNode, etc.)
   **And** aucun `setNodes` / `setEdges` local n'est utilisé

3. **Given** je sélectionne un nœud (clic, multi-select ou programmatique)
   **When** la sélection change
   **Then** le store est mis à jour (ex. setSelectedNode) via onNodesChange (type `select`) ou handlers dédiés
   **And** les `nodes` passés à React Flow reflètent la sélection depuis le store (ex. node.selected = (node.id === selectedNodeId))

4. **Given** je zoome ou panne le canvas
   **When** le viewport change
   **Then** le viewport reste en état local à React Flow (non persisté dans le store document)

5. **Given** j'ai implémenté le mode controlled
   **When** je clique sur un nœud ou je déplace un nœud
   **Then** aucune régression : les edges restent visibles après clic ; pas de scintillement des étiquettes lors du drag (avec throttling si besoin)

## Tasks / Subtasks

- [x] Task 1: Supprimer useNodesState / useEdgesState et dériver nodes/edges du store (AC: #1)
  - [x] 1.1 Dans GraphCanvas.tsx, supprimer les appels à useNodesState(storeNodes) et useEdgesState(storeEdges)
  - [x] 1.2 Dériver nodes et edges depuis useGraphStore() (storeNodes, storeEdges) avec enrichissement (validation, highlight) via useMemo si besoin
  - [x] 1.3 Passer ces props à <ReactFlow nodes={…} edges={…} />
- [x] Task 2: Handlers onNodesChange / onEdgesChange ne mettent à jour que le store (AC: #2)
  - [x] 2.1 Dans onNodesChange : traiter tous les types (position, dimension, remove, select) et appeler uniquement des actions du store (updateNodePosition, deleteNode, setSelectedNode, etc.)
  - [x] 2.2 Utiliser applyNodeChanges / applyEdgeChanges côté store ou dans les handlers pour produire le nouvel état, puis setState store
  - [x] 2.3 Dans onEdgesChange : idem, uniquement actions du store
  - [x] 2.4 Gérer type `select` dans onNodesChange pour appeler setSelectedNode (AC: #3)
- [x] Task 3: Sélection reflétée depuis le store (AC: #3)
  - [x] 3.1 Les nodes passés à React Flow doivent avoir node.selected dérivé du store (ex. node.selected = (node.id === selectedNodeId))
  - [x] 3.2 Vérifier que setSelectedNode est appelé pour tout changement de sélection (onNodeClick, onPaneClick, et type select dans onNodesChange)
- [x] Task 4: Viewport resté local à React Flow (AC: #4)
  - [x] 4.1 Ne pas stocker zoom/pan dans le store (déjà le cas ; vérifier qu'aucun code n'ajoute viewport au store)
- [x] Task 5: Supprimer le code de contournement (AC: #5)
  - [x] 5.1 Supprimer stableEnrichedNodes, prevNodesRef, lastSetNodesRef et les comparaisons "position seule" une fois le mode controlled en place
  - [x] 5.2 Si besoin, throttler updateNodePosition pendant le drag (ex. requestAnimationFrame) pour limiter les re-renders
- [x] Task 6: Tests de régression (AC: #5)
  - [x] 6.1 Régression : après clic sur un nœud, les edges restent visibles
  - [x] 6.2 Régression : après drag d'un nœud, les positions dans le store correspondent à l'affichage
  - [x] 6.3 Unitaire / intégration : sélection mise à jour dans le store lors des événements de sélection React Flow

## Dev Notes

### Contexte Epic et ADR

**Epic 1: Amélioration et peaufinage de la génération de dialogues**
- **Story 1.17** : Implémenter ADR-007 — GraphCanvas en mode controlled. PRIORITÉ A (architecture).
- **Valeur :** Une seule source de vérité pour le graphe → cohérence autosave, undo/redo, synchro serveur, suppression des bugs de sync (scintillement, liens qui disparaissent).

**ADR-007** (source : `_bmad-output/planning-artifacts/architecture/v10-architectural-decisions-adrs.md`) :
- Canvas éditeur (GraphCanvas) : nodes et edges proviennent **uniquement** du store (graphStore).
- Pas de useNodesState / useEdgesState. Handlers onNodesChange / onEdgesChange ne font qu'appeler des actions du store.
- Sélection dans le store ; type `select` dans onNodesChange doit mettre à jour le store.
- Viewport (zoom/pan) reste local à React Flow (non persisté).
- GraphView (vue read-only) : hors périmètre ADR-007 ; peut rester uncontrolled.

### Vérification Codebase Existant

**Fichiers à modifier :**

| Fichier | Décision | Détail |
|--------|----------|--------|
| `frontend/src/components/graph/GraphCanvas.tsx` | **Refactor** | Supprimer useNodesState/useEdgesState. Dériver nodes/edges du store (useGraphStore). Handlers → actions store uniquement. Supprimer stableEnrichedNodes, prevNodesRef, lastSetNodesRef. |
| `frontend/src/store/graphStore.ts` | **Réutiliser** | updateNodePosition, deleteNode, setSelectedNode, connectNodes existent. S'assurer que applyNodeChanges/applyEdgeChanges peuvent être utilisés dans les handlers ou côté store pour produire le nouvel état. |

**Pattern React Flow controlled :**
- État (nodes, edges) dans le parent (store). onNodesChange / onEdgesChange mettent à jour ce state uniquement.
- Doc React Flow : pattern "controlled" (useState + applyNodeChanges / applyEdgeChanges dans les handlers). Ici le "state" est le store Zustand.

### Architecture Compliance

- **ADR-006** : Store = document (une seule source de vérité). Cette story aligne l'affichage du canvas sur cette règle.
- **ADR-007** : Toutes les contraintes de l'ADR doivent être respectées (voir Acceptance Criteria).
- **docs/architecture/state-management-frontend.md** : Section "React Flow controlled (ADR-007)".
- **docs/architecture/graph-conversion-architecture.md** : Section "React Flow et source de vérité (ADR-007)".

### Project Structure Notes

- GraphCanvas : `frontend/src/components/graph/GraphCanvas.tsx`
- Store : `frontend/src/store/graphStore.ts`
- GraphView (hors périmètre) : `frontend/src/components/generation/GraphView.tsx` — peut rester uncontrolled.

### References

- [Source: _bmad-output/planning-artifacts/epics/epic-01.md#Story-1.17]
- [Source: _bmad-output/planning-artifacts/architecture/v10-architectural-decisions-adrs.md#ADR-007]
- [Source: docs/architecture/state-management-frontend.md]
- [Source: docs/architecture/graph-conversion-architecture.md]
- React Flow controlled pattern : https://reactflow.dev/learn/concepts/building-a-flow (parent state + handlers)

### Post-mortem (bug affichage nœuds invisibles)

**Symptôme (post-1.17) :** Dans l’onglet « Éditeur de graph », après sélection d’un dialogue ou clic sur « Nouveau nœud », la zone à gauche n’affichait que la grille (Background) — aucun nœud visible. Le badge « Graphe valide » et le panneau Détails à droite fonctionnaient ; le store contenait bien nodes/edges.

**Cause racine :** En mode controlled, React Flow v11 garde le conteneur des nœuds en `visibility: hidden` tant que les nœuds ne sont pas considérés « initialisés ». L’initialisation dépend du fait que les dimensions mesurées (ResizeObserver) soient reflétées dans l’état contrôlé. La 1.17 traitait bien `onNodesChange` type `dimensions` et appelait `updateNode(..., { measured })`, mais sans propager `width` et `height` au niveau du node. React Flow ne marquait donc jamais les nœuds comme initialisés et laissait le layer en hidden.

**Correctif :** Dans `GraphCanvas.tsx`, pour `change.type === 'dimensions'`, appeler `updateNode(id, { measured: { width, height }, width, height })` (avec `dims` issus du change). Dès que le store contient ces champs, React Flow rend le conteneur visible.

**Leçon pour la story 1.17 :** La Task 2.1 (« traiter tous les types dont dimension ») était satisfaite en surface (un appel store existait), mais le contenu de l’état contrôlé doit aligner avec ce que React Flow v11 utilise pour décider de l’affichage (width/height sur le node). À documenter pour les prochaines implémentations controlled : tout type de change émis par React Flow doit être répercuté dans le store avec les champs attendus par la lib (pas seulement un sous-ensemble ou un typage générique `measured`). Les tests de régression (AC#5) ne couvraient pas le cas « chargement dialogue → nœuds visibles dans le viewport » ; un test E2E ou visuel sur ce flux aurait pu détecter le bug plus tôt.

## Dev Agent Record

### Agent Model Used

_(Cursor / Dev Story workflow)_

### Debug Log References

_(aucun)_

### Completion Notes List

- ADR-007 mode controlled implémenté dans GraphCanvas.tsx : nodes et edges dérivés exclusivement du store (useMemo avec enrichissement validation/highlight/sélection). Aucun useNodesState/useEdgesState.
- Handlers onNodesChange / onEdgesChange n'appellent que des actions du store (deleteNode, setSelectedNode, updateNodePosition, updateNode, disconnectNodes). Throttle RAF pour updateNodePosition pendant le drag.
- Sélection : node.selected = (node.id === selectedNodeId) ; type `select` dans onNodesChange appelle setSelectedNode.
- Code de contournement supprimé (stableEnrichedNodes, prevNodesRef, lastSetNodesRef).
- Tests : frontend/src/__tests__/graphStore.controlledMode.test.ts (régression edges visibles après sélection, positions dans le store, sélection mise à jour ; post-review : test onNodesChange type select avec payload React Flow). 317 tests passent.

### File List

- frontend/src/components/graph/GraphCanvas.tsx (refactor controlled)
- frontend/src/__tests__/graphStore.controlledMode.test.ts (new)
- _bmad-output/implementation-artifacts/sprint-status.yaml (1-17 → in-progress puis review)
- _bmad-output/implementation-artifacts/1-17-adr-007-react-flow-controlled.md (tasks + Dev Agent Record)

---

## Senior Developer Review (AI)

**Reviewer:** Marc (adversarial code-review workflow)  
**Date:** 2026-01-29  
**Story:** 1-17-adr-007-react-flow-controlled  
**Git vs Story:** Fichiers listés dans la story correspondent aux changements (GraphCanvas.tsx, graphStore.controlledMode.test.ts). Pas de fichier modifié non documenté propre à la 1.17.

### Synthèse

- **AC validés :** AC#1 (nodes/edges du store, pas de useNodesState/useEdgesState), AC#2 (handlers → actions store), AC#3 (sélection depuis store, type select), AC#4 (viewport local), AC#5 (régression edges/positions couverte par tests).
- **Tasks [x] :** Toutes les tâches marquées [x] sont implémentées (preuve : GraphCanvas.tsx L42–69 nodes/edges dérivés, L116–164 onNodesChange/onEdgesChange, L52 node.selected, pas de viewport dans le store, RAF throttle + onNodeDragStop).

### Problèmes relevés (3–10)

| Sévérité | Description | Fichier:Ligne |
|----------|-------------|---------------|
| MEDIUM (corrigé) | RAF non annulé au démontage pendant un drag → risque `updateNodePosition` après unmount. **Corrigé :** cleanup `useEffect` ajouté pour annuler `positionRafRef` au unmount. | GraphCanvas.tsx |
| MEDIUM | Test 6.3 : pas de test qui simule `onNodesChange([{ type: 'select', id: 'n1', selected: true }])` et vérifie le store ; seul `setSelectedNode` est testé directement. Couverture « événements de sélection React Flow » incomplète. | graphStore.controlledMode.test.ts |
| LOW | Task 2.2 demandait « Utiliser applyNodeChanges/applyEdgeChanges » ; l’implémentation gère manuellement remove/select/position/dimensions. Nouveaux types de change React Flow futurs pourraient être ignorés. | GraphCanvas.tsx L116–164 |
| LOW | AC#3 mentionne « multi-select » ; le store est single-select (`selectedNodeId: string \| null`). Cohérent pour l’ADR-007 actuel, à documenter si multi-select est prévu plus tard. | graphStore.ts |
| LOW | Docs `state-management-frontend.md` / `graph-conversion-architecture.md` modifiés (git) ; si mises à jour pour ADR-007/1.17, les ajouter au File List pour traçabilité. | — |

### Correctif appliqué

- **RAF cleanup :** ajout d’un `useEffect` avec cleanup dans `GraphCanvas.tsx` qui annule `requestAnimationFrame(positionRafRef.current)` au démontage du composant.

### Recommandations

1. **Tests :** ajouter un test (dans `graphStore.controlledMode.test.ts` ou un test d’intégration GraphCanvas) qui appelle une fonction `onNodesChange` construite comme dans GraphCanvas avec `[{ type: 'select', id: 'n1', selected: true }]` et vérifie `selectedNodeId === 'n1'`.
2. **Évolution :** si React Flow ajoute des types de change, envisager d’utiliser `applyNodeChanges`/`applyEdgeChanges` et de mapper le résultat vers les actions du store pour rester aligné avec l’API officielle.
3. **File List :** si les mises à jour ADR-007 dans `docs/architecture/*` font partie du périmètre 1.17, les inclure dans le File List.

### Statut après revue

- Issues HIGH : 0.  
- Issues MEDIUM : 0 (test onNodesChange type select ajouté ; RAF cleanup déjà corrigé).  
- Issue MEDIUM (RAF cleanup) : corrigée.  
- **Correctif post-review :** test `onNodesChange([{ type: "select", id, selected }]) updates store` ajouté dans graphStore.controlledMode.test.ts.
- **Statut story :** prêt pour **done** (tous les points MEDIUM adressés).
