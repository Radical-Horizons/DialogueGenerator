# Story 2.4: Drag-and-drop nœuds pour réorganiser layout (FR25)

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **utilisateur créant des dialogues**,
I want **déplacer les nœuds par drag-and-drop pour réorganiser le layout du graphe**,
so that **je peux organiser visuellement le graphe selon ma préférence sans affecter la structure logique**.

## Acceptance Criteria

1. **Given** je suis dans l'éditeur de graphe  
   **When** je fais glisser un nœud avec le bouton gauche de la souris  
   **Then** le nœud suit le curseur pendant le glissement  
   **And** les connexions (edges) se mettent à jour en temps réel (redraw fluide)

2. **Given** je déplace un nœud  
   **When** je relâche le bouton de la souris  
   **Then** la nouvelle position est sauvegardée dans le dialogue  
   **And** l'auto-save (Epic 0 Story 0.5) sauvegarde la position dans les 2 minutes

3. **Given** je déplace plusieurs nœuds en sélection multiple  
   **When** je sélectionne 3 nœuds (shift-click) et les déplace  
   **Then** tous les nœuds sélectionnés se déplacent ensemble (groupe)  
   **And** les positions relatives entre nœuds sont préservées  
   **Note:** Dépend de Story 2.10 (multiSelectionKeyCode, selectedNodeIds). Si 2.10 non livré, documenter la limitation et livrer le reste (single-node drag + save).

4. **Given** je déplace un nœud près d'un autre nœud  
   **When** le nœud est proche (snap distance)  
   **Then** le nœud s'aligne automatiquement sur la grille (snap to grid)  
   **And** un indicateur visuel montre l'alignement (ligne guide) — optionnel pour cette story

5. **Given** je déplace un nœud hors du viewport  
   **When** le nœud est déplacé hors écran  
   **Then** le graphe panne automatiquement pour suivre le nœud (auto-pan)  
   **And** le nœud reste visible pendant le déplacement

## Tasks / Subtasks

