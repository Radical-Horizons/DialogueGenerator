# Story 2.6: Supprimer connexions entre nœuds (FR27)

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **utilisateur créant des dialogues**,
I want **supprimer des connexions entre nœuds**,
so that **je peux modifier le flux narratif et supprimer des relations non désirées**.

## Acceptance Criteria

1. **Given** j'ai une connexion entre deux nœuds dans le graphe  
   **When** je sélectionne la connexion (clic sur l'edge) et appuie sur Delete  
   **Then** une confirmation s'affiche "Supprimer cette connexion ?"  
   **And** j'ai les options "Supprimer" et "Annuler"

2. **Given** je confirme la suppression  
   **When** la connexion est supprimée  
   **Then** la connexion disparaît du graphe  
   **And** la connexion est supprimée du dialogue (persistée)  
   **And** l'auto-save (Epic 0 Story 0.5) sauvegarde la suppression

3. **Given** je supprime une connexion par erreur  
   **When** je supprime la connexion  
   **Then** je peux annuler avec Ctrl+Z (undo, voir Story 2.14)  
   **And** la connexion est restaurée

4. **Given** je supprime plusieurs connexions en sélection multiple  
   **When** je sélectionne 3 connexions (shift-click) et appuie sur Delete  
   **Then** une confirmation s'affiche "Supprimer 3 connexions ?"  
   **And** toutes les connexions sélectionnées sont supprimées en une seule action

5. **Given** je supprime une connexion qui isole un nœud (orphan)  
   **When** la connexion est supprimée  
   **Then** un warning s'affiche "Nœud orphelin détecté" (validation structurelle, voir Epic 4)  
   **And** le nœud reste dans le graphe (pas supprimé automatiquement)

## Tasks / Subtasks

- [x] Task 1: Intercepter suppression edge et ouvrir confirmation (AC: #1)
  - [x] 1.1 (TDD) Test : sur `remove` edge, si pas de confirmation en cours, ne pas appeler `disconnectNodes` immédiatement ; ouvrir un état/modal de confirmation avec edgeId(s)
  - [x] 1.2 Dans `GraphCanvas.tsx`, modifier `onEdgesChange` : sur `change.type === 'remove'`, au lieu d'appeler `disconnectNodes(change.id)` directement, ouvrir un modal de confirmation (une edge) ou stocker les edgeIds et ouvrir modal (multi-edge)
  - [x] 1.3 Exposer un état (ou store) pour "pending edge delete" : `edgeIdsToDelete: string[] | null` et callback "Confirm" qui appelle `disconnectNodes` pour chaque id puis `markDirty()`, puis ferme le modal
- [x] Task 2: Intégrer ConfirmDialog pour une ou plusieurs edges (AC: #1, #4)
  - [x] 2.1 (TDD) Test : modal affiche "Supprimer cette connexion ?" pour 1 edge, "Supprimer N connexions ?" pour N > 1 ; Annuler ferme sans appeler disconnectNodes
  - [x] 2.2 Réutiliser `ConfirmDialog` (`frontend/src/components/shared/ConfirmDialog.tsx`) : titre et message dynamiques selon `edgeIdsToDelete.length` ; onConfirm → boucle `disconnectNodes(id)` + markDirty + clear pending
  - [x] 2.3 S'assurer que la sélection multiple d'edges est gérée par React Flow (vérifier si `edgesSelectable` / sélection multi-edges est déjà possible ; si oui, sur Delete intercepter tous les edges sélectionnés)
- [x] Task 3: Persistance et warning orphelin (AC: #2, #5)
  - [x] 3.1 Vérifier qu'après `disconnectNodes`, `markDirty()` est bien appelé (déjà dans `disconnectNodes` dans edgeSlice) et que l'auto-save prend en charge la suppression (pas d'endpoint dédié)
  - [x] 3.2 (TDD) Test : après suppression d'une edge, `validateGraph()` (ou équivalent) peut retourner un warning `orphan_detected` ; afficher "Nœud orphelin détecté" dans le panneau de validation existant (GraphEditor/GraphCanvas) si présent
  - [x] 3.3 Ne pas supprimer automatiquement le nœud orphelin ; uniquement afficher le warning (Epic 4 pour règles métier)
- [x] Task 4: Undo (AC: #3) et régression
  - [x] 4.1 Documenter que l’AC #3 (Ctrl+Z pour restaurer la connexion) est pleinement livrable après Story 2.14 (undo/redo) ; jusqu’à 2.14, la suppression est persistée et non annulable par undo
  - [x] 4.2 (TDD) Exécuter tests existants : `useGraphStore.test.ts` (disconnectNodes, markDirty), `useGraphStore.testNodeSync.test.ts` (disconnectNodes TestNode) ; pas de régression
  - [x] 4.3 Vérifier qu’aucun endpoint DELETE dédié n’est créé ; persistance uniquement via `saveDialogue()` → `POST /api/v1/unity-dialogues/graph/save-and-write`

## Dev Notes

- **Objectif US (vérification existant):** La suppression de connexion est **déjà fonctionnelle** : `onEdgesChange` (remove) → `disconnectNodes` dans `GraphCanvas.tsx` (l.352–360), persistance par auto-save. Il **manque** la confirmation utilisateur avant suppression (et confirmation multi-edge). L’US vise un **enrichissement UX** : ajout du modal de confirmation (ConfirmDialog) pour une ou plusieurs edges.
- **RÉUTILISER** `disconnectNodes(edgeId)` du store (`frontend/src/store/slices/edgeSlice.ts`), **RÉUTILISER** `ConfirmDialog.tsx` (shared). Ne pas créer d’endpoint DELETE dédié : persistance via `save-and-write` (ADR-006).
- **Référence pattern nœuds :** `DeleteNodeConfirmModal.tsx` utilise le store pour `showDeleteNodeConfirm` et appelle `deleteNode` sur confirm ; pour les edges, même pattern : état "pending edge delete" → ConfirmDialog → onConfirm appelle `disconnectNodes` (et en boucle pour multi).

### Project Structure Notes

- **Fichiers concernés :** `frontend/src/components/graph/GraphCanvas.tsx` (onEdgesChange : intercepter remove, ouvrir confirmation ; état local ou store pour edgeIdsToDelete), `frontend/src/components/shared/ConfirmDialog.tsx` (réutiliser tel quel avec props titre/message/onConfirm/onCancel). Optionnel : composant léger `DeleteEdgeConfirmModal.tsx` qui wrap ConfirmDialog si on préfère isoler la logique (sinon tout dans GraphCanvas ou GraphEditor).
- **Store :** Aucune nouvelle action requise ; `disconnectNodes(edgeId)` et `markDirty()` existent. Pour multi-edge : appeler `disconnectNodes(id)` en boucle puis un seul `markDirty()`.
- **Aucun nouveau endpoint** : persistance via save-and-write uniquement.

### Architecture Compliance

- **ADR-007 (React Flow controlled):** Les edges proviennent du store. La suppression doit passer par `disconnectNodes` du store uniquement ; après confirmation, pas de setState local pour edges.
- **ADR-006 (auto-save):** La suppression est persistée via `markDirty()` puis `saveDialogue()` → `POST /api/v1/unity-dialogues/graph/save-and-write`. Pas d’endpoint DELETE pour les connexions.
- **NFR-P4 (UI Responsiveness <100ms):** La confirmation est synchrone (ouvrir modal) ; l’exécution de disconnectNodes est déjà synchrone et légère.

### Library / Framework Requirements

- **React Flow (xyflow):** Vérifier comment récupérer les edges sélectionnés (ex. `getEdges()` filtré par `selected`, ou état des edges dans le store avec `selected: true`). Sur Delete clavier, React Flow peut appeler `onEdgesChange` avec plusieurs `remove` ; traiter soit un remove à la fois avec accumulation, soit intercepter le raccourci Delete et dériver les edges sélectionnés depuis le store.
- **Zustand (graphStore):** `disconnectNodes(edgeId: string)` dans edgeSlice ; pour N edges, appeler N fois puis un seul `markDirty()`.

### File Structure Requirements

- Modifications limitées à : `GraphCanvas.tsx` (onEdgesChange + état confirmation + rendu ConfirmDialog ou inclusion d’un modal), éventuellement `GraphEditor.tsx` si le modal est monté au niveau éditeur. Tests dans `frontend/src/__tests__/` (useGraphStore, GraphCanvas ou GraphEditor si modal intégré).
- Ne pas créer de router ou endpoint backend pour la suppression de connexions.

### Testing Requirements

- **Unit / intégration :** onEdgesChange avec remove → n’appelle pas disconnectNodes tant que l’utilisateur n’a pas confirmé ; après Confirm → disconnectNodes appelé, markDirty déclenché. Multi-edge : plusieurs edgeIds passés au modal, onConfirm appelle disconnectNodes pour chaque.
- **Régression :** `useGraphStore.test.ts` (disconnectNodes, markDirty), `useGraphStore.testNodeSync.test.ts` (disconnectNodes TestNode) doivent rester verts.
- **E2E (optionnel) :** Workflow « sélectionner une edge → Delete → confirmer → edge disparaît et indicateur dirty / auto-save ».

### Previous Story Intelligence

- **Story 2.5 (Créer connexions FR26):** onConnect → connectNodes, markDirty, auto-save ; édition label edge par double-clic ; warning Cycle détecté. Fichiers : GraphCanvas.tsx (onConnect, onEdgesChange), edgeSlice (connectNodes, disconnectNodes). **À réutiliser :** ne pas toucher à onConnect ; pour suppression, intercepter uniquement dans onEdgesChange (remove) et ajouter la couche confirmation avant d’appeler disconnectNodes. Persistance uniquement via save-and-write.
- **Stories 2.1–2.4 :** Virtualisation, focus, store controlled, drag-and-drop. **Pattern établi :** toute modification nodes/edges passe par le store ; pas d’état local pour les edges dans le canvas. Confirmation = état local ou store pour "pending delete" puis appel store sur confirm.

### Git Intelligence Summary

- Travail récent sur GraphCanvas (onEdgesChange appelle disconnectNodes directement), edgeSlice (disconnectNodes avec mise à jour choix parent TestNode). Respecter le même pattern : pas de setEdges local ; après confirmation, tout passe par le store (disconnectNodes).

### Latest Tech Information

- **React Flow 11.x :** `onEdgesChange` reçoit des `EdgeChange[]` ; `type === 'remove'` avec `change.id`. Pour sélection multiple d’edges, vérifier la doc React Flow (sélection d’edges + raccourci Delete peut envoyer plusieurs changements remove). Si un seul remove est envoyé à la fois, pour "Supprimer 3 connexions" il faudra peut-être intercepter le raccourci Delete au niveau clavier et lire les edges sélectionnés depuis le store.
- **ConfirmDialog :** Déjà utilisé dans GenerationPanelModals et AIGenerationPanel ; interface `ConfirmDialogProps` (title, message, onConfirm, onCancel, open, etc.) — réutiliser sans modifier.

### Project Context Reference

- [Source: _bmad-output/project-context.md] — Stack frontend (React 18, TypeScript, Zustand, React Flow 11.11), règles tests (Vitest, RTL, Playwright), pas de logique métier dans le frontend hors store/API.
- [Source: _bmad-output/planning-artifacts/epics/epic-02.md#Story-2.6] — Story 2.6 complète, AC, contraintes techniques, Epic 0.5 (auto-save), Story 2.14 (undo), Epic 4 (validation orphelins).
- [Source: frontend/src/components/graph/GraphCanvas.tsx] — onEdgesChange (l.352–360), disconnectNodes.
- [Source: frontend/src/store/slices/edgeSlice.ts] — disconnectNodes, mise à jour choix parent TestNode.
- [Source: frontend/src/components/shared/ConfirmDialog.tsx] — Composant à réutiliser pour confirmation suppression.
- [Source: frontend/src/components/graph/DeleteNodeConfirmModal.tsx] — Pattern à suivre pour modal de confirmation (store + callback confirm).

## Dev Agent Record

### Agent Model Used

Code Review (AI) — correctifs post-review appliqués 2026-03-12

### Debug Log References

### Completion Notes List

- **Task 1–2:** `onEdgesChange` intercepte les `remove` et stocke les edgeIds dans `edgeIdsToDelete` au lieu d’appeler `disconnectNodes` immédiatement. `ConfirmDialog` réutilisé avec titre/message dynamiques (1 vs N connexions), boutons Supprimer/Annuler. onConfirm appelle `disconnectNodes` pour chaque id puis ferme le modal.
- **Task 3:** `markDirty()` déjà appelé dans `edgeSlice.disconnectNodes`. Panneau validation (GraphEditor) affiche le libellé "Nœud orphelin détecté" pour le type `orphan_node` (backend déjà en place). Pas de suppression automatique du nœud orphelin.
- **Task 4:** AC #3 (undo) documentée comme livrable avec Story 2.14. Tests `useGraphStore.test.ts` et `useGraphStore.testNodeSync.test.ts` exécutés (36 tests verts). Aucun endpoint DELETE créé ; persistance via save-and-write uniquement.

### File List

- frontend/src/components/graph/GraphCanvas.tsx (état edgeIdsToDelete, onEdgesChange, ConfirmDialog, callbacks, markDirty batch)
- frontend/src/components/graph/GraphEditor.tsx (libellé orphan_node → "Nœud orphelin détecté", tooltip Suppr/edge)
- frontend/src/store/slices/edgeSlice.ts (disconnectNodes(edgeId, skipMarkDirty?))
- frontend/src/store/types/graphState.ts (signature disconnectNodes)
- frontend/src/__tests__/GraphCanvas.edgeDeleteConfirm.test.tsx (nouveau)

## Senior Developer Review (AI)

**Reviewer:** Marc (Code Review workflow)  
**Date:** 2026-03-12

### Git vs Story

- **Fichiers modifiés (git):** `GraphCanvas.tsx`, `GraphEditor.tsx`, `sprint-status.yaml`
- **File List story:** GraphCanvas.tsx, GraphEditor.tsx, GraphCanvas.edgeDeleteConfirm.test.tsx
- **Écart:** `sprint-status.yaml` modifié mais pas dans la File List → accepté (branche peut contenir autre travail).
- **Fichiers non commités:** story + test (nouveau) ; cohérent.

### Synthèse

- **AC #1, #2, #4, #5:** Implémentés (confirmation 1/N, Supprimer/Annuler, persistance via disconnectNodes + markDirty, libellé orphelin dans GraphEditor).
- **AC #3 (undo):** Documenté comme livré en Story 2.14 — conforme.
- **Tâches [x]:** Toutes vérifiées (onEdgesChange, ConfirmDialog, store, tests).
- **Tests:** `GraphCanvas.edgeDeleteConfirm.test.tsx` (4 tests verts), régression `useGraphStore` / `useGraphStore.testNodeSync` (36 tests verts).

### Problèmes relevés

| Sévérité | Description | Fichier / référence |
|----------|-------------|----------------------|
| **MEDIUM** | Placeholder `{{agent_model_name_version}}` non remplacé dans Dev Agent Record | Story file, l.121 |
| **MEDIUM** | Task 1.3 prévoyait « un seul markDirty() » après la boucle ; actuellement chaque `disconnectNodes(id)` appelle `markDirty()` dans le store (N appels). Comportement correct mais écart par rapport à la spec. | edgeSlice appelé N fois depuis GraphCanvas |
| **LOW** | `edgesSelectable` non défini sur ReactFlow ; la multi-sélection d’edges dépend du comportement par défaut de React Flow (batch de `remove`). | GraphCanvas.tsx |
| **LOW** | Raccourcis graphe (tooltip) : « Suppr » décrit uniquement la suppression de nœud ; pas de mention de la suppression de connexion (edge) avec confirmation. | GraphEditor.tsx (tooltip raccourcis) |
| **LOW** | Fichier `sprint-status.yaml` modifié mais absent de la File List (tolérance branche). | Info seulement |

**Issues:** 0 Critical, 2 Medium, 3 Low.  
**Git discrepancies:** 1 (sprint-status hors File List — accepté).

### Suite possible

1. **Corriger automatiquement** — Remplacer le placeholder, documenter markDirty (ou regrouper les appels si on expose une API batch), ajouter une ligne dans le tooltip pour la suppression d’edge.
2. **Créer des action items** — Les ajouter en tâches « Review Follow-ups (AI) » dans la story.
3. **Détails** — Approfondir un point précis (indiquer lequel).

Choisir **[1]**, **[2]** ou préciser l’issue à examiner :

### Correctifs appliqués (option 1 — 2026-03-12)

- **MEDIUM 1:** Placeholder `{{agent_model_name_version}}` remplacé par « Code Review (AI) — correctifs post-review appliqués 2026-03-12 ».
- **MEDIUM 2:** Un seul `markDirty()` après suppression en batch : `disconnectNodes(edgeId, skipMarkDirty?)` ajouté dans le store ; dans `onConfirmDeleteEdges`, appels `disconnectNodes(id, true)` puis `markDirty()` une fois.
- **LOW (tooltip):** Raccourcis graphe — ajout de la mention « sur une connexion (edge) : confirmation puis suppression » pour la touche Suppr.
- **LOW (edgesSelectable):** Non appliqué — React Flow 11 ne reconnaît pas la prop au niveau du composant (warning DOM) ; le comportement par défaut (batch remove) reste utilisé pour AC #4.

**Fichiers modifiés par les correctifs :** `frontend/src/components/graph/GraphCanvas.tsx`, `frontend/src/components/graph/GraphEditor.tsx`, `frontend/src/store/slices/edgeSlice.ts`, `frontend/src/store/types/graphState.ts`, story (Dev Agent Record + review).

---

## Où tester dans l’interface

- **Écran :** Éditeur de graphe (route `/graph` ou onglet « Graphe » selon l’app).
- **Navigation :** Ouvrir un dialogue depuis la liste à gauche pour charger un graphe avec nœuds et connexions.
- **Actions à faire :**
  1. **Une connexion :** Cliquer sur une flèche (connexion) entre deux nœuds pour la sélectionner, puis appuyer sur **Suppr**. Vérifier que le modal « Supprimer cette connexion ? » s’affiche avec boutons **Supprimer** et **Annuler**. Cliquer **Annuler** → la connexion reste. Recommencer, cliquer **Supprimer** → la connexion disparaît et l’indicateur de sauvegarde (dirty / auto-save) se met à jour.
  2. **Plusieurs connexions (AC #4) :** Sélectionner plusieurs connexions (Shift+clic sur plusieurs edges), puis **Suppr**. Vérifier le message « Supprimer N connexions ? » et que **Supprimer** supprime bien toutes les connexions sélectionnées en une fois.
  3. **Orphelin (AC #5) :** Supprimer la seule connexion qui relie un nœud au reste du graphe. Ouvrir le panneau de validation (badge « X avertissement(s) » en haut) et vérifier l’entrée « Nœud orphelin détecté » ; le nœud reste dans le graphe.
- **À contrôler :** Persistance (auto-save) après suppression ; pas de suppression sans confirmation ; libellés exacts du modal (1 vs N).

---

## Change Log

- 2026-03-12: Implémentation Story 2.6 (FR27) — confirmation suppression connexions (1 ou N), persistance via markDirty/save-and-write, warning orphelin "Nœud orphelin détecté", tests GraphCanvas.edgeDeleteConfirm + régression useGraphStore.
- 2026-03-12: Code Review (AI) — correctifs : placeholder Dev Agent Record, un seul markDirty() en batch (disconnectNodes skipMarkDirty), tooltip raccourcis (Suppr sur edge), section « Où tester dans l’interface ». Statut → done.
