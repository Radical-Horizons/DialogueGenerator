# Story 1.7: Dupliquer des nœuds existants pour créer des variantes (FR7)

Status: ready-for-dev

**Architecture (ADR-007):** Toute modification du canvas (GraphCanvas) doit respecter le mode controlled React Flow. Tout nœud ajouté au store (dont les dupliqués) doit passer par le même flux que « Nouveau nœud » : React Flow émet `dimensions` → store reflète `width`/`height`. Voir `_bmad-output/planning-artifacts/architecture/v10-architectural-decisions-adrs.md` et post-mortem `_bmad-output/implementation-artifacts/1-17-adr-007-react-flow-controlled.md`.

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **utilisateur créant des dialogues**,
I want **dupliquer des nœuds existants pour créer des variantes rapidement**,
so that **je peux itérer sur des versions alternatives sans recréer le nœud depuis zéro**.

## Acceptance Criteria

1. **Given** j'ai un nœud dans le graphe  
   **When** je sélectionne le nœud et clique sur "Dupliquer" (menu contextuel ou bouton)  
   **Then** une copie du nœud est créée avec un nouveau stableID unique  
   **And** le nœud dupliqué est positionné à côté du nœud original (offset visuel)  
   **And** le panneau d'édition s'ouvre pour modifier la copie  

2. **Given** je duplique un nœud avec des connexions  
   **When** le nœud est dupliqué  
   **Then** le nœud dupliqué n'a PAS de connexions (copie isolée)  
   **And** je peux créer de nouvelles connexions pour la variante  

3. **Given** je duplique un nœud avec metadata (tags, conditions, effets)  
   **When** le nœud est dupliqué  
   **Then** toutes les metadata sont copiées dans le nœud dupliqué  
   **And** je peux modifier les metadata indépendamment  

4. **Given** je duplique plusieurs nœuds en sélection multiple  
   **When** je sélectionne 3 nœuds et clique "Dupliquer"  
   **Then** 3 copies sont créées (une par nœud sélectionné)  
   **And** chaque copie a un stableID unique  
   **And** les copies sont positionnées en groupe à côté des originaux  

5. **Given** je duplique un nœud  
   **When** je modifie le nœud dupliqué  
   **Then** les modifications n'affectent pas le nœud original  
   **And** les deux nœuds sont indépendants (pas de lien de dépendance)  

## Tasks / Subtasks