- [x] Task 1: Vérifier et documenter drag single + persistance (AC: #1, #2)
  - [x] 1.1 (TDD) Étendre ou exécuter tests existants : `onNodeDragStop` appelle `updateNodePosition` ; après drag, `markDirty` déclenché ; auto-save enchaîne
  - [x] 1.2 Vérifier dans `GraphCanvas.tsx` que `onNodeDragStop` (l.388+) commite la position finale (pendingPositionRef ou node.position) via `updateNodePosition` et annule le RAF en attente
  - [x] 1.3 Vérifier que le throttle RAF (`schedulePositionUpdate`) pendant le drag est bien en place (l.283+) et que les edges redraw en temps réel
  - [x] 1.4 (TDD) Exécuter `graphStore.controlledMode.test.ts` et tests drag/position pour régression
- [x] Task 2: Déplacement en groupe (AC: #3) — conditionnel Story 2.10
  - [x] 2.1 Si Story 2.10 livrée : vérifier que `multiSelectionKeyCode="Shift"` et `selectionOnDrag={true}` sont présents sur `<ReactFlow>` et que `onNodeDragStop` met à jour la position de tous les nœuds sélectionnés via une boucle `updateNodePosition` (ou équivalent store)
  - [x] 2.2 Si Story 2.10 non livrée : documenter dans Dev Notes que l’AC #3 sera pleinement livrable après 2.10 ; pas de blocage sur le reste de la story
  - [x] 2.3 (TDD) Test : lorsque plusieurs nœuds sont sélectionnés et qu’un est déplacé, tous bougent avec préservation des positions relatives
- [x] Task 3: Snap to grid et indicateur d’alignement (AC: #4)
  - [x] 3.1 (TDD) Test : `snapToGrid={true}` et `snapGrid={[15,15]}` sont bien passés à `<ReactFlow>` (déjà présents dans GraphCanvas.tsx:381-382)
  - [x] 3.2 Vérifier visuellement ou par test que le snap est appliqué à la position finale au `onNodeDragStop`
  - [x] 3.3 (Optionnel) Ligne guide d’alignement : si temps disponible, ajouter un indicateur visuel (ligne verticale/horizontale) quand un nœud est aligné avec un autre ; sinon documenter comme amélioration future
- [x] Task 4: Auto-pan hors viewport (AC: #5)
  - [x] 4.1 Vérifier le comportement natif React Flow : drag d’un nœud hors du viewport déclenche-t-il un pan automatique ? Consulter la doc React Flow (panOnDrag, noDragClassName, etc.)
  - [x] 4.2 Si auto-pan absent : activer via prop React Flow (ex. `panOnDrag={[1, 2]}` pour boutons gauche/middle) ou documenter la limitation
  - [x] 4.3 (TDD) Test d’intégration ou E2E : déplacer un nœud vers le bord et vérifier que le viewport suit (ou documenter si non supporté nativement)
- [x] Task 5: Régression et qualité
  - [x] 5.1 Exécuter tous les tests graphe : `graphStore.controlledMode.test.ts`, `GraphCanvas.virtualization.test.tsx`, `useGraphStore.test.ts` (updateNodePosition, markDirty)
  - [x] 5.2 Vérifier qu’aucun endpoint dédié `/position` n’est créé ; persistance uniquement via `saveDialogue()` → `POST /api/v1/unity-dialogues/graph/save-and-write`

## Dev Notes

- **Objectif US (vérification existant):** Drag-and-drop, snap-to-grid, persistance via auto-save et RAF throttle sont **déjà implémentés**. L’US vise du **polish** : déplacement en groupe (dépend de 2.10), optionnellement ligne guide d’alignement et vérification auto-pan hors viewport.
- **RÉUTILISER** entièrement le mécanisme existant : `onNodeDragStop` + `updateNodePosition` + `markDirty` + auto-save. Ne pas créer d’endpoint PUT `/position` : la position est persistée dans le JSON complet via `save-and-write` (ADR-006).
- **Story 2.10** : La sélection multiple pour déplacer en groupe dépend de l’activation de `multiSelectionKeyCode` et `selectionOnDrag` dans `GraphCanvas.tsx` et de `selectedNodeIds` / `setSelectedNodes` dans le store. Si 2.10 n’est pas livrée, AC #3 reste partiellement hors scope ; documenter clairement.

### Project Structure Notes

- **Fichiers concernés :** `frontend/src/components/graph/GraphCanvas.tsx` (onNodeDragStop, schedulePositionUpdate, onNodesChange pour position, snapToGrid, snapGrid, optionnel multiSelectionKeyCode/selectionOnDrag), `frontend/src/store/graphStore.ts` ou `layoutSlice.ts` (updateNodePosition, markDirty).
- **Aucun nouveau composant** requis pour le drag single ; optionnel : composant ou overlay pour ligne guide d’alignement.
- **Architecture :** ADR-007 (controlled) : les positions sont mises à jour dans le store via `updateNodePosition` ; le canvas reflète le store. ADR-006 : persistance par auto-save global, pas d’endpoint dédié position.

### Architecture Compliance

- **ADR-007 (React Flow controlled):** Les nodes/edges et leurs positions proviennent du store. `onNodesChange` (type `position`) et `onNodeDragStop` doivent uniquement appeler des actions du store (`updateNodePosition`), jamais de setState local pour nodes/edges.
- **ADR-006 (auto-save):** La persistance des positions passe par `markDirty()` puis `saveDialogue()` → `POST /api/v1/unity-dialogues/graph/save-and-write`. Pas d’endpoint dédié pour la position.
- **NFR-P4 (UI Responsiveness <100ms):** Le throttle RAF pendant le drag évite le scintillement ; ne pas supprimer ni bloquer le main thread dans `onNodeDrag`/`onNodeDragStop`.

### Library / Framework Requirements

- **React Flow (xyflow):** `snapToGrid`, `snapGrid`, `onNodeDragStop`, `onNodesChange` déjà utilisés. Vérifier la doc pour `panOnDrag` ou équivalent (auto-pan quand un nœud est dragué hors viewport). Pour le déplacement en groupe : `multiSelectionKeyCode="Shift"`, `selectionOnDrag={true}` ; React Flow gère le déplacement visuel du groupe ; au `onNodeDragStop`, il faut mettre à jour la position de chaque nœud sélectionné dans le store.
- **Zustand (graphStore):** `updateNodePosition(nodeId, position)` met à jour une seule node ; pour le groupe, appeler pour chaque node sélectionné avec le delta appliqué (ou utiliser l’API React Flow pour récupérer les nouvelles positions de tous les nœuds concernés).

### File Structure Requirements

- Modifications limitées à : `GraphCanvas.tsx`, éventuellement `graphStore.ts` / `layoutSlice.ts` si logique groupe ou helpers. Tests dans `frontend/src/__tests__/` (graphStore.controlledMode, GraphCanvas, useGraphStore).
- Ne pas créer de router ou endpoint backend pour la position.

### Testing Requirements

- **Unit / intégration :** `onNodeDragStop` → `updateNodePosition` ; `updateNodePosition` → `markDirty` ; snap appliqué sur position finale ; pas de régression sur controlled mode (nodes/edges depuis le store uniquement).
- **Régression :** `graphStore.controlledMode.test.ts`, `GraphCanvas.virtualization.test.tsx`, `useGraphStore.test.ts` (updateNodePosition, markDirty) doivent rester verts.
- **E2E (optionnel) :** Workflow « ouvrir graphe → drag un nœud → relâcher → vérifier sauvegarde (auto-save ou indicateur dirty) ».

### Story 2.4 implementation note (AC #3)
- **Story 2.10 non livrée** : `multiSelectionKeyCode` et `selectionOnDrag` ne sont pas présents dans le projet. L’AC #3 (déplacement en groupe de plusieurs nœuds) sera pleinement livrable après la story 2.10. Pas de blocage sur le reste de la story 2.4 (drag single + persistance, snap, auto-pan).

### Previous Story Intelligence

- **Story 2.3 (Zoom, pan, focus FR24):** `minZoom`/`maxZoom`, `panActivationKeyCode="Space"`, `onNodeDoubleClick` → focus, Ctrl+0 fit view, flèches/WASD pan. Fichiers modifiés : `GraphCanvas.tsx`, `GraphEditor.tsx`, `useKeyboardShortcuts`. **À réutiliser :** ne pas toucher au viewport ou aux contrôles ; le drag de nœuds est indépendant (position dans le store).
- **Story 2.2 / 2.1:** Virtualisation, `focus-generated-node`, store controlled. **Pattern établi :** toute modification de nodes/edges passe par le store ; pas d’état local nodes/edges dans le canvas.
- **Patterns établis :** `onNodeDragStop` commite une seule position ; RAF throttle pendant le drag ; pas d’endpoint dédié ; auto-save via `saveDialogue()`.

### Git Intelligence Summary

- Travail récent sur `GraphCanvas.tsx` (onNodeDragStop, schedulePositionUpdate, onNodesChange), `graphStore` (updateNodePosition, markDirty). Tests controlled mode et virtualisation en place. Respecter le même pattern : pas de setNodes/setEdges local.

### Latest Tech Information

- **React Flow 11.x :** `onNodeDragStop(ev, node, nodes)` reçoit la node déplacée ; pour multi-sélection, `nodes` peut contenir les autres nœuds sélectionnés — vérifier l’API pour récupérer les positions finales de tout le groupe. `panOnDrag` : peut être un tableau de boutons (1 = gauche, 2 = molette) pour autoriser le pan pendant le drag sur le pane ; à confirmer pour le drag de nœud hors viewport (comportement par défaut souvent déjà présent).
- **Snap to grid :** React Flow applique le snap à la position lors du drop ; la position reçue dans `onNodeDragStop` est déjà snapée si `snapToGrid` est true.

### Project Context Reference

- [Source: _bmad-output/project-context.md] — Stack frontend (React 18, TypeScript, Zustand, React Flow 11.11), règles tests (Vitest, RTL, Playwright), pas de logique métier dans le frontend hors store/API.
- [Source: _bmad-output/planning-artifacts/epics/epic-02.md#Story-2.4] — Story 2.4 complète, AC, contraintes techniques, dépendance 2.10.
- [Source: _bmad-output/planning-artifacts/architecture/v10-architectural-decisions-adrs.md#ADR-007] — React Flow controlled ; nodes/edges depuis le store uniquement ; onNodesChange/onNodeDragStop appellent le store.
- [Source: _bmad-output/implementation-artifacts/2-3-zoom-pan-et-focus-sur-zones-spécifiques-fr24.md] — Story 2.3 (zoom, pan, focus), fichiers et patterns à ne pas casser.
- [Source: frontend/src/components/graph/GraphCanvas.tsx] — onNodeDragStop (l.388+), schedulePositionUpdate (l.283+), onNodesChange position (l.306+), snapToGrid/snapGrid (l.451+).

## Dev Agent Record

### Agent Model Used

N/A (Code review – corrections appliquées)

### Debug Log References

### Completion Notes List

- Code review (Amelia) : correction onNodeDragStop pour committer systématiquement `node.position` (position finale snapée) au lieu de pendingPositionRef ; placeholder Dev Agent Record remplacé.
- Task 1 : Tests existants étendus (drag-stop flow → updateNodePosition + markDirty) ; vérification GraphCanvas onNodeDragStop + RAF throttle + edges temps réel. Tous les tests graphe passent.
- Task 2 : Story 2.10 non livrée ; limitation AC #3 documentée dans Dev Notes ; test group-drag ajouté en .skip (Story 2.10).
- Task 3 : snapToGrid/snapGrid déjà en place ; test explicite ajouté dans GraphCanvas.virtualization.test.tsx (AC #4). Ligne guide d’alignement documentée comme amélioration future.
- Task 4 : autoPanOnNodeDrag activé sur ReactFlow (AC #5) ; test ajouté pour la prop.
- Task 5 : Suite frontend OK ; aucun endpoint /position (persistance via save-and-write).

### File List

- frontend/src/components/graph/GraphCanvas.tsx (autoPanOnNodeDrag)
- frontend/src/__tests__/graphStore.controlledMode.test.ts (drag-stop flow, group-drag .skip)
- frontend/src/__tests__/GraphCanvas.virtualization.test.tsx (snapToGrid, snapGrid, autoPanOnNodeDrag)
- _bmad-output/implementation-artifacts/2-4-drag-and-drop-nœuds-pour-réorganiser-layout-fr25.md (Dev Notes, Status, tasks)
- _bmad-output/implementation-artifacts/sprint-status.yaml (2-4 → in-progress puis review)
