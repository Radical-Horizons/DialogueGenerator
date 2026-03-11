# Story 2.5: Créer connexions entre nœuds manuellement (FR26)

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **utilisateur créant des dialogues**,
I want **créer des connexions entre nœuds manuellement**,
so that **je peux définir le flux narratif et les relations entre les dialogues**.

## Acceptance Criteria

1. **Given** je suis dans l'éditeur de graphe  
   **When** je survole un nœud  
   **Then** des handles de connexion apparaissent (points de connexion sur les bords du nœud)  
   **And** les handles sont visibles et cliquables

2. **Given** je veux créer une connexion  
   **When** je clique et maintiens sur un handle de connexion, puis glisse vers un autre nœud  
   **Then** une ligne de prévisualisation suit le curseur (edge preview)  
   **And** quand je relâche sur un handle de l'autre nœud, la connexion est créée

3. **Given** je crée une connexion  
   **When** la connexion est créée  
   **Then** la connexion apparaît dans le graphe comme une flèche (edge)  
   **And** la connexion est sauvegardée dans le dialogue (persistée)  
   **And** l'auto-save (Epic 0 Story 0.5) sauvegarde la connexion

4. **Given** je crée une connexion avec un label (texte choix joueur)  
   **When** je crée la connexion  
   **Then** je peux éditer le label de la connexion (double-clic sur edge)  
   **And** le label s'affiche sur la connexion (ex: "Accepter", "Refuser")

5. **Given** je crée une connexion qui crée un cycle  
   **When** la connexion est créée  
   **Then** un warning s'affiche "Cycle détecté" (non-bloquant, voir Epic 0 Story 0.6)  
   **And** la connexion est créée quand même (cycles autorisés)

## Tasks / Subtasks

