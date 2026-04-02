# Story 2.10: Sélection multiple nœuds (shift-click, lasso selection) (FR31)

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **utilisateur créant des dialogues**,
I want **sélectionner plusieurs nœuds en même temps (shift-click, lasso selection)**,
so that **je peux appliquer des opérations en lot sur plusieurs nœuds**.

## Acceptance Criteria

1. **Given** je suis dans l'éditeur de graphe  
   **When** je clique sur un nœud, puis shift-clic sur un autre nœud  
   **Then** les deux nœuds sont sélectionnés (highlight visuel)  
   **And** un compteur s'affiche "X nœuds sélectionnés" (toolbar ou badge)

2. **Given** je veux sélectionner plusieurs nœuds avec le lasso  
   **When** je maintiens le clic sur le fond (pane) et dessine un rectangle de sélection  
   **Then** tous les nœuds dans le rectangle sont sélectionnés  
   **And** le rectangle de sélection est visible pendant le drag

3. **Given** j'ai plusieurs nœuds sélectionnés  
   **When** je déplace un nœud sélectionné (drag)  
   **Then** tous les nœuds sélectionnés se déplacent ensemble (groupe)  
   **And** les positions relatives entre nœuds sont préservées

4. **Given** j'ai plusieurs nœuds sélectionnés  
   **When** j'applique une opération (supprimer, taguer, valider — voir Story 2.11)  
   **Then** l'opération s'applique à tous les nœuds sélectionnés  
   **And** un message de confirmation s'affiche "Opération appliquée à X nœuds"

5. **Given** je clique sur un espace vide du graphe (pane)  
   **When** je clique sur le pane  
   **Then** la sélection multiple est désélectionnée  
   **And** tous les nœuds reviennent à l'état normal (et `selectedNodeId` peut être mis à null selon politique UX)

## Tasks / Subtasks

