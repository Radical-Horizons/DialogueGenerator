# Story 2.11: Appliquer opérations à nœuds sélectionnés (delete, tag, validate) (FR32)

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **utilisateur créant des dialogues**,
I want **appliquer des opérations à plusieurs nœuds sélectionnés (supprimer, taguer, valider)**,
so that **je peux gérer efficacement de grands graphes avec des actions en lot**.

## Acceptance Criteria

1. **Given** j'ai plusieurs nœuds sélectionnés (voir Story 2.10)  
   **When** j'ouvre le menu contextuel (clic droit) ou la barre d'outils  
   **Then** des options d'opérations batch s'affichent : "Supprimer sélection", "Tagger sélection", "Valider sélection"

2. **Given** je sélectionne "Supprimer sélection"  
   **When** je confirme la suppression  
   **Then** tous les nœuds sélectionnés sont supprimés  
   **And** une confirmation s'affiche "X nœuds supprimés"  
   **And** les connexions vers/depuis ces nœuds sont également supprimées

3. **Given** je sélectionne "Tagger sélection"  
   **When** je choisis un tag (ex: "À réviser")  
   **Then** tous les nœuds sélectionnés reçoivent ce tag  
   **And** les nœuds affichent visuellement le tag (badge ou couleur)

4. **Given** je sélectionne "Valider sélection"  
   **When** la validation est lancée  
   **Then** tous les nœuds sélectionnés sont validés (structure, lore, qualité - voir Epic 4)  
   **And** un rapport de validation s'affiche avec résultats par nœud

5. **Given** une opération batch échoue partiellement (ex: 3/5 nœuds supprimés)  
   **When** l'opération se termine  
   **Then** un message d'erreur détaillé s'affiche "3 nœuds supprimés, 2 échecs: [raisons]"  
   **And** les nœuds réussis sont traités, les échecs restent inchangés

## Tasks / Subtasks