- [ ] Task 1: Vérifier handles, onConnect et persistance (AC: #1, #2, #3)
  - [ ] 1.1 (TDD) Exécuter ou étendre tests : `onConnect` appelle `connectNodes` avec source, target, choiceIndex, connectionType ; après connexion, `markDirty` déclenché ; auto-save enchaîne
  - [ ] 1.2 Vérifier dans `GraphCanvas.tsx` que `onConnect` (l.362+) mappe correctement `sourceHandle` (choice:, choice-N, success, failure) vers `connectNodes(source, target, choiceIndex?, connectionType)`
  - [ ] 1.3 Vérifier que les handles sont présents et visibles dans `DialogueNode.tsx`, `TestNode.tsx`, `EndNode.tsx` (Handle React Flow sur les bords)
  - [ ] 1.4 (TDD) Exécuter `graphStore.controlledMode.test.ts`, `useGraphStore.test.ts` (connectNodes, markDirty) pour régression
- [ ] Task 2: Édition du label edge par double-clic (AC: #4)
  - [ ] 2.1 (TDD) Test : double-clic sur une edge choice ouvre un moyen d’éditer le label (inline ou modal) ; la modification met à jour le store (choix parent ou edge data) et marque dirty
  - [ ] 2.2 Implémenter `onEdgeDoubleClick` dans `GraphCanvas.tsx` (ou handler délégué) : pour les edges de type choice, ouvrir édition du label (texte du choix) — soit inline sur l’edge, soit modal/popover
  - [ ] 2.3 S’assurer que la mise à jour du label persiste via le store (mise à jour du choix parent dans `node.data.choices[].text` ou équivalent) et déclenche `markDirty()` ; pas d’endpoint dédié
  - [ ] 2.4 Vérifier que `StableLabelSmoothStepEdge` affiche bien le label (déjà en place) et que l’édition le reflète après sauvegarde
- [ ] Task 3: Warning « Cycle détecté » après création (AC: #5)
  - [ ] 3.1 Vérifier que `validateGraph()` (ou équivalent) est appelé après une connexion créée (post-connect ou au prochain save) et que la réponse inclut les warnings `cycle_detected`
  - [ ] 3.2 Vérifier que le panneau de validation dans `GraphEditor.tsx` affiche bien « Cycle détecté » pour les cycles (déjà implémenté : type `cycle_detected`, cycle_path, intentionalCycles)
  - [ ] 3.3 (TDD) Test : créer une connexion qui forme un cycle → validation retourne un warning cycle_detected ; l’edge reste créée (non-bloquant)
- [ ] Task 4: Régression et qualité
  - [ ] 4.1 Exécuter tous les tests graphe : `graphStore.controlledMode.test.ts`, `useGraphStore.test.ts` (connectNodes, disconnectNodes), `useGraphStore.testNodeSync.test.ts` (TestNode connections)
  - [ ] 4.2 Vérifier qu’aucun endpoint dédié `/connections` n’est créé ; persistance uniquement via `saveDialogue()` → `POST /api/v1/unity-dialogues/graph/save-and-write`

## Dev Notes

- **Objectif US (vérification existant):** Création de connexions (handles, onConnect, connectNodes, types choice/success/failure), labels edge et persistance sont **déjà en place**. L’US vise **vérification + polish** : édition du label par double-clic sur l’edge si manquante, et affichage warning « Cycle détecté » (Epic 0.6).
- **RÉUTILISER** entièrement le mécanisme existant : `onConnect` + `connectNodes` + `markDirty` + auto-save. Ne pas créer d’endpoint POST dédié `/connections` : la connexion est persistée dans le JSON complet via `save-and-write` (ADR-006).
- **Epic 0 Story 0.6** : Validation cycles (validateGraph → warnings cycle_detected) et affichage dans le panneau validation existent ; s’assurer que la création d’une connexion qui introduit un cycle déclenche bien la validation (ex. au save ou après connect).

### Project Structure Notes

- **Fichiers concernés :** `frontend/src/components/graph/GraphCanvas.tsx` (onConnect, optionnel onEdgeDoubleClick), `frontend/src/store/slices/edgeSlice.ts` (connectNodes), `frontend/src/components/graph/edges/StableLabelSmoothStepEdge.tsx` (affichage label), `frontend/src/components/graph/nodes/DialogueNode.tsx`, `TestNode.tsx`, `EndNode.tsx` (handles). Édition label : soit dans GraphCanvas (onEdgeDoubleClick + modal/inline), soit composant dédié léger.
- **Aucun nouveau endpoint** : persistance via save-and-write uniquement.
- **Architecture :** ADR-007 (controlled) : les edges proviennent du store ; onConnect ne fait qu’appeler connectNodes. ADR-006 : persistance par auto-save global.

### Architecture Compliance

- **ADR-007 (React Flow controlled):** Les nodes/edges passés à `<ReactFlow>` proviennent uniquement du store. `onConnect` doit uniquement appeler `connectNodes(...)` du store, jamais de setState local pour edges.
- **ADR-006 (auto-save):** La persistance des connexions passe par `markDirty()` puis `saveDialogue()` → `POST /api/v1/unity-dialogues/graph/save-and-write`. Pas d’endpoint dédié pour les connexions.
- **NFR-P4 (UI Responsiveness <100ms):** Ne pas bloquer le main thread dans onConnect ; connectNodes est synchrone et léger.

### Library / Framework Requirements

- **React Flow (xyflow):** `onConnect(connection)` fournit source, target, sourceHandle ; le mapping choice:/success/failure vers connectNodes est déjà dans GraphCanvas. Pour édition label : `onEdgeDoubleClick` (vérifier API React Flow 11.x) ou wrapper sur l’edge custom.
- **Zustand (graphStore):** `connectNodes(sourceId, targetId, choiceIndex?, connectionType, sourceHandle?)` dans edgeSlice ; buildChoiceEdge / stableChoiceEdgeId pour les edges choice ; mise à jour du choix parent pour le label = modifier `node.data.choices[].text` puis mise à jour du store.

### File Structure Requirements

- Modifications limitées à : `GraphCanvas.tsx` (onConnect vérification, onEdgeDoubleClick si absent), éventuellement un petit composant ou modal pour édition label edge ; `edgeSlice.ts` uniquement si extension (ex. updateEdgeLabel) nécessaire. Tests dans `frontend/src/__tests__/` (graphStore.controlledMode, useGraphStore, useGraphStore.testNodeSync).
- Ne pas créer de router ou endpoint backend pour les connexions.

### Testing Requirements

- **Unit / intégration :** onConnect → connectNodes ; connectNodes → markDirty ; pas de régression sur controlled mode (edges depuis le store). Si édition label : action store update (choix ou edge data) + markDirty.
- **Régression :** `graphStore.controlledMode.test.ts`, `useGraphStore.test.ts` (connectNodes, markDirty), `useGraphStore.testNodeSync.test.ts` (connexions TestNode) doivent rester verts.
- **E2E (optionnel) :** Workflow « ouvrir graphe → drag d’un handle vers un nœud → relâcher → vérifier edge visible et sauvegarde (auto-save ou indicateur dirty) ».

### Previous Story Intelligence

- **Story 2.4 (Drag-and-drop FR25):** onNodeDragStop, updateNodePosition, RAF throttle, snapToGrid, autoPanOnNodeDrag. Fichiers : GraphCanvas.tsx, graphStore. **À réutiliser :** ne pas toucher à onNodesChange/onNodeDragStop ; le flux connexions est indépendant (onConnect → connectNodes). Persistance uniquement via save-and-write.
- **Stories 2.1–2.3 :** Virtualisation, focus-generated-node, store controlled. **Pattern établi :** toute modification de nodes/edges passe par le store ; pas d’état local nodes/edges dans le canvas.
- **Patterns établis :** onConnect mappe sourceHandle → choiceIndex/connectionType ; connectNodes normalise TestBars et marque dirty ; pas d’endpoint dédié ; auto-save via saveDialogue().

### Git Intelligence Summary

- Travail récent sur GraphCanvas (onConnect, onEdgesChange), edgeSlice (connectNodes, disconnectNodes), testNodeSync pour TestNode. Respecter le même pattern : pas de setEdges local ; tout passe par le store.

### Latest Tech Information

- **React Flow 11.x :** `onConnect(connection)` avec `connection.sourceHandle` pour distinguer choice/success/failure. Pour édition edge : vérifier si `onEdgeDoubleClick` existe sur `<ReactFlow>` ou si il faut utiliser un edge type custom avec gestion double-clic dans StableLabelSmoothStepEdge.
- **Labels edge :** Les edges choice sont construites avec `buildChoiceEdge` (choiceText, choiceId) ; le label affiché vient de `edge.data.label` ou équivalent consommé par StableLabelSmoothStepEdge. Éditer le label = mettre à jour le choix parent `choices[].text` et rafraîchir l’edge (store).

### Project Context Reference

- [Source: _bmad-output/project-context.md] — Stack frontend (React 18, TypeScript, Zustand, React Flow 11.11), règles tests (Vitest, RTL, Playwright), pas de logique métier dans le frontend hors store/API.
- [Source: _bmad-output/planning-artifacts/epics/epic-02.md#Story-2.5] — Story 2.5 complète, AC, contraintes techniques, Epic 0.6 (validation cycles).
- [Source: _bmad-output/planning-artifacts/architecture/v10-architectural-decisions-adrs.md#ADR-007] — React Flow controlled ; nodes/edges depuis le store ; onConnect appelle le store.
- [Source: frontend/src/components/graph/GraphCanvas.tsx] — onConnect (l.362+), edgeTypes smoothstep (StableLabelSmoothStepEdge).
- [Source: frontend/src/store/slices/edgeSlice.ts] — connectNodes, buildChoiceEdge, stableChoiceEdgeId.

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### File List
