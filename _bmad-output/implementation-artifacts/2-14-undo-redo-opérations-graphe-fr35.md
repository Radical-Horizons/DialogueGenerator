# Story 2.14: Undo/Redo opérations graphe (FR35)

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **utilisateur créant des dialogues**,
I want **annuler et refaire les opérations d'édition du graphe (undo/redo)**,
so that **je peux corriger mes erreurs et itérer sur le design sans crainte**.

## Acceptance Criteria

1. **Given** je modifie le graphe (déplacer nœud, créer connexion, supprimer nœud)  
   **When** je fais une modification  
   **Then** l'opération est ajoutée à l'historique undo/redo  
   **And** le bouton "Undo" devient actif (Ctrl+Z disponible)

2. **Given** je fais une erreur (suppression accidentelle)  
   **When** j'appuie sur Ctrl+Z (ou bouton "Undo")  
   **Then** la dernière opération est annulée  
   **And** le graphe revient à l'état précédent (nœud restauré, connexion supprimée, etc.)

3. **Given** j'ai annulé plusieurs opérations  
   **When** j'appuie sur Ctrl+Y (ou bouton "Redo")  
   **Then** la dernière opération annulée est refaite  
   **And** le graphe revient à l'état après cette opération

4. **Given** je fais une nouvelle modification après avoir annulé  
   **When** je modifie le graphe après undo  
   **Then** l'historique redo est effacé (pas de branchement)  
   **And** seul l'historique undo est disponible

5. **Given** je consulte l'historique undo/redo  
   **When** j'ouvre le menu "Historique" (ou Ctrl+Shift+Z)  
   **Then** une liste des opérations récentes s'affiche (dernières 50 opérations)  
   **And** je peux sauter à n'importe quel point de l'historique (non-linéaire si supporté)

## Tasks / Subtasks

<!-- Chaque task = un comportement testable (TDD). Dev Notes = WHERE/HOW. -->

- [x] Task 1 : Undo annule la dernière opération graphe et restaure l'état (AC: #1, #2)
  - [x] 🔴 Test échoue : après addNode / deleteNode / connectNodes / disconnectNodes / updateNodePosition (drag stop), appel undo() → le graphe (nodes/edges) revient à l'état d'avant ; canUndo() true avant undo, false après si stack vide
  - [x] 🟢 Implémenter undoStack/redoStack + _pushUndoSnapshot + undo() dans le store (voir Dev Notes)
  - [x] 🔵 Refactor. (Points à prendre en compte : logique snapshot / copie nodes-edges, déduplication. Décision au dev.)