- [ ] Task 1 : Actions batch dans le store (AC: #2, #3)
  - [ ] 1.1 (TDD) Test : `batchDeleteNodes(['a','b','c'])` appelle `deleteNode` pour chaque ID, puis `markDirty()` une seule fois ; si un `deleteNode` lève, les nœuds déjà supprimés restent supprimés, retourner les IDs en échec
  - [ ] 1.2 (TDD) Test : `batchTagNodes(['a','b'], 'À réviser')` met à jour `node.data.tag` pour chaque nœud via mise à jour existante (updateNode/updateDialogueNodeDirectly selon type), puis `markDirty()` une fois
  - [ ] 1.3 Dans `graphStore` (nodeSlice ou nouveau batchSlice) : **CRÉER** `batchDeleteNodes(nodeIds: string[]): { deleted: string[], failed: string[] }` — boucle sur `get().deleteNode(id)` dans try/catch, collecter les failed, appeler `markDirty()` une fois à la fin
  - [ ] 1.4 **CRÉER** `batchTagNodes(nodeIds: string[], tag: string): void` — pour chaque id, récupérer le nœud, mettre à jour `data.tag` via l’action de mise à jour existante (updateNode ou équivalent), puis `markDirty()` une fois

- [ ] Task 2 : Composant BatchOperationsMenu (AC: #1, #2, #3, #4, #5)
  - [ ] 2.1 (TDD) Test : le menu s’affiche quand `selectedNodeIds.length > 1` ; il propose "Supprimer sélection", "Tagger sélection", "Valider sélection" ; clic "Supprimer" ouvre une confirmation (ConfirmDialog) avec le nombre de nœuds
  - [ ] 2.2 **CRÉER** `BatchOperationsMenu.tsx` dans `frontend/src/components/graph/` — barre d’outils ou panneau affiché quand `selectedNodeIds.length > 1` (ex: au-dessus du graphe ou en bas de la toolbar GraphEditor)
  - [ ] 2.3 Bouton "Supprimer sélection" : ouvrir `ConfirmDialog` "Supprimer X nœuds ?" ; sur confirmation appeler `batchDeleteNodes(selectedNodeIds)` puis `clearSelection()` ; toast "X nœuds supprimés" ou "X supprimés, Y échecs: [raisons]" si partiel
  - [ ] 2.4 Bouton "Tagger sélection" : ouvrir un sélecteur de tag (liste prédéfinie ou champ texte) ; à la validation appeler `batchTagNodes(selectedNodeIds, tag)` ; toast "Tag appliqué à X nœuds"
  - [ ] 2.5 Bouton "Valider sélection" : appeler `validateGraph()` existant (POST /graph/validate), filtrer les résultats par `selectedNodeIds` ; afficher un rapport (modal ou panneau) avec erreurs/avertissements par nœud

- [ ] Task 3 : Intégration GraphEditor et persistance (AC: #2, #3)
  - [ ] 3.1 Intégrer `BatchOperationsMenu` dans `GraphEditor.tsx` : l’afficher quand `selectedNodeIds.length > 1` (à côté ou sous le badge "X nœuds sélectionnés" de la Story 2.10)
  - [ ] 3.2 S’assurer qu’après batch delete/tag, l’auto-save (ADR-006) est déclenché via `markDirty()` déjà appelé dans les actions ; pas d’endpoint batch dédié — persistance via `saveDialogue()` → `POST /api/v1/unity-dialogues/graph/save-and-write`
  - [ ] 3.3 Gestion d’erreur partielle : si `batchDeleteNodes` retourne des `failed`, afficher toast détaillé avec les IDs ou raisons (ex: "2 échecs: node_xyz (TestNode orphelin)") ; ne pas appeler `clearSelection()` sur les IDs en échec (optionnel : garder en sélection les échecs pour retry)

- [ ] Task 4 : Tests et régression (AC: tous)
  - [ ] 4.1 Tests unitaires : `batchDeleteNodes` et `batchTagNodes` dans un fichier dédié (ex: `graphStore.batchOperations.test.ts`) — succès total, échec partiel, `markDirty` appelé une fois
  - [ ] 4.2 Tests d’intégration : BatchOperationsMenu affiché quand multi-sélection ; confirmation suppression ; toast après delete/tag
  - [ ] 4.3 E2E : sélectionner plusieurs nœuds (shift-click ou lasso), cliquer "Supprimer sélection", confirmer, vérifier que les nœuds ont disparu et toast affiché ; idem pour "Tagger sélection" avec un tag

## Dev Notes

- **Objectif US (vérification existant) :** **Nouvelle fonctionnalité.** Suppression/tag/validation existent au niveau d’un seul nœud (`deleteNode`, `DeleteNodeConfirmModal`, `validateGraph`) ; il n’y a pas de menu d’opérations batch ni d’actions `batchDeleteNodes` / `batchTagNodes`. Dépend de Story 2.10 (sélection multiple : `selectedNodeIds`, `setSelectedNodes`, `clearSelection`).
- **CRÉER** `BatchOperationsMenu.tsx` — aucun composant similaire existant. Réutiliser `ConfirmDialog` (shared) pour la confirmation de suppression en lot, et `useToast` (comme dans `GraphEditor.tsx`) pour les retours utilisateur.
- **Store :** `deleteNode(nodeId)` existe dans `nodeSlice.ts` (gère TestNode + DialogueNode + edges). `batchDeleteNodes` = boucle sur `deleteNode` + un seul `markDirty()` à la fin. Pour le tag : utiliser l’action de mise à jour de nœud existante (ex: `updateNode` avec `{ data: { ...node.data, tag } }` ou équivalent dans le store).
- **Pas d’endpoints batch côté backend :** tout passe par les actions store + `saveDialogue()` → `POST /api/v1/unity-dialogues/graph/save-and-write`.
- **Validation batch :** `validateGraph()` valide tout le graphe ; filtrer côté UI les erreurs/warnings par `selectedNodeIds` pour n’afficher que le rapport des nœuds sélectionnés.
- **Tag :** Si le schéma Unity / `node.data` n’a pas encore de champ `tag`, l’ajouter en métadonnée côté frontend (affichage badge) ; pas de changement schéma backend requis pour un premier MVP si non documenté ailleurs.

### Project Structure Notes

- **Fichiers à créer :** `frontend/src/components/graph/BatchOperationsMenu.tsx`, tests `graphStore.batchOperations.test.ts` (ou dans un describe dédié).
- **Fichiers à modifier :** `frontend/src/store/` (nodeSlice ou nouveau slice) — `batchDeleteNodes`, `batchTagNodes` ; `frontend/src/store/types/graphState.ts` — signatures des actions ; `frontend/src/components/graph/GraphEditor.tsx` — intégration du menu.
- **Réutiliser :** `ConfirmDialog` (`frontend/src/components/shared/`), `useToast` (shared), `deleteNode`, `validateGraph`, `clearSelection`, `selectedNodeIds` (uiSlice).

### Architecture Compliance

- **ADR-007 (React Flow controlled) :** Les suppressions et mises à jour de nœuds passent uniquement par le store ; le menu n’appelle que des actions du store. Aucun état local React Flow pour les nodes/edges.
- **ADR-006 (auto-save) :** Un seul `markDirty()` après chaque opération batch (pas un par nœud) pour éviter des sauvegardes multiples.
- **NFR-P4 (UI Responsiveness <100ms) :** Les boucles batch restent synchrones ; pour des sélections très grandes (ex: 100+ nœuds), envisager un indicateur de progression ou traitement asynchrone si nécessaire (hors scope MVP si AC ne l’exige pas).

### Library / Framework Requirements

- **Zustand :** Nouvelles actions dans le store, exposées via `useGraphStore()`.
- **React :** Composant présentiel pour le menu ; pas de dépendance nouvelle (ConfirmDialog, useToast déjà utilisés dans le projet).

### Testing Requirements

- **Unit (store) :** `batchDeleteNodes` / `batchTagNodes` — succès, échec partiel, `markDirty` appelé une fois.
- **Intégration :** Affichage du menu quand `selectedNodeIds.length > 1`, confirmation, toasts.
- **E2E :** Workflow complet : multi-sélection → Supprimer sélection → confirmer → vérifier disparition + toast ; Tagger sélection → choisir tag → vérifier badge/toast.

### Previous Story Intelligence (2.10)

- **Sélection multiple :** `selectedNodeIds`, `setSelectedNodes`, `clearSelection` dans `uiSlice` ; badge "X nœuds sélectionnés" dans `GraphEditor`. Le menu batch doit s’afficher dans la même zone logique (toolbar / au-dessus du graphe).
- **deleteNode :** Déjà gère TestNode (suppression du choix parent), DialogueNode, edges, `selectedNodeId`. En batch, après suppression, appeler `clearSelection()` ou mettre à jour `selectedNodeIds` pour retirer les IDs supprimés.
- **GraphCanvas / controlled mode :** Les nodes/edges viennent du store ; les actions batch ne font que mettre à jour le store, le rendu suit.

### Git Intelligence Summary

- Derniers commits : Story 2.10 (sélection multiple — uiSlice selectedNodeIds, GraphCanvas onSelectionChange, drag groupe). Fichiers modifiés : `graphState.ts`, `uiSlice.ts`, `layoutSlice.ts`, `GraphCanvas.tsx`, `GraphEditor.tsx`, tests multiSelection et controlledMode.
- Convention : tests dans `frontend/src/__tests__/` (graphStore.*.test.ts), composants dans `frontend/src/components/graph/`.

### Latest Tech Information

- Aucune dépendance externe nouvelle ; React Flow et Zustand déjà en place. ConfirmDialog et useToast existants.

### Project Context Reference

- [Source: _bmad-output/planning-artifacts/epics/epic-02.md#Story-2.11] — Story 2.11 complète, AC, contraintes techniques, FR32.
- [Source: frontend/src/store/slices/nodeSlice.ts] — `deleteNode(nodeId)` (lignes 457+), gestion TestNode/DialogueNode/edges.
- [Source: frontend/src/components/graph/DeleteNodeConfirmModal.tsx] — Confirmation avant suppression d’un nœud ; réutiliser le pattern avec ConfirmDialog pour N nœuds.
- [Source: frontend/src/components/graph/GraphEditor.tsx] — useToast, toolbar, badge "X nœuds sélectionnés" (Story 2.10).
- [Source: _bmad-output/planning-artifacts/architecture/v10-architectural-decisions-adrs.md#ADR-007] — Mode controlled ; pas d’état nodes/edges hors store.
- [Source: _bmad-output/implementation-artifacts/2-10-sélection-multiple-nœuds-shift-click-lasso-selection-fr31.md] — Fichiers et patterns Story 2.10.

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### File List
