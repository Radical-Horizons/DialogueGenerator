# Story 1.6: Créer manuellement des nœuds sans LLM (FR6)

Status: done

**Architecture (ADR-007):** Toute modification du canvas (GraphCanvas) doit respecter le mode controlled React Flow. Voir `_bmad-output/planning-artifacts/architecture/v10-architectural-decisions-adrs.md`.

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **utilisateur créant des dialogues**,
I want **créer des nœuds de dialogue manuellement sans génération LLM**,
so that **je peux ajouter des dialogues spécifiques ou corriger des nœuds sans utiliser l'IA**.

## Acceptance Criteria

1. **Given** je suis dans l'éditeur de graphe
   **When** je clique sur "Nouveau nœud" (bouton + ou menu contextuel)
   **Then** un nœud vide est créé dans le graphe avec stableID unique
   **And** le panneau d'édition s'ouvre automatiquement pour remplir le contenu

2. **Given** je crée un nœud manuellement
   **When** je remplis les champs (texte, speaker, metadata)
   **Then** le nœud est sauvegardé avec le même format que les nœuds générés
   **And** le nœud est immédiatement visible dans le graphe

3. **Given** je crée un nœud manuellement sans texte
   **When** je sauvegarde
   **Then** un warning s'affiche "Nœud vide - ajouter du texte"
   **And** je peux quand même sauvegarder (nœud placeholder autorisé)

4. **Given** je crée un nœud manuellement
   **When** je crée le nœud
   **Then** je peux immédiatement créer des connexions vers d'autres nœuds (drag-and-drop)
   **And** le nœud peut recevoir des connexions depuis d'autres nœuds

5. **Given** je crée plusieurs nœuds manuellement rapidement
   **When** les nœuds sont créés
   **Then** chaque nœud a un stableID unique (pas de collision)
   **And** les nœuds sont positionnés automatiquement dans le graphe (auto-layout)

## Tasks / Subtasks