- [x] Task 2 : Redo refait la dernière opération annulée ; nouvelle modification vide redo (AC: #3, #4)
  - [x] 🔴 Test échoue : après undo(), redo() restaure l'état ; après une nouvelle mutation post-undo, redoStack est vidé et redo() no-op
  - [x] 🟢 Implémenter redo() et vidage redoStack dans _pushUndoSnapshot (voir Dev Notes)
  - [x] 🔵 Refactor. (Points à prendre en compte : cohérence types entre slice undo et reste du store. Décision au dev.)

- [x] Task 3 : Raccourcis Ctrl+Z (undo) et Ctrl+Y ou Ctrl+Shift+Z (redo) ; inactifs dans inputs/textarea (AC: #1, #2, #3)
  - [x] 🔴 Test échoue : en éditeur graphe, Ctrl+Z appelle undo() et Ctrl+Y (ou Ctrl+Shift+Z) appelle redo() ; lorsque le focus est dans un input/textarea, les raccourcis ne déclenchent pas undo/redo
  - [x] 🟢 Étendre useKeyboardShortcuts (ou enregistrement dans GraphEditor) avec ctrl+z / ctrl+y (voir Dev Notes)
  - [x] 🔵 Refactor. (Points à prendre en compte : lieu d'enregistrement des raccourcis graphe. Décision au dev.)

- [x] Task 4 : Boutons Undo/Redo dans la toolbar, désactivés si !canUndo / !canRedo (AC: #1)
  - [x] 🔴 Test échoue : présence de boutons Undo/Redo dans GraphEditorHeader ; disabled quand canUndo() false / canRedo() false ; clic déclenche undo() / redo()
  - [x] 🟢 Ajouter boutons dans GraphEditorHeader (voir Dev Notes), reliés au store
  - [x] 🔵 Refactor. (Points à prendre en compte : cohérence style avec les autres boutons toolbar. Décision au dev.)

- [x] Task 5 : Chargement dialogue et reset vident l'historique undo/redo (pas d'undo sur état avant load)
  - [x] 🔴 Test échoue : après loadDialogue() ou resetGraph(), undoStack et redoStack sont vides, canUndo() et canRedo() false
  - [x] 🟢 Appeler clearUndoHistory() (ou équivalent) dans loadDialogue / reset / init (voir Dev Notes)
  - [x] 🔵 Refactor. (Points à prendre en compte : périmètre limité (load/reset). Décision au dev.)

## Dev Notes

- **Objectif US (vérification existant) :** **Nouvelle fonctionnalité.** Aucun undo/redo dans le store (pas d'undoStack / redoStack). À implémenter de bout en bout (snapshots, actions undo/redo, raccourcis, UI).
- **Store (architecture actuelle) :** Le store est composé de slices (nodeSlice, edgeSlice, layoutSlice, persistenceSlice, etc.). Ajouter un **undoSlice** (ou historySlice) avec : état `undoStack: GraphSnapshot[]`, `redoStack: GraphSnapshot[]` ; type `GraphSnapshot = { nodes: Node[]; edges: Edge[] }` ; actions `undo()`, `redo()`, `canUndo(): boolean`, `canRedo(): boolean`, `_pushUndoSnapshot()`, `clearUndoHistory()`. Limite 50 snapshots (retirer le plus ancien si dépassement).
- **Où pousser le snapshot :** Appeler `_pushUndoSnapshot()` **avant** la modification dans chaque action mutante : `addNode` (nodeSlice), `deleteNode` (nodeSlice), `connectNodes` (edgeSlice), `disconnectNodes` (edgeSlice), `updateNodePosition` (layoutSlice). **Exception :** ne pas pousser de snapshot à chaque frame pendant le drag ; seulement au **onNodeDragStop**. Pour cela : soit `updateNodePosition(nodeId, position, skipMarkDirty?, pushUndoSnapshot?: boolean)` avec `pushUndoSnapshot` à false quand GraphCanvas appelle depuis onNodeDrag (intermédiaire), et true sur onNodeDragStop ; soit pousser le snapshot côté GraphCanvas dans onNodeDragStop avant d'appeler updateNodePosition. Choisir une approche cohérente avec le reste du store.
- **loadDialogue / reset :** Dans persistenceSlice (loadDialogue, resetGraph ou équivalent) et à l'init du graphe : appeler `clearUndoHistory()` pour vider undoStack et redoStack. Ne jamais permettre d'undo vers un état d'un dialogue précédent.
- **Raccourcis :** `useKeyboardShortcuts` (frontend/src/hooks/useKeyboardShortcuts.ts) : enregistrer `ctrl+z` → undo, `ctrl+y` ou `ctrl+shift+z` → redo. S'assurer que lorsque le focus est dans un input/textarea (ex. NodeEditorPanel), les raccourcis ne déclenchent pas (éviter de voler le comportement natif de l'éditeur de texte). Pattern existant : `enabled` peut être une fonction pour vérifier le focus.
- **UI :** GraphEditorHeader contient déjà la toolbar (Auto-layout, Export, etc.). Ajouter deux boutons Undo / Redo (icônes ou texte), reliés à `useGraphStore().undo`, `redo`, `canUndo`, `canRedo`. Désactiver les boutons quand `!canUndo()` / `!canRedo()`.
- **Références croisées :** Story 2.6 (suppression connexion) mentionne "je peux annuler avec Ctrl+Z (voir Story 2.14)" — une fois 2.14 livrée, l'undo de suppression de connexion sera possible. Story 2.4 (drag), 2.5 (connexions), 2.6 (suppression) sont les opérations à couvrir par l'historique.

### Project Structure Notes

- **Fichiers concernés :**
  - `frontend/src/store/` — nouveau slice undo (undoSlice.ts ou historySlice.ts) + types dans `types/graphState.ts` (GraphSnapshot, undoStack, redoStack)
  - `frontend/src/store/slices/nodeSlice.ts` — appeler _pushUndoSnapshot() dans addNode, deleteNode
  - `frontend/src/store/slices/edgeSlice.ts` — appeler _pushUndoSnapshot() dans connectNodes, disconnectNodes
  - `frontend/src/store/slices/layoutSlice.ts` — updateNodePosition : snapshot uniquement quand pushUndoSnapshot true (ou appelé depuis onNodeDragStop)
  - `frontend/src/store/slices/persistenceSlice.ts` — loadDialogue / reset : clearUndoHistory()
  - `frontend/src/hooks/useKeyboardShortcuts.ts` — ctrl+z, ctrl+y (ou ctrl+shift+z)
  - `frontend/src/components/graph/GraphEditorHeader.tsx` — boutons Undo/Redo
  - `frontend/src/components/graph/GraphCanvas.tsx` — onNodeDragStop : optionnellement pousser snapshot avant updateNodePosition si approche "caller pushes"
- **Réutiliser :** useGraphStore(), patterns de boutons toolbar existants (GraphEditorHeader), useKeyboardShortcuts (register avec enabled pour éviter conflit input/textarea).

### Architecture Compliance

- **ADR-007 (React Flow controlled) :** Après undo/redo, l'état nodes/edges est restauré depuis le store ; le canvas reflète le store. Conforme.
- **ADR-006 (auto-save) :** Après undo/redo, marquer le graphe dirty si l'état a changé pour déclencher l'auto-save (même logique que les autres mutations).

### Library / Framework Requirements

- Aucune nouvelle librairie requise. Zustand (store) et React Flow déjà en place. Type `Node[]` / `Edge[]` de React Flow pour les snapshots.

### File Structure Requirements

- Nouveau fichier slice : `frontend/src/store/slices/undoSlice.ts` (ou `historySlice.ts`) recommandé. Exposer undo, redo, canUndo, canRedo, _pushUndoSnapshot, clearUndoHistory dans graphState et dans le combine du graphStore.

### Testing Requirements

- **Unit :** Store : après addNode puis undo(), le nœud ajouté disparaît ; après deleteNode puis undo(), le nœud revient ; après connectNodes puis undo(), l'edge disparaît ; idem disconnectNodes, updateNodePosition (drag stop). canUndo/canRedo reflètent l'état des stacks. Limite 50 : après 51 mutations, le plus ancien snapshot est retiré. loadDialogue → stacks vides.
- **Intégration :** Raccourcis Ctrl+Z / Ctrl+Y déclenchent undo/redo ; boutons toolbar désactivés quand stacks vides.
- **E2E (optionnel) :** Ouvrir dialogue → supprimer un nœud → Undo → le nœud réapparaît.

### Previous Story Intelligence (2.13)

- Store modulaire (slices) : nodeSlice, edgeSlice, layoutSlice, persistenceSlice, etc. Tout nouvel état global (undoStack, redoStack) doit s'intégrer via un nouveau slice et `create<GraphState>()((...args) => ({ ...initialState, ...createNodeSlice(...), ...createUndoSlice(...), ... }))`.
- layoutSlice.applyAutoLayout appelle markDirty() après mise à jour des positions ; même principe pour undo/redo : après restore, markDirty() pour ADR-006.
- GraphEditorHeader et useGraphToolbar : pattern pour boutons (handleAutoLayout, etc.). Réutiliser le même pattern pour handleUndo / handleRedo.

### Git Intelligence Summary

- Derniers commits : auto-layout (2.13), tests graph store et toolbar, batch operations GraphEditor. Fichiers récents : layoutSlice.ts, GraphEditorHeader.tsx, useGraphToolbar.ts, graphStore (slices). Rester aligné : nouveau slice undo sans casser les slices existants ; appels _pushUndoSnapshot depuis les slices qui mutent.

### Latest Tech Information

- Aucune recherche web critique pour cette story. Zustand et React Flow inchangés. Pattern Memento (snapshot d'état) est standard.

### Project Context Reference

- [Source: _bmad-output/planning-artifacts/epics/epic-02.md#Story-2.14] — AC, exigences techniques, objectif "nouvelle fonctionnalité"
- [Source: frontend/src/store/graphStore.ts] — combinaison des slices
- [Source: frontend/src/store/types/graphState.ts] — GraphState, types et actions existantes
- [Source: _bmad-output/project-context.md] — règles projet, ADR-006/007, tests

## Dev Agent Record

### Agent Model Used

Amelia (Dev Story workflow)

### Debug Log References

### Completion Notes List

- Undo/redo (Story 2.14 FR35): undoSlice avec undoStack/redoStack (max 50), _pushUndoSnapshot avant addNode, deleteNode, connectNodes, disconnectNodes, updateChoiceEdgeLabel; updateNodePosition avec pushUndoSnapshot=true uniquement sur onNodeDragStop (single ou multi-drag). batchDeleteNodes: un seul snapshot avant le lot, deleteNode(_, _, skipPushUndoSnapshot) pour ne pas pousser par nœud. loadDialogue/loadDialogueByDocumentId et resetGraph (initialState) vident les stacks. Raccourcis Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z dans useGraphToolbar; boutons Undo/Redo dans GraphEditorHeader (désactivés si !canUndo/!canRedo). AC#5 livré en scope linéaire (pas de menu Historique ni saut à un point — reporté). Tests: graphStore.undoRedo.test.ts, GraphEditorHeader.undoRedo.test.tsx.

### Code Review Fixes (AI)

- **MEDIUM 2:** `updateChoiceEdgeLabel` appelle `_pushUndoSnapshot()` avant modification (edgeSlice.ts) — édition du libellé d’un choix désormais annulable.
- **MEDIUM 3:** `batchDeleteNodes` pousse un seul snapshot avant le lot ; `deleteNode(nodeId, skipMarkDirty, skipPushUndoSnapshot)` — un undo restaure tout le lot. Tests ajoutés : updateChoiceEdgeLabel + undo, batchDeleteNodes + un undo.

### File List

- frontend/src/store/types/graphState.ts
- frontend/src/store/slices/undoSlice.ts
- frontend/src/store/graphStore.ts
- frontend/src/store/slices/nodeSlice.ts
- frontend/src/store/slices/edgeSlice.ts
- frontend/src/store/slices/layoutSlice.ts
- frontend/src/store/slices/persistenceSlice.ts
- frontend/src/hooks/useReactFlowHandlers.ts
- frontend/src/hooks/useGraphToolbar.ts
- frontend/src/components/graph/GraphEditorHeader.tsx
- frontend/src/__tests__/graphStore.undoRedo.test.ts
- frontend/src/__tests__/GraphEditorHeader.undoRedo.test.tsx