- [x] Task 1 : État `selectedNodeIds` et actions dans le store (AC: #1, #2, #5)
  - [x] 1.1 (TDD) Test : `setSelectedNodes(['a','b'])` → `selectedNodeIds` contient a et b ; `clearSelection()` → `selectedNodeIds === []` ; cohérence avec `selectedNodeId` (single vs multi)
  - [x] 1.2 Dans `frontend/src/store/types/graphState.ts`, ajouter `selectedNodeIds: string[]` (liste des IDs sélectionnés pour multi-sélection)
  - [x] 1.3 Dans `frontend/src/store/slices/uiSlice.ts` (ou slice dédié si préféré), ajouter `selectedNodeIds: []`, `setSelectedNodes(nodeIds: string[])`, `clearSelection()` ; garder `selectedNodeId` pour la sélection simple (NodeEditorPanel, etc.) — définir politique : en multi-sélection, `selectedNodeId` = premier de la liste ou dernier cliqué selon UX

- [x] Task 2 : React Flow multi-sélection et sync store (AC: #1, #2, #5)
  - [x] 2.1 (TDD) Test : quand `multiSelectionKeyCode="Shift"` et `selectionOnDrag={true}`, shift-click ajoute des nœuds à la sélection ; `onSelectionChange` est appelé avec les nodes sélectionnés ; clic pane appelle `onPaneClick` et doit clear la sélection
  - [x] 2.2 Dans `GraphCanvas.tsx`, ajouter sur `<ReactFlow>` : `multiSelectionKeyCode="Shift"`, `selectionOnDrag={true}`, `onSelectionChange={callback}`. Dans le callback : extraire `nodeIds` des nodes sélectionnés, appeler `setSelectedNodes(nodeIds)` ; si 0 ou 1 nœud, mettre à jour aussi `setSelectedNode(id | null)` pour cohérence avec NodeEditorPanel
  - [x] 2.3 Passer les nodes avec `selected: true` pour les IDs dans `selectedNodeIds` (dérivation dans le `useMemo` des nodes enrichis — actuellement `selected: node.id === selectedNodeId` ; étendre à `selectedNodeIds.includes(node.id)` ou garder un seul `selectedNodeId` si politique = un seul "actif" pour l’éditeur). Décision : React Flow gère le visuel via ses props ; le store reflète la sélection pour Story 2.11 (batch ops)

- [x] Task 3 : Déplacement en groupe (AC: #3)
  - [x] 3.1 (TDD) Test : quand plusieurs nœuds sont sélectionnés et on drag l’un d’eux, `onNodeDragStop` est appelé ; le store doit appeler `updateNodePosition` pour chaque nœud sélectionné avec la position finale (delta appliqué à tous)
  - [x] 3.2 Dans `GraphCanvas.tsx`, dans `onNodeDragStop` : si `selectedNodeIds.length > 1` et `node.id` est dans `selectedNodeIds`, calculer le delta (position actuelle du node dragué moins position au drag start) ; pour chaque autre ID dans `selectedNodeIds`, récupérer la position actuelle du store, ajouter le delta, appeler `updateNodePosition(id, newPosition)`. Utiliser `onNodeDragStart` pour stocker les positions de départ des nœuds sélectionnés (ref ou state)
  - [x] 3.3 Appeler `markDirty()` une fois après toutes les mises à jour de position (auto-save ADR-006)

- [x] Task 4 : Compteur "X nœuds sélectionnés" et clic pane (AC: #1, #5)
  - [x] 4.1 (TDD) Test : quand `selectedNodeIds.length > 1`, un badge ou texte "X nœuds sélectionnés" est visible (toolbar GraphEditor ou proche du graphe) ; clic sur le pane (onPaneClick) appelle `clearSelection()` et `setSelectedNode(null)`
  - [x] 4.2 Dans `GraphEditor.tsx`, afficher un indicateur "X nœuds sélectionnés" quand `selectedNodeIds.length > 1` (toolbar ou sous les contrôles)
  - [x] 4.3 Dans `GraphCanvas.tsx`, dans `onPaneClick` existant : en plus du comportement actuel (fermeture menu contextuel, etc.), appeler `clearSelection()` et `setSelectedNode(null)` pour désélectionner tout

## Dev Notes

- **Objectif US (vérification existant) :** **Nouvelle fonctionnalité.** Aucune sélection multiple actuellement : pas de `multiSelectionKeyCode`, `selectionOnDrag`, ni `selectedNodeIds` dans la codebase. Seule la sélection simple `selectedNodeId` existe (uiSlice, GraphCanvas useMemo `selected: node.id === selectedNodeId`).
- **ÉTENDRE** `GraphCanvas.tsx` : ajouter `multiSelectionKeyCode="Shift"`, `selectionOnDrag={true}`, `onSelectionChange` sur `<ReactFlow>`. Synchroniser la sélection React Flow → store `selectedNodeIds`.
- **CRÉER** `selectedNodeIds` et `setSelectedNodes` / `clearSelection` dans le store (recommandé : `uiSlice.ts` — même fichier que `setSelectedNode`, `graphFilters` Story 2.9).
- React Flow gère le rendu visuel de la multi-sélection nativement ; il faut lui passer les nodes avec `selected: true` pour les IDs dans `selectedNodeIds`. Actuellement le useMemo dans GraphCanvas fait `selected: node.id === selectedNodeId` — remplacer ou étendre par `selected: selectedNodeIds.includes(node.id)` pour que la multi-sélection soit reflétée même quand la sélection vient du lasso/Shift (React Flow envoie les changements via `onSelectionChange`).
- Déplacement groupe : React Flow appelle `onNodeDragStop(_event, node)` avec le nœud dragué uniquement. Il faut soit utiliser `onNodesChange` avec des changements de type position pour tous les nœuds déplacés (si React Flow les émet), soit en `onNodeDragStart` sauvegarder les positions de tous les nœuds sélectionnés, et en `onNodeDragStop` calculer le delta et appeler `updateNodePosition` pour chaque nœud sélectionné. Préférer la seconde approche pour rester en controlled mode (source de vérité = store).
- **Politique selectedNodeId vs selectedNodeIds :** NodeEditorPanel et DeleteNodeConfirmModal utilisent `selectedNodeId`. En multi-sélection, option A : `selectedNodeId` = dernier nœud cliqué (ou premier de la liste) pour que l’éditeur affiche un nœud ; option B : `selectedNodeId` = null quand plusieurs sélectionnés. Documenter le choix dans la story ; recommandation : option A pour permettre d’éditer un nœud tout en gardant les autres sélectionnés pour une action batch ensuite.

### Project Structure Notes

- **Fichiers à modifier :**
  - `frontend/src/store/types/graphState.ts` — ajouter `selectedNodeIds: string[]`
  - `frontend/src/store/slices/uiSlice.ts` — ajouter `selectedNodeIds`, `setSelectedNodes`, `clearSelection`
  - `frontend/src/components/graph/GraphCanvas.tsx` — `multiSelectionKeyCode`, `selectionOnDrag`, `onSelectionChange`, dérivation `selected` des nodes, `onNodeDragStart`/`onNodeDragStop` groupe, `onPaneClick` clear selection
  - `frontend/src/components/graph/GraphEditor.tsx` — badge/compteur "X nœuds sélectionnés"
- **Fichiers à créer :** aucun (optionnel : helper `getSelectionDelta` dans un util si logique lourde).
- **Aucun fichier backend** à créer ou modifier.

### Architecture Compliance

- **ADR-007 (React Flow controlled) :** Les positions des nœuds restent dans le store ; `onSelectionChange` et `onNodeDragStop` ne font que synchroniser la sélection et les positions vers le store. Les nodes/edges passés à `<ReactFlow>` viennent toujours du store (dérivation `nodes`/`edges` existante). Ne pas laisser React Flow "posséder" la sélection sans la refléter dans `selectedNodeIds`.
- **ADR-006 (auto-save) :** Après déplacement groupe, un seul `markDirty()` après toutes les `updateNodePosition` (éviter N appels markDirty).
- **NFR-P4 (UI Responsiveness <100ms) :** `onSelectionChange` et calcul de delta doivent rester synchrones et légers.
- **NFR-A1 (Keyboard Navigation 100%) :** Shift+click et lasso sont des interactions souris ; pas de raccourci clavier exigé pour cette story (optionnel : Escape pour clear selection — à ajouter dans useKeyboardShortcuts si cohérent avec le reste).

### Library / Framework Requirements

- **React Flow (xyflow) 11.x :** Utiliser les props officielles `multiSelectionKeyCode` (valeur `'Shift'`), `selectionOnDrag` (boolean), `onSelectionChange({ nodes, edges })`. Les nodes doivent avoir `selected: true` pour les IDs qu’on veut afficher comme sélectionnés (bidirection : store → nodes ; onSelectionChange → store).
- **Zustand :** Nouvel état `selectedNodeIds` et actions dans `uiSlice`. Accès depuis `GraphCanvas` et `GraphEditor` via `useGraphStore()`.

### File Structure Requirements

- Pas de nouveau composant pour cette story ; tout est extension de GraphCanvas + GraphEditor + uiSlice.
- Tests : `frontend/src/__tests__/graphStore.controlledMode.test.ts` — décommenter ou compléter le test "all should move together with relative positions preserved" (multiSelectionKeyCode + selectionOnDrag + batch updateNodePosition). Nouveaux tests : `graphStore.multiSelection.test.ts` (setSelectedNodes, clearSelection, sync avec selectedNodeId), intégration GraphCanvas (onSelectionChange, onNodeDragStop groupe), E2E (shift-click, lasso, drag groupe, clic pane clear).

### Testing Requirements

- **Unit (uiSlice) :** `setSelectedNodes(['a','b'])` → `selectedNodeIds` contient a et b ; `clearSelection()` → `selectedNodeIds === []` ; politique selectedNodeId quand multi (premier / dernier).
- **Unit (GraphCanvas logique) :** Si possible extraire la logique delta/drag en helper testable ; sinon tests d’intégration.
- **Intégration (GraphCanvas) :** Avec multi-sélection activée, `onSelectionChange` met à jour le store ; `onNodeDragStop` avec plusieurs sélectionnés appelle `updateNodePosition` pour chaque nœud avec les bonnes positions.
- **Controlled mode :** `frontend/src/__tests__/graphStore.controlledMode.test.ts` — le test existant qui mentionne "To implement when Story 2.10 delivers multiSelectionKeyCode and selectionOnDrag" doit passer après implémentation.
- **E2E :** Workflow : sélectionner 2 nœuds (shift-click), vérifier compteur ; dessiner lasso et vérifier sélection ; déplacer un nœud et vérifier que le groupe bouge ; clic pane et vérifier désélection.

### Previous Story Intelligence (2.9)

- **Pattern store UI :** `graphFilters`, `setFilters`, `resetFilters` dans `uiSlice.ts`. Même pattern pour `selectedNodeIds`, `setSelectedNodes`, `clearSelection`.
- **Pattern GraphCanvas :** Filtrage et dérivation des nodes dans un useMemo (ligne 216–258) ; étendre la dérivation `selected` pour prendre en compte `selectedNodeIds` en plus de `selectedNodeId`.
- **Pattern GraphEditor :** Bouton/toolbar et badge (ex. Filtres avec badge "X nœuds masqués"). Réutiliser pour "X nœuds sélectionnés" quand `selectedNodeIds.length > 1`.
- **Raccourcis :** `useKeyboardShortcuts` dans GraphEditor ; ajouter Escape pour clear selection si pas déjà utilisé pour autre chose.

### Git Intelligence Summary

- Derniers commits : Story 2.8 (Jump to Node), Story 2.9 (Filtres graphe). Convention : un commit par story, description en anglais.
- `graphStore.controlledMode.test.ts` contient déjà un test placeholder pour le déplacement groupe (multiSelectionKeyCode + selectionOnDrag) — à activer/compléter dans cette story.

### Latest Tech Information

- **React Flow 11.x :** `onSelectionChange` reçoit `{ nodes: Node[], edges: Edge[] }` (les éléments actuellement sélectionnés). Pour rester en controlled mode, les `nodes` passés à `<ReactFlow>` doivent avoir `selected: true` pour les IDs qu’on souhaite afficher comme sélectionnés ; sinon React Flow peut réinitialiser la sélection. Donc : soit on dérive `selected` depuis `selectedNodeIds` dans notre useMemo, soit on applique les changements de `onSelectionChange` au store et on re-render avec ces IDs — même résultat.
- **Lasso / selectionOnDrag :** Avec `selectionOnDrag={true}`, le drag sur le pane (sans nœud sous la souris) dessine un rectangle ; les nœuds dont la bounding box intersecte le rectangle sont sélectionnés. React Flow émet `onSelectionChange` avec ces nodes.

### Project Context Reference

- [Source: _bmad-output/planning-artifacts/epics/epic-02.md#Story-2.10] — Story 2.10 complète, AC, contraintes techniques, FR31.
- [Source: frontend/src/components/graph/GraphCanvas.tsx] — `onNodeClick`, `onPaneClick`, `onNodeDragStop`, useMemo nodes avec `selected: node.id === selectedNodeId`, props ReactFlow actuelles (sans multiSelectionKeyCode).
- [Source: frontend/src/store/slices/uiSlice.ts] — `setSelectedNode`, `selectedNodeId` ; ajouter `selectedNodeIds`, `setSelectedNodes`, `clearSelection`.
- [Source: frontend/src/__tests__/graphStore.controlledMode.test.ts] — Test "all should move together" à compléter pour Story 2.10.
- [Source: _bmad-output/planning-artifacts/architecture/v10-architectural-decisions-adrs.md#ADR-007] — GraphCanvas controlled mode ; sélection et positions doivent refléter le store.

## Dev Agent Record

### Agent Model Used

(Dev Story workflow)

### Debug Log References

(No debug halt)

### Completion Notes List

- Task 1: `selectedNodeIds`, `setSelectedNodes`, `clearSelection` dans graphState + uiSlice ; `setSelectedNode` synchronise `selectedNodeIds` (single = [id], null = []). Tests unitaires dans `graphStore.multiSelection.test.ts`.
- Task 2: React Flow `multiSelectionKeyCode="Shift"`, `selectionOnDrag`, `onSelectionChange` → `setSelectedNodes(ids)` ; nodes dérivés avec `selected: selectedNodeIds.includes(node.id)` ; `onNodesChange` type `select` met à jour la liste ; `onPaneClick` appelle `clearSelection()`.
- Task 3: `onNodeDragStart` enregistre les positions des nœuds sélectionnés dans une ref ; `onNodeDragStop` calcule le delta et appelle `updateNodePosition(id, pos, true)` pour chaque nœud sélectionné puis `markDirty()` une fois. `updateNodePosition` accepte `skipMarkDirty` (layoutSlice + graphState).
- Task 4: Badge "X nœuds sélectionnés" dans la toolbar GraphEditor (visible quand `selectedNodeIds.length > 1`). Clic pane déjà géré en Task 2.
- Test controlled mode : group-drag test réécrit en test store (batch updateNodePosition + markDirty).
- Review fix: doublon `selectedNodeIds` supprimé dans `GraphCanvas`, drag groupe synchronisé pendant le drag via buffer RAF multi-nœuds, shift-click préserve la multi-sélection, toolbar batch ajoutée dans `GraphEditor` avec feedback utilisateur, et tests d’intégration ajoutés pour GraphCanvas/GraphEditor.

### File List

- frontend/src/store/types/graphState.ts
- frontend/src/store/slices/uiSlice.ts
- frontend/src/store/slices/layoutSlice.ts
- frontend/src/components/graph/GraphCanvas.tsx
- frontend/src/components/graph/GraphEditor.tsx
- frontend/src/__tests__/graphStore.multiSelection.test.ts
- frontend/src/__tests__/graphStore.controlledMode.test.ts
- frontend/src/__tests__/GraphCanvas.multiSelection.test.tsx
- frontend/src/__tests__/GraphEditor.multiSelection.test.tsx
- _bmad-output/implementation-artifacts/sprint-status.yaml
- _bmad-output/implementation-artifacts/2-10-sélection-multiple-nœuds-shift-click-lasso-selection-fr31.md

## Senior Developer Review (AI)

- Reviewer: Marc
- Date: 2026-03-12
- Outcome: Approved after fixes
- Fixes applied:
  - `GraphCanvas.tsx` compile blocker removed (`selectedNodeIds` no longer destructured twice).
  - Group drag now buffers multiple node position updates during drag in controlled mode instead of keeping only the last node update per RAF flush.
  - Shift-click no longer collapses an existing multi-selection through `onNodeClick`.
  - `GraphEditor.tsx` now exposes batch actions for the current selection (`Tagger`, `Valider`, `Supprimer`) and displays confirmation feedback after applying an operation.
  - Integration tests now cover `onSelectionChange`, pane deselection, shift-click preservation, group drag, selection badge, batch validation, tagging, and batch delete confirmation.
- Verification:
  - `npx vitest run src/__tests__/graphStore.multiSelection.test.ts src/__tests__/graphStore.controlledMode.test.ts src/__tests__/GraphCanvas.multiSelection.test.tsx src/__tests__/GraphEditor.multiSelection.test.tsx`
  - `ReadLints` on modified files: no diagnostics
- Residual risk:
  - Frontend global `tsc --noEmit` still reports unrelated pre-existing type errors outside this story scope.

## Change Log

- 2026-03-12: Senior review fixes applied for Story 2.10. Resolved GraphCanvas compile issue, hardened controlled multi-drag synchronization, added batch action feedback in GraphEditor, and extended integration test coverage for multi-selection flows.