- [x] Task 1: `createEmptyNode()` dans graphStore (AC: #1, #5)
  - [x] 1.1 Générer stableID unique (`crypto.randomUUID()` ou préfixe `manual-` + uuid)
  - [x] 1.2 Créer `Node` type `dialogueNode` avec `data`: `{ id, speaker: '', line: '', choices: [] }`
  - [x] 1.3 Retourner le nœud créé ; appeler `addNode` + `markDirty` dans l'action "Nouveau nœud"
- [x] Task 2: Bouton "Nouveau nœud" dans GraphEditor (AC: #1)
  - [x] 2.1 Ajouter bouton "➕ Nouveau nœud" dans la barre d'actions (à côté de "✨ Générer nœud IA")
  - [x] 2.2 Désactiver si aucun dialogue sélectionné / chargement en cours
  - [x] 2.3 Au clic : `createEmptyNode()` → `addNode` → `setSelectedNode(newNodeId)` → ouvrir NodeEditorPanel (déjà ouvert si nœud sélectionné)
- [ ] Task 3: Menu contextuel "Nouveau nœud" (AC: #1) – optionnel
  - [ ] 3.1 Si présent : Clic droit sur fond du canevas → "Nouveau nœud" ; même flux que Task 2
- [x] Task 4: Position et auto-layout (AC: #5)
  - [x] 4.1 Positionner le nouveau nœud (ex. centre vue ou offset par rapport aux nœuds existants)
  - [x] 4.2 Proposer "Auto-layout" après ajout (ou lancer automatiquement) pour lisibilité
- [x] Task 5: Warning nœud vide (AC: #3)
  - [x] 5.1 Dans NodeEditorPanel / validation : si `line` vide à la sauvegarde, toast warning "Nœud vide - ajouter du texte"
  - [x] 5.2 Permettre sauvegarde malgré tout (placeholder autorisé)
- [x] Task 6: Connexions (AC: #4)
  - [x] 6.1 Vérifier que connecteurs et drag-and-drop existants fonctionnent pour le nœud créé (pas de code spécifique si déjà OK)
- [x] Task 7: Tests (AC: tous)
  - [x] 7.1 Unit : `createEmptyNode()` génère un nœud valide, stableID unique, `addNode` + dirty
  - [x] 7.2 Integration : (optionnel) si endpoint create existe ; sinon couvrir via store
  - [x] 7.3 E2E : **1 test minimal** – créer nœud manuel → éditeur s'ouvre → sauvegarder. **Note :** Les E2E sont instables ; si un seul passe, c'est suffisant. Priorité basse.

## Dev Notes

### Contexte Epic et Story

**Epic 1: Amélioration et peaufinage de la génération de dialogues**
- Objectif : Réduire la friction, améliorer la qualité des dialogues, donner plus de contrôle à l'utilisateur.
- **Story 1.6** : Création manuelle de nœuds sans LLM. PRIORITÉ A.
- **Valeur :** Compléter le workflow (ajout de répliques précises, corrections sans IA).

**Dépendances :**
- Story 1.5 (édition manuelle) : **DONE**. Réutiliser `NodeEditorPanel` pour éditer le nœud créé.
- Story 1.4 (accept/reject) : **DONE**. Les nœuds manuels ne sont pas "pending" ; pas d’accept/reject.
- Epic 0 Story 0.1 (stableID) : Respecter unicité des IDs. Pas de champ technique exposé à l’IA.

### Vérification Codebase Existant

**Fichiers à étendre (pas de création ex nihilo) :**

| Fichier | Décision | Détail |
|--------|----------|--------|
| `frontend/src/store/graphStore.ts` | **Étendre** | `addNode(node)` existe. Ajouter `createEmptyNode(): Node` qui construit un nœud vide, appelle `addNode`, retourne le nœud. Ne pas dupliquer la logique d’ajout. |
| `frontend/src/components/graph/GraphEditor.tsx` | **Étendre** | Barre d’actions (l.452–561). Ajouter bouton "➕ Nouveau nœud" à côté de "✨ Générer nœud IA". Même pattern de `disabled` (dialogue sélectionné, pas de chargement). |
| `frontend/src/components/graph/NodeEditorPanel.tsx` | **Étendre si besoin** | Déjà utilisé pour l’édition. S’ouvre quand `selectedNodeId` est défini. Ajouter uniquement le warning "Nœud vide" à la sauvegarde si `line` vide (Task 5). |

**Backend :**
- Pas d’endpoint dédié actuel pour "créer nœud vide". Le graphe est édité en mémoire puis sauvegardé via `save_graph` (nœuds + edges).
- **Option A (recommandée) :** Création 100 % frontend. `createEmptyNode` → `addNode` → persistance via `saveDialogue` / export Unity existant. Cohérent avec le flux actuel.
- **Option B :** Si on souhaite un endpoint explicite plus tard : `POST /api/v1/unity-dialogues/graph/nodes` avec body `{ position?: { x, y } }`, retournant le nœud créé. À documenter, pas obligatoire pour cette story.

**Patterns à respecter :**
- **Zustand :** Mises à jour immuables, `markDirty()` après toute modification.
- **React Flow :** `Node` avec `id`, `type: 'dialogueNode'`, `position`, `data` conforme à `DialogueNodeData` (id, speaker, line, choices).
- **Unity JSON :** `data` du nœud ReactFlow est conservé tel quel dans la conversion (cf. `GraphConversionService`). Format identique aux nœuds générés.

### Project Structure Notes

- `frontend/src/store/graphStore.ts` : store graphe, CRUD, génération, accept/reject.
- `frontend/src/components/graph/` : `GraphEditor`, `GraphCanvas`, `NodeEditorPanel`, `DialogueNode`, etc.
- `frontend/src/schemas/nodeEditorSchema.ts` : `DialogueNodeData` (id, speaker, line, choices).
- `services/graph_conversion_service.py` : Unity ↔ ReactFlow. Les nœuds manuels suivent le même schéma.
- Pas de nouveau répertoire. Tout s’insère dans l’existant.

### E2E et Tests

- **E2E :** Un seul test minimal suffit : ouvrir un dialogue → "Nouveau nœud" → éditeur ouvert → sauvegarder. Si la stack E2E est instable, documenter et ne pas bloquer la story.
- **Unit :** Couvrir `createEmptyNode` et le flux bouton → `addNode` → `setSelectedNode`.
- **Integration :** Optionnel si pas d’API create.

### Bug connu : Nouveau nœud depuis un choix (panneau Détails)

**Contexte :** Création d'un nœud vide depuis le panneau Détails (bouton « ➕ Nouveau nœud » sur un choix, ex. Choix #2), puis sauvegarde et retour sur le dialogue (changement d'onglet / rechargement).

**Symptôme 1 :** Le nœud créé depuis le choix est **déconnecté** au retour : la liaison choix → nœud ne persiste pas après rechargement.

**Symptôme 2 :** Au moment où on clique sur « Nouveau nœud » pour un choix (ex. #2), **un autre choix déjà connecté (ex. Choix #1) se déconnecte** immédiatement.

**À ne pas confondre :** Le bouton « ➕ Nouveau nœud » global dans la barre du graphe fonctionne et la sauvegarde de ce nœud est correcte ; le problème ne concerne que le flux « Nouveau nœud » **depuis un choix** dans le panneau Détails.

### References

- [Source: _bmad-output/planning-artifacts/epics/epic-01.md#Story-1.6]
- [Source: _bmad-output/planning-artifacts/architecture/technical-foundation-existing-architecture.md]
- FR6 (création manuelle), FR22–35 (graph editor), Epic 0 Story 0.1 (stableID), Story 1.5 (édition)

## Dev Agent Record

### Agent Model Used

_(Cursor / agent dev)_

### Debug Log References

_(aucun)_

### Completion Notes List

- createEmptyNode(position?) dans graphStore : id `manual-${crypto.randomUUID()}`, type dialogueNode, data { id, speaker: '', line: '', choices: [] }. addNode + markDirty appelés par l'action bouton.
- Bouton "➕ Nouveau nœud" dans GraphEditor : désactivé si !selectedDialogue || isGraphLoading || isLoadingDialogue. Clic → createEmptyNode(position) → addNode → setSelectedNode.
- Position : offset (150 + count*40, 100 + count*40) pour éviter chevauchement (Task 4.1). Auto-layout disponible via bouton existant (Task 4.2).
- NodeEditorPanel : toast warning "Nœud vide - ajouter du texte" si line vide à la sauvegarde ; sauvegarde autorisée (placeholder).
- Task 3 (menu contextuel) non implémentée (optionnel).
- Tests unit : graphStore.createEmptyNode.test.ts (6 tests, tous verts). E2E : e2e/graph-manual-node.spec.ts (1 test minimal).
- Code review (2026-01-28) : correctifs appliqués — GraphEditor data-testid btn-new-manual-node, constantes MANUAL_NODE_OFFSET_X/Y/STEP, canEditGraph ; test unit assertion data shape ; E2E data-testid + waitForLoadState au lieu de waitForTimeout.

### File List

- frontend/src/store/graphStore.ts
- frontend/src/components/graph/GraphEditor.tsx
- frontend/src/components/graph/NodeEditorPanel.tsx
- frontend/src/__tests__/graphStore.createEmptyNode.test.ts
- e2e/graph-manual-node.spec.ts
- _bmad-output/implementation-artifacts/sprint-status.yaml

## Senior Developer Review (AI)

- **Date :** 2026-01-28
- **Résultat :** AC et tâches [x] validés. Correctifs MEDIUM/LOW appliqués (data-testid, constantes position, canEditGraph, assertion test unit, E2E robuste).
- **Statut :** done

## Change Log

- 2026-01-28: Story 1.6 implémentée (createEmptyNode, bouton Nouveau nœud, position, warning nœud vide, tests unit + E2E). Task 3 (menu contextuel) optionnelle non faite.
- 2026-01-28: Code review — correctifs appliqués (GraphEditor, tests, E2E). Story passée en done.
- 2026-01-28: Dev Notes — bug connu documenté : « Nouveau nœud » depuis un choix (panneau Détails) — déconnexion au retour + déconnexion d’un autre choix au clic.
