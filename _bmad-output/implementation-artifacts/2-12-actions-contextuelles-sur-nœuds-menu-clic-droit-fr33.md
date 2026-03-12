# Story 2.12: Actions contextuelles sur nœuds (menu clic droit) (FR33)

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **utilisateur créant des dialogues**,
I want **accéder à des actions contextuelles sur les nœuds et le fond du graphe via un menu clic droit**,
so that **je peux accéder rapidement aux opérations courantes (éditer, dupliquer, supprimer, créer, auto-layout) sans naviguer dans l'interface**.

## Acceptance Criteria

1. **Given** je suis dans l'éditeur de graphe  
   **When** je fais un clic droit sur un nœud  
   **Then** le menu contextuel existant (`NodeContextMenu`) s'affiche avec les options : "Éditer", "Générer", "Voir le prompt", "Dupliquer", "Supprimer"  
   **And** "Éditer" est présent et ouvre le `NodeEditorPanel` (via `setSelectedNode`)

2. **Given** je sélectionne "Éditer" dans le menu contextuel d'un nœud  
   **When** l'option est cliquée  
   **Then** `setSelectedNode(id)` est appelé et le panneau `NodeEditorPanel` s'ouvre  
   **And** le menu contextuel se ferme

3. **Given** je fais un clic droit sur un espace vide du graphe (pane)  
   **When** le menu contextuel du pane s'affiche  
   **Then** des options globales s'affichent : "Nouveau nœud", "Auto-layout"  
   **And** le menu est positionné à la position du curseur (coordonnées canvas converties en position graphe)

4. **Given** je sélectionne "Nouveau nœud" dans le menu pane  
   **When** l'option est cliquée  
   **Then** `createEmptyNode(position)` est appelé avec la position du clic convertie en coordonnées graphe  
   **And** le nœud créé apparaît à l'endroit du clic  
   **And** le menu se ferme

5. **Given** je sélectionne "Auto-layout" dans le menu pane  
   **When** l'option est cliquée  
   **Then** `applyAutoLayout('TB', 'dagre')` est appelé (même action que le bouton toolbar)  
   **And** le menu se ferme

6. **Given** un menu contextuel (nœud ou pane) est ouvert  
   **When** je clique ailleurs sur le graphe (pane click) ou j'appuie sur Escape  
   **Then** le menu contextuel se ferme  
   **And** aucune action n'est déclenchée

## Tasks / Subtasks

