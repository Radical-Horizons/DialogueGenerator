# Code Review — Story 2.14 Undo/Redo opérations graphe (FR35)

**Story:** 2-14-undo-redo-opérations-graphe-fr35.md  
**Reviewer:** Amelia (Dev Agent, adversarial code review)  
**Date:** 2025-03-13  
**Git vs Story:** Fichiers de la File List cohérents avec les changements git (aucune fausse déclaration). Fichiers hors liste (sprint-status, create-story/instructions) considérés hors périmètre (branch tolerance).

---

## Synthèse

- **AC validés (implémentés):** AC#1, AC#2, AC#3, AC#4 (undo/redo linéaire, boutons, raccourcis, vidage redo après nouvelle modification, clear on load/reset).
- **AC partiel:** AC#5 (menu « Historique » / liste d’opérations / saut à un point quelconque non implémentés).
- **Tasks [x]:** Toutes les tasks marquées [x] sont implémentées et couvertes par les tests (13 tests passent).
- **Issues trouvées:** 1 HIGH, 2 MEDIUM, 3 LOW.

---

## CRITICAL ISSUES

_Aucun._ Aucune task marquée [x] sans implémentation, pas de critère d’acceptation complètement absent sans trace.

---

## HIGH ISSUES

### 1. [AC#5] Menu « Historique » et liste d’opérations — PARTIEL

- **AC#5:** « When j’ouvre le menu "Historique" (ou Ctrl+Shift+Z) → une liste des opérations récentes s’affiche (dernières 50 opérations) et je peux sauter à n’importe quel point de l’historique (non-linéaire si supporté). »
- **Constat:** Il n’existe pas de menu « Historique », pas de liste d’opérations récentes, pas de saut à un point arbitraire. Ctrl+Shift+Z est utilisé pour **redo** (comportement linéaire), pas pour ouvrir un historique.
- **Preuve:** `useGraphToolbar.ts` (Ctrl+Shift+Z → redo), `GraphEditorHeader.tsx` (aucun menu Historique), `undoSlice.ts` (undo/redo linéaire uniquement).
- **Impact:** AC#5 partiellement livré (raccourci redo) mais pas la partie « liste + saut dans l’historique ».

---

## MEDIUM ISSUES

### 2. [Store] `updateChoiceEdgeLabel` sans snapshot undo

- **Règle story:** Les actions mutantes du graphe doivent pousser un snapshot avant modification (addNode, deleteNode, connectNodes, disconnectNodes, updateNodePosition).
- **Constat:** `edgeSlice.ts` — `updateChoiceEdgeLabel` modifie nœuds (choices[].text) et edges (label) sans appeler `_pushUndoSnapshot()`. Une modification de libellé de choix n’est pas annulable.
- **Fichier:** `frontend/src/store/slices/edgeSlice.ts` (updateChoiceEdgeLabel).

### 3. [UX] `batchDeleteNodes` = N snapshots, undo une seule suppression

- **Constat:** `batchDeleteNodes` appelle `deleteNode(id, true)` en boucle ; chaque appel fait un `_pushUndoSnapshot()` dans deleteNode. Après suppression de 5 nœuds, il faut 5 undos pour tout restaurer au lieu d’un seul « annuler le lot ».
- **Impact:** Comportement cohérent avec le design actuel (chaque mutation = un step) mais UX potentiellement déroutante pour un « batch ».
- **Fichier:** `frontend/src/store/slices/nodeSlice.ts` (batchDeleteNodes).

---

## LOW ISSUES

### 4. [UI] Pas d’undo sur auto-layout

- **Constat:** `applyAutoLayout` modifie les positions des nœuds sans pousser de snapshot. Après un auto-layout, l’utilisateur ne peut pas annuler.
- **Note:** Les Dev Notes ne demandent pas explicitement l’undo pour le layout ; à traiter en amélioration si souhaité.

### 5. [Doc] Raccourcis undo/redo dans input/textarea

- **Constat:** Comportement correct : `useKeyboardShortcuts` ignore Ctrl+Z / Ctrl+Y dans INPUT/TEXTAREA/contentEditable (lignes 135–152), donc pas de vol du comportement natif. Aucun correctif nécessaire, simple confirmation pour la revue.

### 6. [Style] Duplication canUndo/canRedo

- **Constat:** `GraphEditorHeader` utilise `useGraphStore((s) => s.undoStack.length > 0)` pour le disabled des boutons, tandis que `useGraphToolbar` expose `canUndoNow = canUndo()`. Deux sources de vérité équivalentes ; pas de bug, possibilité de simplifier plus tard.

---

## Validation des AC et tasks

| AC / Task | Statut | Preuve |
|-----------|--------|--------|
| AC#1 (historique + bouton Undo actif) | OK | undoSlice, nodeSlice/edgeSlice/layoutSlice _pushUndoSnapshot, GraphEditorHeader boutons |
| AC#2 (Ctrl+Z / Undo annule) | OK | useGraphToolbar ctrl+z, undo() store, tests |
| AC#3 (Ctrl+Y / Redo refait) | OK | useGraphToolbar ctrl+y + ctrl+shift+z, redo() store, tests |
| AC#4 (nouvelle modif vide redo) | OK | _pushUndoSnapshot() vide redoStack, test « redoStack is cleared » |
| AC#5 (menu Historique / liste / saut) | PARTIEL | Liste et saut non implémentés |
| Task 1 (undo restaure état) | OK | graphStore.undoRedo.test.ts |
| Task 2 (redo + vidage redo) | OK | idem |
| Task 3 (raccourcis, inactifs dans input) | OK | useKeyboardShortcuts isInputElement, tests |
| Task 4 (boutons Undo/Redo disabled) | OK | GraphEditorHeader.undoRedo.test.tsx |
| Task 5 (load/reset vident historique) | OK | persistenceSlice loadDialogue/loadDialogueByDocumentId, uiSlice resetGraph → initialState, tests |

---

## Recommandations

1. **AC#5:** Soit mettre à jour la story pour acter « undo/redo linéaire uniquement (sans menu Historique ni saut) », soit ajouter une story follow-up pour menu Historique + liste + saut à un point.
2. **MEDIUM 2:** Ajouter `get()._pushUndoSnapshot()` au début de `updateChoiceEdgeLabel` dans `edgeSlice.ts` pour rendre l’édition de libellé annulable.
3. **MEDIUM 3:** Documenter dans la story ou le code que le batch delete produit N steps undo, ou envisager un mode « single snapshot before batch » (optionnel).

---

**Statut recommandé après revue:** `in-progress` tant que AC#5 reste partiel ou que les MEDIUM ne sont pas traités selon la décision produit. Si on acte AC#5 comme « linéaire uniquement », passage en `done` possible après correction MEDIUM 2 (et évent. 3).

---

## Correctifs appliqués (option 1 — correction automatique)

- **MEDIUM 2:** `_pushUndoSnapshot()` ajouté au début de `updateChoiceEdgeLabel` (edgeSlice.ts). Test ajouté : « after updateChoiceEdgeLabel, undo() restores previous label ».
- **MEDIUM 3:** Un seul snapshot avant la boucle dans `batchDeleteNodes` ; `deleteNode(nodeId, skipMarkDirty, skipPushUndoSnapshot)` avec troisième paramètre pour ne pas pousser par nœud. Un undo restaure tout le lot. Test ajouté : « after batchDeleteNodes, one undo() restores all deleted nodes ».
- **AC#5:** Scope acté « undo/redo linéaire uniquement » (menu Historique / saut reporté). Story passée en **done**, sprint-status synchronisé.