- [ ] Task 1: `duplicateNode(nodeId)` dans graphStore (AC: #1, #2, #3, #5)
  - [ ] 1.1 Deep copy du nœud (data, position) ; nouveau `id` = `dup-${crypto.randomUUID()}` ou `manual-${crypto.randomUUID()}` (aligné 1.6).
  - [ ] 1.2 Dans `data` : conserver speaker, line, choices (structure) ; **effacer** toutes les refs de connexion (`nextNode`, `choices[].targetNode`, `test*Node`) pour que la copie soit isolée.
  - [ ] 1.3 Position : offset par rapport à l’original (ex. +50 px x, +50 px y). Constantes dédiées (ex. `DUPLICATE_OFFSET_X`, `DUPLICATE_OFFSET_Y`) dans le store ou module partagé.
  - [ ] 1.4 `addNode(duplicate)` puis `markDirty()` ; retourner le nœud créé. L’appelant peut `setSelectedNode(duplicate.id)` et ouvrir le panneau d’édition.
- [ ] Task 2: `duplicateNodes(nodeIds: string[])` pour sélection multiple (AC: #4)
  - [ ] 2.1 Pour chaque `nodeId`, appeler `duplicateNode` (ou logique partagée). Positionner les copies en « groupe » : offset progressif (ex. index × step) pour éviter chevauchement.
  - [ ] 2.2 Si multi-sélection pas encore disponible (store single-select) : implémenter d’abord duplicate single-node ; documenter extension multi quand Epic 2 sélection multiple existera.
- [ ] Task 3: Menu contextuel "Dupliquer" sur nœuds (AC: #1)
  - [ ] 3.1 Ajouter menu contextuel sur les nœuds (clic droit) : au minimum "Dupliquer". Réutiliser pattern React Flow `Panel` / `NodeContextMenu` ou équivalent si présent ; sinon, `onContextMenu` sur `DialogueNode` + menu custom.
  - [ ] 3.2 Clic "Dupliquer" → `duplicateNode(selectedNodeId)` → `addNode` → `setSelectedNode` → ouvrir NodeEditorPanel (déjà ouvert si nœud sélectionné).
- [ ] Task 4: Optionnel – Bouton "Dupliquer" dans barre d’actions ou panneau Détails (AC: #1)
  - [ ] 4.1 Si pertinent : bouton "Dupliquer" à côté de "Supprimer" dans `NodeEditorPanel` quand un nœud est sélectionné. Même flux que menu contextuel.
- [ ] Task 5: Risque nœuds invisibles (post 1.17) – conformité ADR-007
  - [ ] 5.1 Ne pas contourner GraphCanvas / `onNodesChange`. Les nœuds dupliqués sont ajoutés au store ; React Flow émet `dimensions` ; le store doit refléter `width`/`height` pour ces nœuds (voir post-mortem 1.17). Même flux que "Nouveau nœud".
  - [ ] 5.2 Après `addNode(duplicate)`, utiliser `fitView` sur le nœud créé si souhaité (comme "Nouveau nœud"), sans bypass du mode controlled.
- [ ] Task 6: Backend duplicate (optionnel pour MVP)
  - [ ] 6.1 Epic prévoit `POST /api/v1/unity-dialogues/graph/nodes/{nodeId}/duplicate`. Si on garde persistance par save full graph (comme 1.6), duplicate 100 % frontend + `markDirty` + save existant suffit. Sinon, ajouter endpoint qui retourne nœud dupliqué et l’insère dans le graphe côté backend ; frontend reçoit nodes/edges mis à jour.
- [ ] Task 7: Tests (AC: tous)
  - [ ] 7.1 Unit : `duplicateNode` crée copie isolée (nouveau id, pas de connexions), deep copy data, offset position, `addNode` + `markDirty` appelés.
  - [ ] 7.2 Unit : `duplicateNodes` (si implémenté) crée N copies, positions en groupe.
  - [ ] 7.3 Integration : si endpoint duplicate existe, test API ; sinon couvrir via store.
  - [ ] 7.4 E2E : sélectionner nœud → Dupliquer (menu ou bouton) → panneau s’ouvre sur la copie → éditer → sauvegarde ; pas de régression visuelle (nœuds visibles, pas de scintillement).

## Dev Notes

### Contexte Epic et Story

**Epic 1: Amélioration et peaufinage de la génération de dialogues**
- Objectif : Réduire la friction, améliorer la qualité des dialogues, donner plus de contrôle à l’utilisateur.
- **Story 1.7** : Dupliquer des nœuds pour créer des variantes. PRIORITÉ B.
- **Valeur :** Gain de productivité ; itération sur variantes sans recréer depuis zéro.

**Dépendances :**
- Story 1.6 (création manuelle) : **DONE**. Réutiliser `addNode`, `createEmptyNode`-like pattern (sans appeler `createEmptyNode`), `markDirty`, ouverture NodeEditorPanel.
- Story 1.17 (ADR-007) : **review**. Mode controlled obligatoire ; post-mortem « nœuds invisibles » : tout nœud ajouté doit avoir `width`/`height` propagés via `onNodesChange` → store.

### Vérification Codebase Existant

**Fichiers à étendre (pas de création ex nihilo) :**

| Fichier | Décision | Détail |
|--------|----------|--------|
| `frontend/src/store/graphStore.ts` | **Étendre** | Ajouter `duplicateNode(nodeId): Node` (et optionnellement `duplicateNodes(nodeIds)`). Réutiliser `addNode`, `markDirty`. Ne pas dupliquer la logique de génération d’id (aligner avec `createEmptyNode` : `manual-` + uuid ou préfixe `dup-`). |
| `frontend/src/components/graph/GraphEditor.tsx` | **Étendre** | Si bouton "Dupliquer" dans barre : même zone que "Nouveau nœud" / "Supprimer", `disabled` si pas de nœud sélectionné ou `!canEditGraph`. |
| `frontend/src/components/graph/nodes/DialogueNode.tsx` | **Étendre** | Ajouter `onContextMenu` ouvrant un menu avec "Dupliquer" (et éventuellement "Supprimer" pour cohérence UX). Ou utiliser `NodeContextMenu` React Flow si déjà en place. |
| `frontend/src/components/graph/NodeEditorPanel.tsx` | **Étendre** (optionnel) | Bouton "Dupliquer" à côté de "Supprimer" quand un `dialogueNode` est sélectionné ; appeler `duplicateNode` puis `setSelectedNode` sur la copie. |

**Backend :**
- Pas d’endpoint duplicate actuellement. Persistance par `save` graphe (nodes/edges). **Option A (recommandée pour MVP) :** duplicate 100 % frontend, `markDirty`, sauvegarde via flux existant. **Option B :** `POST .../nodes/{nodeId}/duplicate` qui renvoie le nœud dupliqué et l’intègre au graphe côté serveur ; frontend recharge ou reçoit delta.

**Patterns à respecter :**
- **Zustand :** mises à jour immuables, `markDirty()` après toute modification.
- **React Flow (ADR-007) :** nodes/edges depuis le store uniquement ; aucun `useNodesState`/`useEdgesState` ; handlers → actions store. Nœuds ajoutés → même flux dimensions que "Nouveau nœud".
- **Unity JSON :** `data` du nœud dupliqué conforme à `DialogueNodeData` ; pas de références orphelines (targetNode, nextNode, etc. effacés sur la copie).

### Project Structure Notes

- `frontend/src/store/graphStore.ts` : store graphe, CRUD, génération, accept/reject, **duplicate**.
- `frontend/src/components/graph/` : `GraphEditor`, `GraphCanvas`, `NodeEditorPanel`, `DialogueNode`, etc.
- `frontend/src/schemas/nodeEditorSchema.ts` : `DialogueNodeData`, `Choice`. Deep copy en préservant structure, en effaçant les refs de connexion.
- Pas de nouveau répertoire ; tout s’insère dans l’existant.

### Risque bug nœuds invisibles (post 1.17)

En mode controlled React Flow, tout nœud ajouté au store doit laisser React Flow émettre et traiter les changements `dimensions` ; le store doit refléter `width`/`height` après mesure. Si `duplicateNode` → `addNode` ajoute un nœud au store, le même flux que pour « Nouveau nœud » s’applique ; ne pas contourner GraphCanvas ou `onNodesChange`. Voir post-mortem dans `_bmad-output/implementation-artifacts/1-17-adr-007-react-flow-controlled.md`.

### Références technique

- [Source: _bmad-output/planning-artifacts/epics/epic-01.md#Story-1.7]
- [Source: _bmad-output/planning-artifacts/architecture/v10-architectural-decisions-adrs.md#ADR-007]
- [Source: _bmad-output/implementation-artifacts/1-17-adr-007-react-flow-controlled.md] (post-mortem)
- [Source: _bmad-output/implementation-artifacts/1-6-créer-manuellement-des-nœuds-sans-llm-fr6.md] (createEmptyNode, position, NodeEditorPanel)
- FR7 (duplication), FR31–32 (sélection multiple), Epic 0 Story 0.1 (stableID)

### Previous Story Intelligence (1.6)

- **createEmptyNode** : `id = manual-${crypto.randomUUID()}`, `type: 'dialogueNode'`, `data: { id, speaker, line, choices }`. Position fournie par l’appelant. L’action "Nouveau nœud" appelle `addNode` puis `setSelectedNode`.
- **Position** : constantes `MANUAL_NODE_OFFSET_X`, `MANUAL_NODE_OFFSET_Y`, `MANUAL_NODE_STEP` dans GraphEditor ; pour duplicate, utiliser offset fixe +50/+50 (ou step) par rapport à l’original.
- **NodeEditorPanel** : s’ouvre quand `selectedNodeId` est défini. Dupliquer → `setSelectedNode(duplicate.id)` suffit pour ouvrir l’éditeur sur la copie.
- **Menu contextuel "Nouveau nœud"** : non implémenté (task 3 optionnelle). Pour 1.7, ajouter menu contextuel "Dupliquer" sur les nœuds.
- **Bug connu 1.6** : "Nouveau nœud" depuis un choix (panneau Détails) peut déconnecter un choix ou rendre le nœud déconnecté au retour. Duplicate depuis le graphe (nœud sélectionné) reste aligné avec le flux "Nouveau nœud" barre d’actions ; pas de duplication depuis choix spécifique dans le panneau Détails pour cette story.

### Architecture Compliance

- **ADR-007** : GraphCanvas en mode controlled ; nodes/edges du store ; handlers → store ; dimensions propagées. Duplicate ajoute des nodes via le store uniquement ; aucun contournement.
- **ADR-006** : Store = document ; `markDirty` après duplicate ; pas de bouton "Sauvegarder" dédié.
- **docs/architecture/state-management-frontend.md** : graphStore, React Flow controlled.

### Testing Requirements

- **Unit** : `duplicateNode` — copie isolée (nouveau id, pas de connexions), deep copy de `data` (speaker, line, choices), refs (`nextNode`, `targetNode`, etc.) effacées ; position avec offset ; `addNode` et `markDirty` appelés.
- **Unit** : `duplicateNodes` si implémenté — N copies, positions en groupe.
- **Integration** : optionnel si pas d’API duplicate ; couvrir via store.
- **E2E** : Dupliquer un nœud (menu ou bouton) → panneau s’ouvre sur la copie → éditer → sauvegarde ; nœuds visibles, pas de régression (edges, scintillement).

### Project Context Reference

- Pas de `project-context.md` global. Contexte porté par Epic 1, ADR-007, et stories 1.6 / 1.17.

---

## Dev Agent Record

### Agent Model Used

_(à remplir par l’agent dev)_

### Debug Log References

_(aucun)_

### Completion Notes List

_(à remplir après implémentation)_

### File List

_(à remplir après implémentation)_