- [ ] Task 1 : Ajouter "Éditer" dans le menu contextuel de nœud (AC: #1, #2)
  - [ ] 1.1 (TDD) Test : clic "Éditer" dans `NodeContextMenu` appelle `setSelectedNode(id)` et `onClose()`
  - [ ] 1.2 Ajouter bouton "Éditer" dans `NodeContextMenu.tsx` (première entrée du menu, avant "Générer") — appelle `setSelectedNode(id)` puis `onClose()`

- [ ] Task 2 : Créer `PaneContextMenu.tsx` (AC: #3, #4, #5)
  - [ ] 2.1 (TDD) Test : `PaneContextMenu` affiche "Nouveau nœud" et "Auto-layout" ; clic "Nouveau nœud" appelle `onCreateNode()` ; clic "Auto-layout" appelle `onAutoLayout()` ; `onClose` appelé après chaque action
  - [ ] 2.2 **CRÉER** `frontend/src/components/graph/PaneContextMenu.tsx` — composant menu avec position absolue, même style que `NodeContextMenu.tsx` ; props : `{ top, left, onCreateNode, onAutoLayout, onClose }`
  - [ ] 2.3 Bouton "Nouveau nœud" : appelle `onCreateNode()` puis `onClose()`
  - [ ] 2.4 Bouton "Auto-layout" : appelle `onAutoLayout()` puis `onClose()`

- [ ] Task 3 : Intégrer `onPaneContextMenu` dans `GraphCanvas.tsx` (AC: #3, #4, #5, #6)
  - [ ] 3.1 (TDD) Test : `onPaneContextMenu` appelle `event.preventDefault()` et ouvre le pane menu avec les bonnes coordonnées ; `onPaneClick` ferme le menu pane ; `setMenu(null)` appelé sur pane click
  - [ ] 3.2 **ÉTENDRE** `GraphCanvas.tsx` : ajouter `paneMenu` state distinct (`{ top, left, position: { x, y } } | null`) à côté du `menu` existant (nœud)
  - [ ] 3.3 Ajouter handler `onPaneContextMenu` : `event.preventDefault()`, calculer `position` graphe via `screenToFlowPosition({ x: event.clientX, y: event.clientY })`, stocker dans `paneMenu`
  - [ ] 3.4 Rendre `<PaneContextMenu>` quand `paneMenu !== null` ; passer `onCreateNode={() => { createEmptyNode(paneMenu.position); setPaneMenu(null) }}` et `onAutoLayout={() => { applyAutoLayout('TB', 'dagre'); setPaneMenu(null) }}`
  - [ ] 3.5 S'assurer que `onPaneClick` ferme aussi `paneMenu` (appel `setPaneMenu(null)`)
  - [ ] 3.6 Fermer les deux menus (nœud et pane) sur `Escape` — étendre le `useEffect` ou `useKeyboardShortcuts` existant dans `GraphCanvas`

- [ ] Task 4 : Tests et régression (AC: tous)
  - [ ] 4.1 Tests unitaires `NodeContextMenu` : présence de "Éditer", appel `setSelectedNode` + `onClose`
  - [ ] 4.2 Tests unitaires `PaneContextMenu` : présence des deux options, callbacks corrects
  - [ ] 4.3 Tests d'intégration `GraphCanvas` : `onPaneContextMenu` affiche le menu pane ; clic extérieur le ferme ; `onNodeContextMenu` toujours fonctionnel (non-régression)
  - [ ] 4.4 Non-régression `NodeContextMenu` : options existantes (Générer, Voir le prompt, Dupliquer, Supprimer) toujours présentes après ajout de "Éditer"

## Dev Notes

- **Objectif US (vérification existant) :** **Enrichissement.** `NodeContextMenu.tsx` est déjà en place avec : Générer, Voir le prompt, Dupliquer, Supprimer. `onNodeContextMenu` est déjà branché sur `<ReactFlow>` dans `GraphCanvas.tsx` (ligne 306). Il manque : (1) entrée "Éditer" dans le menu nœud, (2) menu pane sur clic droit fond.
- **`NodeContextMenu.tsx` existant** : Ajouter seulement le bouton "Éditer" en première position (appel `setSelectedNode(id)` + `onClose()`). Ne pas refactoriser le menu existant.
- **`createEmptyNode(position?)` existe** dans `nodeSlice.ts` (ligne 421). Accepte une position optionnelle `{ x, y }` — passer la position graphe issue de `screenToFlowPosition`.
- **`applyAutoLayout`** existe dans le store et est déjà appelé dans `GraphEditor.tsx` (`handleAutoLayout`). Passer `'TB'` et `'dagre'` comme arguments par défaut (même chose que le bouton existant).
- **`screenToFlowPosition`** : API React Flow via `useReactFlow()` — convertit les coordonnées écran en coordonnées canvas. Disponible dans `GraphCanvas.tsx` qui importe déjà `useReactFlow`.
- **State pane menu** : Séparer `paneMenu` de `menu` (nœud) pour éviter les conflits. Les deux peuvent coexister dans `GraphCanvasInner` où réside le state `menu` existant.
- **Pas de modifications store** : toutes les actions (`createEmptyNode`, `applyAutoLayout`, `setSelectedNode`) existent déjà.
- **ADR-007 (mode controlled)** : `createEmptyNode` passe par le store → React Flow re-rend depuis le store. Conforme.
- **ADR-006 (auto-save)** : `createEmptyNode` et `applyAutoLayout` appellent `markDirty()` en interne. Pas d'appel supplémentaire nécessaire.

### Project Structure Notes

- **Fichier à créer :** `frontend/src/components/graph/PaneContextMenu.tsx`
- **Fichiers à modifier :**
  - `frontend/src/components/graph/NodeContextMenu.tsx` — ajouter bouton "Éditer" (avant "Générer")
  - `frontend/src/components/graph/GraphCanvas.tsx` — ajouter `paneMenu` state, `onPaneContextMenu` handler, rendu `<PaneContextMenu>`, fermeture sur Escape
- **Réutiliser :** `theme` (styles), `useGraphStore()`, `useReactFlow()` — déjà importés dans `GraphCanvas.tsx`
- **Ne pas toucher :** `graphStore.ts`, `nodeSlice.ts`, backend — aucune action store nouvelle requise
- **Tests à créer :** dans `frontend/src/__tests__/` — nouveau fichier `NodeContextMenu.test.tsx` ou section dans fichier existant, et `PaneContextMenu.test.tsx`

### Architecture Compliance

- **ADR-007 (React Flow controlled) :** `createEmptyNode` passe par le store ; aucun état nœud géré localement dans le composant menu. Conforme.
- **ADR-006 (auto-save) :** `createEmptyNode` et `applyAutoLayout` marquent `dirty` en interne via le store. Conforme.
- **NFR-P4 (UI Responsiveness <100ms) :** Menus positionnés en CSS absolu — aucun calcul lourd. Fermeture instantanée sur click/Escape.
- **NFR-A1 (Keyboard Navigation) :** Menu fermable par Escape. Les boutons de menu ont `role="menuitem"` et sont accessibles au clavier (existant dans `NodeContextMenu.tsx`).

### Library / Framework Requirements

- **React Flow (`useReactFlow`)** : `screenToFlowPosition` pour convertir les coordonnées clic pane → position graphe. Disponible depuis `reactflow@11`. **Ne pas utiliser `project()` (déprécié)** — utiliser `screenToFlowPosition`.
- **Zustand (`useGraphStore`)** : `createEmptyNode`, `applyAutoLayout`, `setSelectedNode` — tous disponibles, pas de nouvelles actions.
- **Aucune nouvelle dépendance** npm requise.

### Previous Story Intelligence (2.11)

- **Pattern menu contextuel** : `NodeContextMenu.tsx` utilise `position: 'fixed'` + coordonnées `clientX/clientY`. `PaneContextMenu.tsx` doit suivre le même pattern stylistique (fond panel, bordure, boxShadow, `theme.background.panel`).
- **`onPaneClick` → ferme le menu nœud** : le pattern `setMenu(null)` dans `onPaneClick` (`GraphCanvas.tsx:197-200`) doit être étendu pour aussi faire `setPaneMenu(null)`.
- **Fermeture sur Escape** : L'event `graph-node-contextmenu` est écouté via `useEffect` dans `GraphCanvas`. Ajouter un `useEffect` similaire pour écouter `keydown` + `Escape` et fermer les deux menus.
- **Fichiers récemment modifiés (2.11)** : `nodeSlice.ts`, `graphState.ts`, `BatchOperationsMenu.tsx`, `GraphEditorHeader.tsx`. Ces fichiers sont stables — ne pas les toucher sauf nécessité absolue.

### Git Intelligence Summary

- Commit récent pertinent : `d487301 Enhance GraphEditor and GraphCanvas functionality` (inclut vraisemblablement des ajouts post-2.10/2.11)
- Convention fichiers : composants graphe dans `frontend/src/components/graph/`, tests dans `frontend/src/__tests__/`
- Pattern `NodeContextMenu` : composant fonctionnel pur, props explicites, pas de context/store direct sauf via `useGraphStore()` et `useReactFlow()`

### Latest Tech Information

- **`screenToFlowPosition`** (React Flow ≥11.10) : remplace `project()` déprécié. Usage : `const { screenToFlowPosition } = useReactFlow()` puis `screenToFlowPosition({ x: e.clientX, y: e.clientY })`. Retourne `{ x, y }` en coordonnées canvas.
- Aucune autre dépendance externe à mettre à jour.

### Project Context Reference

- [Source: _bmad-output/planning-artifacts/epics/epic-02.md#Story-2.12] — Exigences AC, objectif "enrichissement", `NodeContextMenu.tsx` existant
- [Source: frontend/src/components/graph/NodeContextMenu.tsx] — Menu clic droit nœud existant : Générer, Voir le prompt, Dupliquer, Supprimer
- [Source: frontend/src/components/graph/GraphCanvas.tsx:181-184] — `onNodeContextMenu` handler existant + `openContextMenu` helper
- [Source: frontend/src/components/graph/GraphCanvas.tsx:197-200] — `onPaneClick` → `setMenu(null)` (pattern à étendre pour `paneMenu`)
- [Source: frontend/src/store/slices/nodeSlice.ts:421] — `createEmptyNode(position?)` — crée un nœud dialogue vide
- [Source: frontend/src/store/graphStore.ts:2076] — `applyAutoLayout(algorithm, direction)` — layout backend
- [Source: _bmad-output/planning-artifacts/architecture/v10-architectural-decisions-adrs.md#ADR-007] — Mode controlled : mutations via store uniquement
- [Source: _bmad-output/implementation-artifacts/2-11-appliquer-opérations-à-nœuds-sélectionnés-delete-tag-validate-fr32.md] — Patterns 2.11 : `BatchOperationsMenu`, styles theme, `useToast`

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
