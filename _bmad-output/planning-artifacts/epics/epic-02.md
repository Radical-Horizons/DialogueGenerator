## Epic 2: Éditeur de graphe de dialogues

Les utilisateurs peuvent visualiser, naviguer et éditer la structure complète des dialogues dans un graphe interactif. Le système supporte des graphes larges (500+ nœuds), navigation fluide (zoom, pan, search, jump), édition (drag-and-drop, connexions), sélection multiple et actions contextuelles.

**FRs covered:** FR22-35 (visualisation, navigation, édition graphe, sélection multiple, undo/redo)

**NFRs covered:** NFR-P1 (Graph Rendering <1s pour 500 nodes), NFR-P4 (UI Responsiveness <100ms), NFR-SC3 (Graph Scalability 100+ nodes), NFR-A1 (Keyboard Navigation 100%)

**Valeur utilisateur:** Gérer visuellement des dialogues complexes (100+ nœuds) avec workflow fluide et navigation rapide.

**Dépendances:** Epic 0 (infrastructure), Epic 1 (dialogues à visualiser)

**Contrainte architecture (ADR-007):** Le canvas éditeur (GraphCanvas) doit être en mode controlled React Flow : nodes/edges proviennent uniquement du store ; toute modification du canvas doit respecter cette règle. Détails : `_bmad-output/planning-artifacts/architecture/v10-architectural-decisions-adrs.md` (ADR-007).

---

## ⚠️ GARDE-FOUS - Vérification de l'Existant (Scrum Master)

**OBLIGATOIRE avant création de chaque story de cet epic :**

> **Audit effectué le 2026-03-04** — Toutes les stories ont été alignées avec la codebase réelle.

### Checklist de Vérification

1. **Fichiers mentionnés dans les stories :**
   - [x] Vérifier existence avec `Glob` (pattern fichier) ou `Grep` (texte)
   - [x] Vérifier chemins corrects — validés contre `frontend/src/components/graph/` et `frontend/src/store/graphStore.ts`
   - [x] **DÉCISION** : `GraphCanvas.tsx`, `graphStore.ts`, `graph.py` → **ÉTENDRE**. Composants absents → **CRÉER** : `GraphSearchBar.tsx`, `JumpToNodeModal.tsx`, `GraphFiltersPanel.tsx`, `BatchOperationsMenu.tsx`, `ContextMenu.tsx` (documenté dans Dev Notes de chaque story).

2. **Composants/Services similaires :**
   - [x] Composants React existants : `GraphCanvas.tsx`, `DeleteNodeConfirmModal.tsx`, `ConfirmDialog.tsx` (shared), `useKeyboardShortcuts.ts`
   - [x] Store Zustand existant : `graphStore.ts` — actions disponibles : `setHighlightedNodes`, `updateNodePosition`, `connectNodes`, `disconnectNodes`, `deleteNode`, `setSelectedNode`, `applyAutoLayout`, `validateGraph`, `saveDialogue`
   - [x] Services Python existants : `graph.py` (router), `graph_conversion_service.py`, `graph_validation_service.py`, `graph_node_orchestrator.py`
   - [x] **DÉCISION** : **RÉUTILISER** `graphStore` + `GraphCanvas` pour toutes les extensions ; **CRÉER** uniquement les composants UI manquants.

3. **Endpoints API :**
   - [x] Namespace vérifié : tous les endpoints graphe sont sous `/api/v1/unity-dialogues/graph/*` (`api/routers/graph.py:41`)
   - [x] Endpoints existants : `POST /load`, `POST /save`, `POST /save-and-write`, `POST /generate-node`, `POST /validate`, `POST /calculate-layout`, `POST /nodes/{id}/accept`, `POST /nodes/{id}/reject`
   - [x] **DÉCISION** : **NE PAS créer** d'endpoints dédiés `/connections`, `/position`, `/batch-*`. La persistance de toutes modifications passe par `saveDialogue()` → `POST /save-and-write` (auto-save ADR-006). Stories 2.4, 2.5, 2.6, 2.11 corrigées en conséquence.
   - [x] **ANOMALIE À CORRIGER** : `api/middleware/cost_governance.py:24` référence `/api/v1/graph/generate-node` (chemin obsolète) au lieu de `/api/v1/unity-dialogues/graph/generate-node` → task séparée.

4. **Canvas graphe (ADR-007) :**
   - [x] Conforme : nodes/edges uniquement depuis le store (`GraphCanvas.tsx:3`, `:101-116`) — commentaire explicite en tête de fichier
   - [x] Conforme : `onNodesChange` → `deleteNode`, `setSelectedNode`, `updateNodePosition`, `updateNodeDimensions`, `schedulePositionUpdate` (`GraphCanvas.tsx:226-273`) ; `onEdgesChange` → `disconnectNodes` (`GraphCanvas.tsx:275-285`)
   - [x] Tests de non-régression présents : `frontend/src/__tests__/graphStore.controlledMode.test.ts`

5. **Patterns existants :**
   - [x] Zustand : updates immutables via `set`/`get`, interfaces typées (`GraphState`), actions explicites — conforme
   - [x] FastAPI : `APIRouter` + DI (`Depends`), schemas Pydantic, `request_id` systématique — conforme
   - [x] React : `memo()`, `useCallback()`, hooks centralisés (`useKeyboardShortcuts`), events via `window.dispatchEvent` — conforme

6. **Références croisées stories :**
   - [x] **CORRECTION APPLIQUÉE** : `Story 2.15` (undo/redo) n'existait pas dans cet epic → remplacé par `Story 2.14` dans les stories 2.6 et ses références.
   - [x] Correspondances validées : recherche = 2.7, jump = 2.8, filtres = 2.9, sélection multiple = 2.10, opérations batch = 2.11, menu contextuel = 2.12, auto-layout = 2.13, undo/redo = 2.14.

7. **Documentation des décisions :**
   - [x] Chaque story impactée contient une section **Dev Notes** avec la décision (RÉUTILISER / ÉTENDRE / CRÉER) et la justification.

---

### Story 2.1: Visualiser la structure de dialogue comme graphe (FR22)

As a **utilisateur créant des dialogues**,
I want **voir la structure de dialogue comme un graphe visuel (nœuds et connexions)**,
So that **je peux comprendre rapidement la structure narrative et les relations entre les nœuds**.

**Acceptance Criteria:**

**Given** j'ai un dialogue avec plusieurs nœuds et connexions
**When** j'ouvre l'éditeur de graphe
**Then** le graphe s'affiche avec tous les nœuds visibles (format React Flow)
**And** les connexions entre nœuds sont affichées comme des flèches (edges)
**And** le graphe se rend en <1 seconde pour 500+ nœuds (NFR-P1)

**Given** le graphe contient différents types de nœuds (dialogue, test, end)
**When** le graphe est affiché
**Then** chaque type de nœud a une couleur distincte (dialogue=bleu, test=orange, end=gris)
**And** les nœuds affichent le texte du dialogue (preview) et le speaker

**Given** le graphe est chargé
**When** je visualise le graphe
**Then** un minimap s'affiche en bas à droite montrant la vue d'ensemble
**And** un background avec grille aide à la navigation visuelle

**Given** le graphe est très large (500+ nœuds)
**When** le graphe est rendu
**Then** la virtualisation est activée (seuls les nœuds visibles sont rendus)
**And** la performance reste fluide (<1s rendu initial, <100ms interactions)

**Technical Requirements:**
- Frontend : Composant `GraphCanvas.tsx` **existant** (`frontend/src/components/graph/GraphCanvas.tsx`) — à optimiser pour la virtualisation
- Store : `useGraphStore` **existant** avec conversion Unity JSON → React Flow nodes/edges via API `/api/v1/unity-dialogues/graph/load`
- Types nœuds : `DialogueNode`, `TestNode`, `EndNode` + `StableLabelSmoothStepEdge` **existants** dans `frontend/src/components/graph/nodes/` et `edges/`
- Minimap : Composant `MiniMap` React Flow **déjà intégré** dans `GraphCanvas.tsx` avec couleurs par type nœud
- Background : Composant `Background` React Flow avec grille **déjà intégré** dans `GraphCanvas.tsx`
- Virtualisation : Activer `onlyRenderVisibleElements={true}` dans `GraphCanvas.tsx` (actuellement `false` — à passer en `true` pour 500+ nœuds)
- Tests : Unit (conversion JSON → graph), Integration (rendu graphe), E2E (affichage graphe)

**Dev Notes:**
- ÉTENDRE `GraphCanvas.tsx` : passer `onlyRenderVisibleElements` à `true` pour la performance sur grands graphes. Tester la rétrocompatibilité avec les nœuds de dimensions variables.

**References:** FR22 (visualisation graphe), NFR-P1 (Graph Rendering <1s), NFR-SC3 (Graph Scalability 100+ nodes)

---

### Story 2.2: Naviguer dans de grands graphes (500+ nœuds) (FR23)

As a **utilisateur créant des dialogues**,
I want **naviguer efficacement dans de grands graphes (500+ nœuds)**,
So that **je peux travailler sur des dialogues complexes sans perte de performance**.

**Acceptance Criteria:**

**Given** j'ai un graphe avec 500+ nœuds
**When** je charge le graphe
**Then** le graphe se charge en <1 seconde (NFR-P1)
**And** la navigation (zoom, pan) reste fluide (<100ms latence, NFR-P4)

**Given** je navigue dans un grand graphe
**When** je zoome et pan
**Then** seuls les nœuds visibles dans le viewport sont rendus (virtualisation)
**And** les nœuds hors viewport sont déchargés (mémoire optimisée)

**Given** je cherche un nœud spécifique dans un grand graphe
**When** j'utilise la recherche (voir Story 2.7)
**Then** le graphe se centre automatiquement sur le nœud trouvé
**And** le nœud est surligné (highlight) pour identification rapide

**Given** je navigue dans un grand graphe
**When** je change de dialogue
**Then** le graphe précédent est déchargé de la mémoire
**And** le nouveau graphe se charge rapidement (<1s)

**Given** je travaille sur un grand graphe
**When** je modifie un nœud (édition, déplacement)
**Then** seule la partie modifiée est re-rendue (optimisation React)
**And** le reste du graphe reste stable (pas de re-render complet)

**Technical Requirements:**
- Frontend : Activer `onlyRenderVisibleElements={true}` dans `GraphCanvas.tsx` (Story 2.1)
- Performance : Memoization composants nœuds avec `memo()` **déjà appliquée** sur `DialogueNode`, `TestNode`, `EndNode`, `GraphCanvas`, `GraphCanvasInner`
- Store : Pas de lazy loading nécessaire — le chargement complet via `loadDialogue()` + `POST /load` est suffisant pour la cible actuelle (500 nœuds)
- Navigation : `fitView()` React Flow **déjà utilisé** dans `GraphCanvasInner` (double rAF + setTimeout pour stabilité)
- Highlight : `setHighlightedNodes(nodeIds)` **existant** dans `graphStore.ts` + `highlightedNodeIds` consommé dans `GraphCanvas.tsx:142`
- Tests : Performance (mesurer rendu 500+ nodes), Integration (navigation fluide), E2E (workflow grand graphe)

**Dev Notes:**
- RÉUTILISER le mécanisme `highlightedNodeIds` + `setHighlightedNodes` existant pour le highlight des résultats de recherche (Story 2.7).
- Pas d'endpoint lazy loading à créer : la cible 500 nœuds est atteignable avec virtualisation React Flow.

**References:** FR23 (navigation grands graphes), NFR-P1 (Graph Rendering <1s), NFR-P4 (UI Responsiveness <100ms), NFR-SC3 (Graph Scalability 100+ nodes)

---

### Story 2.3: Zoom, pan, et focus sur zones spécifiques (FR24)

As a **utilisateur créant des dialogues**,
I want **zoomer, panner, et me concentrer sur des zones spécifiques du graphe**,
So that **je peux naviguer efficacement dans des graphes complexes et me concentrer sur des sections précises**.

**Acceptance Criteria:**

**Given** je suis dans l'éditeur de graphe
**When** je fais défiler la molette de la souris (ou pinch sur trackpad)
**Then** le graphe zoome in/out autour du curseur
**And** le niveau de zoom est affiché dans les contrôles (ex: "150%")

**Given** je veux panner le graphe
**When** je fais glisser avec le bouton gauche de la souris (ou espace+drag)
**Then** le graphe se déplace dans la direction du glissement
**And** la navigation reste fluide (<100ms latence, NFR-P4)

**Given** je veux me concentrer sur un nœud spécifique
**When** je double-clique sur un nœud (ou sélectionne + bouton "Focus")
**Then** le graphe se centre automatiquement sur ce nœud
**And** le nœud est zoomé à un niveau confortable (ex: 200% zoom)
**And** l'animation de transition est fluide (300ms)

**Given** je veux voir tout le graphe
**When** je clique sur "Fit View" (bouton dans contrôles ou Ctrl+0)
**Then** tout le graphe est visible dans le viewport
**And** le zoom est ajusté automatiquement pour afficher tous les nœuds

**Given** je navigue avec le clavier
**When** j'utilise les flèches directionnelles (ou WASD)
**Then** le graphe se déplace dans la direction de la flèche
**And** la navigation clavier est fluide (NFR-A1, 100% keyboard navigation)

**Technical Requirements:**
- Frontend : Composant `Controls` React Flow **déjà intégré** dans `GraphCanvas.tsx` (zoom in/out, fit view)
- Zoom : `useReactFlow().zoomIn()`, `zoomOut()` — natif React Flow, limites à configurer via `minZoom`/`maxZoom` sur `<ReactFlow>`
- Pan : Natif React Flow sur le fond du graphe (pane drag)
- Focus : `fitView({ nodes: [node], duration: 400, padding: 0.3 })` **déjà utilisé** dans `GraphCanvasInner` (event `focus-generated-node`)
- Snap to grid : `snapToGrid={true}`, `snapGrid={[15, 15]}` **déjà activés** dans `GraphCanvas.tsx`
- Keyboard : `useKeyboardShortcuts` **existant** — y ajouter raccourcis zoom/pan (flèches, WASD, Ctrl+0)
- Tests : Unit (zoom/pan logic), Integration (contrôles React Flow), E2E (navigation complète)

**Dev Notes:**
- ÉTENDRE `GraphCanvas.tsx` : ajouter `minZoom={0.1}` `maxZoom={2}` et raccourcis clavier zoom/pan dans `useKeyboardShortcuts`.
- RÉUTILISER l'event `focus-generated-node` + `fitView` existant pour la fonctionnalité de focus sur nœud (double-clic).

**References:** FR24 (zoom, pan, focus), NFR-P4 (UI Responsiveness <100ms), NFR-A1 (Keyboard Navigation 100%)

---

### Story 2.4: Drag-and-drop nœuds pour réorganiser layout (FR25)

As a **utilisateur créant des dialogues**,
I want **déplacer les nœuds par drag-and-drop pour réorganiser le layout du graphe**,
So that **je peux organiser visuellement le graphe selon ma préférence sans affecter la structure logique**.

**Acceptance Criteria:**

**Given** je suis dans l'éditeur de graphe
**When** je fais glisser un nœud avec le bouton gauche de la souris
**Then** le nœud suit le curseur pendant le glissement
**And** les connexions (edges) se mettent à jour en temps réel (redraw fluide)

**Given** je déplace un nœud
**When** je relâche le bouton de la souris
**Then** la nouvelle position est sauvegardée dans le dialogue
**And** l'auto-save (Epic 0 Story 0.5) sauvegarde la position dans les 2 minutes

**Given** je déplace plusieurs nœuds en sélection multiple
**When** je sélectionne 3 nœuds (shift-click) et les déplace
**Then** tous les nœuds sélectionnés se déplacent ensemble (groupe)
**And** les positions relatives entre nœuds sont préservées

**Given** je déplace un nœud près d'un autre nœud
**When** le nœud est proche (snap distance)
**Then** le nœud s'aligne automatiquement sur la grille (snap to grid)
**And** un indicateur visuel montre l'alignement (ligne guide)

**Given** je déplace un nœud hors du viewport
**When** le nœud est déplacé hors écran
**Then** le graphe panne automatiquement pour suivre le nœud (auto-pan)
**And** le nœud reste visible pendant le déplacement

**Technical Requirements:**
- Frontend : `onNodeDragStop` handler **existant** dans `GraphCanvas.tsx:325-340` — commit position finale + annulation du RAF en attente
- Store : `useGraphStore.updateNodePosition(nodeId, position)` **existant** dans `graphStore.ts:1380` — met à jour la position dans l'état, déclenche `markDirty()` → auto-save
- Persistance : Via auto-save `saveDialogue()` → `POST /api/v1/unity-dialogues/graph/save-and-write` (ADR-006, pas d'endpoint dédié `/position`)
- Throttle : RAF throttle pendant le drag via `schedulePositionUpdate` **existant** dans `GraphCanvas.tsx:216-224` (évite le scintillement)
- Snap to grid : `snapToGrid={true}`, `snapGrid={[15, 15]}` **déjà activés** dans `GraphCanvas.tsx:381-382`
- Auto-pan : Natif React Flow (le canvas panne automatiquement lors du drag hors viewport)
- Tests : Unit (drag logic + updateNodePosition), Integration (auto-save déclenché), E2E (workflow drag-and-drop)

**Dev Notes:**
- RÉUTILISER entièrement le mécanisme existant — `onNodeDragStop` + `updateNodePosition` + `markDirty` + auto-save.
- Pas d'endpoint PUT dédié `/position` : la position est persistée dans le JSON complet via `save-and-write`.
- La sélection multiple pour déplacer en groupe dépend de Story 2.10 (activer `multiSelectionKeyCode` dans `GraphCanvas.tsx`).

**References:** FR25 (drag-and-drop), Epic 0 Story 0.5 (auto-save), Story 2.10 (sélection multiple)

---

### Story 2.5: Créer connexions entre nœuds manuellement (FR26)

As a **utilisateur créant des dialogues**,
I want **créer des connexions entre nœuds manuellement**,
So that **je peux définir le flux narratif et les relations entre les dialogues**.

**Acceptance Criteria:**

**Given** je suis dans l'éditeur de graphe
**When** je survole un nœud
**Then** des handles de connexion apparaissent (points de connexion sur les bords du nœud)
**And** les handles sont visibles et cliquables

**Given** je veux créer une connexion
**When** je clique et maintiens sur un handle de connexion, puis glisse vers un autre nœud
**Then** une ligne de prévisualisation suit le curseur (edge preview)
**And** quand je relâche sur un handle de l'autre nœud, la connexion est créée

**Given** je crée une connexion
**When** la connexion est créée
**Then** la connexion apparaît dans le graphe comme une flèche (edge)
**And** la connexion est sauvegardée dans le dialogue (persistée)
**And** l'auto-save (Epic 0 Story 0.5) sauvegarde la connexion

**Given** je crée une connexion avec un label (texte choix joueur)
**When** je crée la connexion
**Then** je peux éditer le label de la connexion (double-clic sur edge)
**And** le label s'affiche sur la connexion (ex: "Accepter", "Refuser")

**Given** je crée une connexion qui crée un cycle
**When** la connexion est créée
**Then** un warning s'affiche "Cycle détecté" (non-bloquant, voir Epic 0 Story 0.6)
**And** la connexion est créée quand même (cycles autorisés)

**Technical Requirements:**
- Frontend : `onConnect` handler **existant** dans `GraphCanvas.tsx:298-323` — gère types `choice`, `success`, `failure`, `default`
- Handles : Composants `Handle` React Flow **déjà présents** dans `DialogueNode.tsx`, `TestNode.tsx`, `EndNode.tsx`
- Store : `useGraphStore.connectNodes(fromNodeId, toNodeId, choiceIndex?, connectionType)` **existant** dans `graphStore.ts:1042` — normalise les TestBars et marque dirty
- Persistance : Via auto-save `saveDialogue()` → `POST /api/v1/unity-dialogues/graph/save-and-write` (pas d'endpoint dédié `/connections`)
- Labels : Edge via `StableLabelSmoothStepEdge` **existant** dans `frontend/src/components/graph/edges/`
- Validation cycles : Via `validateGraph()` → `POST /api/v1/unity-dialogues/graph/validate` après création
- Tests : Unit (création connexion + connectNodes), Integration (auto-save déclenché), E2E (workflow connexion)

**Dev Notes:**
- RÉUTILISER entièrement le mécanisme existant — `onConnect` + `connectNodes` + `markDirty` + auto-save.
- Pas d'endpoint POST dédié `/connections` : la connexion est persistée dans le JSON complet via `save-and-write`.

**References:** FR26 (créer connexions), Epic 0 Story 0.5 (auto-save), Epic 0 Story 0.6 (validation cycles)

---

### Story 2.6: Supprimer connexions entre nœuds (FR27)

As a **utilisateur créant des dialogues**,
I want **supprimer des connexions entre nœuds**,
So that **je peux modifier le flux narratif et supprimer des relations non désirées**.

**Acceptance Criteria:**

**Given** j'ai une connexion entre deux nœuds dans le graphe
**When** je sélectionne la connexion (clic sur l'edge) et appuie sur Delete
**Then** une confirmation s'affiche "Supprimer cette connexion ?"
**And** j'ai les options "Supprimer" et "Annuler"

**Given** je confirme la suppression
**When** la connexion est supprimée
**Then** la connexion disparaît du graphe
**And** la connexion est supprimée du dialogue (persistée)
**And** l'auto-save (Epic 0 Story 0.5) sauvegarde la suppression

**Given** je supprime une connexion par erreur
**When** je supprime la connexion
**Then** je peux annuler avec Ctrl+Z (undo, voir Story 2.14)
**And** la connexion est restaurée

**Given** je supprime plusieurs connexions en sélection multiple
**When** je sélectionne 3 connexions (shift-click) et appuie sur Delete
**Then** une confirmation s'affiche "Supprimer 3 connexions ?"
**And** toutes les connexions sélectionnées sont supprimées en une seule action

**Given** je supprime une connexion qui isole un nœud (orphan)
**When** la connexion est supprimée
**Then** un warning s'affiche "Nœud orphelin détecté" (validation structurelle, voir Epic 4)
**And** le nœud reste dans le graphe (pas supprimé automatiquement)

**Technical Requirements:**
- Frontend : `onEdgesChange` handler **existant** dans `GraphCanvas.tsx:275-285` — déclenche `disconnectNodes(edgeId)` sur changement `remove`
- Store : `useGraphStore.disconnectNodes(edgeId)` **existant** dans `graphStore.ts:1253` — supprime l'edge et met à jour les choix parents si TestNode impliqué
- Confirmation : `ConfirmDialog.tsx` **existant** dans `frontend/src/components/shared/` — à intégrer pour les suppressions d'edges (actuellement seulement pour les nœuds via `DeleteNodeConfirmModal.tsx`)
- Persistance : Via auto-save `saveDialogue()` → `POST /api/v1/unity-dialogues/graph/save-and-write` (pas d'endpoint DELETE dédié)
- Undo/Redo : Integration avec Story 2.14 (undo/redo) pour restaurer connexions
- Validation : Integration avec Epic 4 (détection orphans)
- Tests : Unit (suppression connexion + disconnectNodes), Integration (auto-save), E2E (workflow suppression + undo)

**Dev Notes:**
- RÉUTILISER `disconnectNodes` (nom réel dans le store, pas `deleteConnection`).
- RÉUTILISER `ConfirmDialog.tsx` existant pour la confirmation avant suppression d'edge.
- Pas d'endpoint DELETE dédié : persistance via `save-and-write`.
- L'undo est dans Story 2.14 — ce AC n'est pleinement livrable qu'après Story 2.14.

**References:** FR27 (supprimer connexions), Epic 0 Story 0.5 (auto-save), Story 2.14 (undo/redo), Epic 4 (validation)

---

### Story 2.7: Rechercher nœuds par contenu texte ou nom speaker (FR28)

As a **utilisateur créant des dialogues**,
I want **rechercher des nœuds par contenu texte ou nom du speaker**,
So that **je peux trouver rapidement des nœuds spécifiques dans de grands graphes**.

**Acceptance Criteria:**

**Given** je suis dans l'éditeur de graphe
**When** j'ouvre la barre de recherche (Ctrl+F ou bouton "Rechercher")
**Then** un champ de recherche s'affiche en haut du graphe
**And** je peux saisir du texte pour rechercher

**Given** je recherche un texte (ex: "bonjour")
**When** je saisis "bonjour" dans la recherche
**Then** tous les nœuds contenant "bonjour" dans leur texte sont surlignés (highlight)
**And** un compteur s'affiche "3 résultats trouvés"
**And** je peux naviguer entre les résultats (boutons Précédent/Suivant)

**Given** je recherche par nom de speaker (ex: "Akthar")
**When** je saisis "Akthar" dans la recherche
**Then** tous les nœuds avec speaker "Akthar" sont surlignés
**And** le graphe se centre automatiquement sur le premier résultat

**Given** je recherche avec plusieurs critères
**When** je recherche "bonjour" ET speaker "Akthar"
**Then** seuls les nœuds correspondant aux deux critères sont surlignés
**And** les résultats sont filtrés en temps réel (pas besoin de valider)

**Given** je ferme la recherche (Escape ou bouton Fermer)
**When** la recherche est fermée
**Then** tous les highlights sont supprimés
**And** le graphe revient à l'état normal

**Technical Requirements:**
- Frontend : **CRÉER** composant `GraphSearchBar.tsx` dans `frontend/src/components/graph/` — champ recherche + filtres (texte, speaker), boutons Précédent/Suivant
- Store : **CRÉER** action `useGraphStore.searchNodes(query, filters)` dans `graphStore.ts` — recherche dans `nodes` du store, retourne les IDs correspondants
- Highlight : `useGraphStore.setHighlightedNodes(nodeIds)` **existant** dans `graphStore.ts:2147` — réutiliser pour surligner les résultats
- Navigation résultats : `fitView({ nodes: [node], duration: 400, padding: 0.3 })` — réutiliser le mécanisme de `GraphCanvasInner` via l'event `focus-generated-node` ou équivalent
- Keyboard : **ÉTENDRE** `useKeyboardShortcuts` — ajouter `ctrl+f` pour ouvrir/fermer la recherche
- Tests : Unit (logique searchNodes), Integration (highlight résultats), E2E (workflow recherche)

**Dev Notes:**
- CRÉER `GraphSearchBar.tsx` (nouveau composant, aucun similaire dans `frontend/src/components/graph/`).
- CRÉER `searchNodes` dans `graphStore.ts` — logique purement côté client (filtrer `state.nodes` sur `data.line` et `data.speaker`), pas d'appel backend.
- RÉUTILISER `setHighlightedNodes` + `highlightedNodeIds` **existants** pour le rendu highlight dans `GraphCanvas.tsx:142`.
- RÉUTILISER le mécanisme `focus-generated-node` / `fitView` existant pour centrer sur les résultats.

**References:** FR28 (recherche nœuds), NFR-A1 (Keyboard Navigation 100%), Story 2.8 (jump to node)

---

### Story 2.8: Jump to nœud spécifique par ID ou nom (FR29)

As a **utilisateur créant des dialogues**,
I want **sauter directement à un nœud spécifique par ID ou nom**,
So that **je peux naviguer rapidement vers un nœud précis sans chercher manuellement**.

**Acceptance Criteria:**

**Given** je suis dans l'éditeur de graphe
**When** j'ouvre le panneau "Jump to Node" (Ctrl+G ou menu)
**Then** un champ de saisie s'affiche pour ID ou nom de nœud
**And** une liste de suggestions apparaît (autocomplete) avec nœuds correspondants

**Given** je saisis un ID de nœud (ex: "node_abc123")
**When** je valide (Enter)
**Then** le graphe se centre automatiquement sur ce nœud
**And** le nœud est sélectionné pour identification

**Given** je saisis un nom de nœud (ex: "Opening Scene")
**When** je valide
**Then** le nœud correspondant est trouvé (recherche par displayName)
**And** le graphe se centre sur ce nœud avec animation

**Given** plusieurs nœuds correspondent au nom saisi
**When** je saisis un nom ambigu (ex: "Scene 1")
**Then** une liste de nœuds correspondants s'affiche
**And** je peux sélectionner le nœud désiré dans la liste

**Given** le nœud recherché n'existe pas
**When** je saisis un ID/nom invalide
**Then** un message d'erreur s'affiche "Nœud non trouvé"
**And** le graphe reste inchangé

**Technical Requirements:**
- Frontend : **CRÉER** composant `JumpToNodeModal.tsx` dans `frontend/src/components/graph/` — champ recherche avec autocomplete sur les nœuds du store
- Store : **CRÉER** action `useGraphStore.jumpToNode(nodeId)` dans `graphStore.ts` — appelle `setSelectedNode(nodeId)` puis dispatch event `focus-generated-node`
- Navigation : Réutiliser le mécanisme **existant** `focus-generated-node` → `GraphCanvasInner:56-75` (`fitView({ nodes: [node], duration: 400, padding: 0.3 })`)
- Highlight : `setSelectedNode(nodeId)` **existant** dans `graphStore.ts:1375` pour surligner le nœud cible
- Keyboard : `ctrl+g` **déjà enregistré** dans `GraphEditor.tsx` (ouvre `AIGenerationPanel`) — utiliser un raccourci différent (ex: `ctrl+j`) ou supprimer le conflit
- Tests : Unit (jumpToNode + focus event), Integration (navigation graphe), E2E (workflow jump)

**Dev Notes:**
- CRÉER `JumpToNodeModal.tsx` (aucun composant similaire existant dans `frontend/src/components/graph/`).
- CRÉER `jumpToNode` dans `graphStore.ts` — wrapper léger sur `setSelectedNode` + dispatch `focus-generated-node`.
- RÉUTILISER l'event `focus-generated-node` **existant** dans `GraphCanvasInner` — c'est exactement le mécanisme dont on a besoin.
- **ATTENTION** : `ctrl+g` est déjà pris par l'AI Generation Panel dans `GraphEditor.tsx` — choisir `ctrl+j` pour jump.

**References:** FR29 (jump to node), Story 2.7 (recherche), NFR-A1 (Keyboard Navigation 100%)

---

### Story 2.9: Filtrer vue graphe (show/hide types nœuds, speakers) (FR30)

As a **utilisateur créant des dialogues**,
I want **filtrer la vue du graphe (afficher/masquer types de nœuds, speakers)**,
So that **je peux me concentrer sur des parties spécifiques du dialogue sans distraction**.

**Acceptance Criteria:**

**Given** je suis dans l'éditeur de graphe
**When** j'ouvre le panneau "Filtres" (bouton ou menu)
**Then** des options de filtrage s'affichent : types de nœuds (dialogue/test/end), speakers, tags

**Given** je désactive le filtre "Test Nodes"
**When** le filtre est appliqué
**Then** tous les nœuds de type "test" sont masqués du graphe
**And** les connexions vers/depuis ces nœuds sont également masquées
**And** un indicateur "3 nœuds masqués" s'affiche

**Given** je filtre par speaker (ex: "Afficher uniquement Akthar")
**When** le filtre est appliqué
**Then** seuls les nœuds avec speaker "Akthar" sont visibles
**And** tous les autres nœuds sont masqués
**And** les connexions entre nœuds visibles restent affichées

**Given** je combine plusieurs filtres (types + speakers)
**When** j'applique "Dialogue nodes" ET "Speaker: Akthar"
**Then** seuls les nœuds dialogue avec speaker Akthar sont visibles
**And** les filtres sont appliqués en temps réel (pas besoin de valider)

**Given** je réinitialise les filtres
**When** je clique sur "Réinitialiser filtres"
**Then** tous les nœuds redeviennent visibles
**And** les filtres sont effacés

**Technical Requirements:**
- Frontend : **CRÉER** composant `GraphFiltersPanel.tsx` dans `frontend/src/components/graph/` — checkboxes types nœuds + dropdown speakers extraits de `state.nodes`
- Store : **CRÉER** état `graphFilters` + action `useGraphStore.setFilters(filters)` dans `graphStore.ts` — état filtres (types visibles, speakers autorisés)
- Filtrage : **ÉTENDRE** `GraphCanvas.tsx` — dériver `filteredNodes` et `filteredEdges` depuis les nodes/edges du store avant le `useMemo` de rendu (même pattern que le filtrage `validationErrors` déjà présent)
- Connexions masquées : Filtrer les edges dont `source` ou `target` est un nœud masqué
- Indicateur : Badge "X nœuds masqués" dans `GraphFiltersPanel.tsx`
- Tests : Unit (logique setFilters), Integration (filtres dans GraphCanvas), E2E (workflow filtres)

**Dev Notes:**
- CRÉER `GraphFiltersPanel.tsx` et l'état `graphFilters` dans `graphStore.ts`.
- ÉTENDRE `GraphCanvas.tsx` : le filtrage de nodes doit s'intercaler avant la dérivation des nodes enrichis (entre `storeNodes` et le `useMemo` de rendu) — exactement comme le `validationErrors` filter existant ligne 139.
- Aucun appel backend nécessaire : filtrage 100% client.

**References:** FR30 (filtrer vue graphe), Story 2.7 (recherche), Story 2.11 (sélection multiple)

---

### Story 2.10: Sélection multiple nœuds (shift-click, lasso selection) (FR31)

As a **utilisateur créant des dialogues**,
I want **sélectionner plusieurs nœuds en même temps (shift-click, lasso selection)**,
So that **je peux appliquer des opérations en lot sur plusieurs nœuds**.

**Acceptance Criteria:**

**Given** je suis dans l'éditeur de graphe
**When** je clique sur un nœud, puis shift-clic sur un autre nœud
**Then** les deux nœuds sont sélectionnés (highlight visuel)
**And** un compteur s'affiche "2 nœuds sélectionnés"

**Given** je veux sélectionner plusieurs nœuds avec lasso
**When** je maintiens le clic sur le fond (pane drag) pour dessiner un rectangle de sélection
**Then** tous les nœuds dans le rectangle sont sélectionnés
**And** le rectangle de sélection est visible pendant le drag

**Given** j'ai plusieurs nœuds sélectionnés
**When** je déplace un nœud sélectionné (drag)
**Then** tous les nœuds sélectionnés se déplacent ensemble (groupe)
**And** les positions relatives entre nœuds sont préservées

**Given** j'ai plusieurs nœuds sélectionnés
**When** j'applique une opération (supprimer, taguer, valider - voir Story 2.11)
**Then** l'opération s'applique à tous les nœuds sélectionnés
**And** un message de confirmation s'affiche "Opération appliquée à X nœuds"

**Given** je clique sur un espace vide du graphe
**When** je clique sur le pane (fond)
**Then** la sélection multiple est désélectionnée
**And** tous les nœuds reviennent à l'état normal

**Technical Requirements:**
- Frontend : **ÉTENDRE** `GraphCanvas.tsx` — ajouter `multiSelectionKeyCode="Shift"` et `selectionOnDrag={true}` sur `<ReactFlow>` (props React Flow natifs, non activés actuellement)
- Store : **CRÉER** état `selectedNodeIds: string[]` + action `useGraphStore.setSelectedNodes(nodeIds)` dans `graphStore.ts` — pour les opérations batch de Story 2.11
- Sélection React Flow : React Flow gère la sélection visuelle nativement via `multiSelectionKeyCode` — intercepter `onSelectionChange` pour synchroniser `selectedNodeIds` dans le store
- Déplacement groupe : Natif React Flow quand plusieurs nœuds sont sélectionnés — `onNodeDragStop` doit appeler `updateNodePosition` pour chaque nœud sélectionné
- Tests : Unit (setSelectedNodes), Integration (sélection store), E2E (workflow sélection multiple)

**Dev Notes:**
- ÉTENDRE `GraphCanvas.tsx` : ajouter `multiSelectionKeyCode`, `selectionOnDrag`, `onSelectionChange` sur le composant `<ReactFlow>`.
- CRÉER `selectedNodeIds` et `setSelectedNodes` dans `graphStore.ts` — état distinct de `selectedNodeId` (sélection simple existante).
- React Flow gère le rendu visuel de multi-sélection nativement (pas de `selected: true` à setter manuellement dans le store pour chaque nœud).

**References:** FR31 (sélection multiple), Story 2.11 (opérations batch), Story 2.4 (drag-and-drop)

---

### Story 2.11: Appliquer opérations à nœuds sélectionnés (delete, tag, validate) (FR32)

As a **utilisateur créant des dialogues**,
I want **appliquer des opérations à plusieurs nœuds sélectionnés (supprimer, taguer, valider)**,
So that **je peux gérer efficacement de grands graphes avec des actions en lot**.

**Acceptance Criteria:**

**Given** j'ai plusieurs nœuds sélectionnés (voir Story 2.10)
**When** j'ouvre le menu contextuel (clic droit) ou la barre d'outils
**Then** des options d'opérations batch s'affichent : "Supprimer sélection", "Tagger sélection", "Valider sélection"

**Given** je sélectionne "Supprimer sélection"
**When** je confirme la suppression
**Then** tous les nœuds sélectionnés sont supprimés
**And** une confirmation s'affiche "X nœuds supprimés"
**And** les connexions vers/depuis ces nœuds sont également supprimées

**Given** je sélectionne "Tagger sélection"
**When** je choisis un tag (ex: "À réviser")
**Then** tous les nœuds sélectionnés reçoivent ce tag
**And** les nœuds affichent visuellement le tag (badge ou couleur)

**Given** je sélectionne "Valider sélection"
**When** la validation est lancée
**Then** tous les nœuds sélectionnés sont validés (structure, lore, qualité - voir Epic 4)
**And** un rapport de validation s'affiche avec résultats par nœud

**Given** une opération batch échoue partiellement (ex: 3/5 nœuds supprimés)
**When** l'opération se termine
**Then** un message d'erreur détaillé s'affiche "3 nœuds supprimés, 2 échecs: [raisons]"
**And** les nœuds réussis sont traités, les échecs restent inchangés

**Technical Requirements:**
- Frontend : **CRÉER** composant `BatchOperationsMenu.tsx` dans `frontend/src/components/graph/` — barre d'outils contextuelle affichée quand `selectedNodeIds.length > 1`
- Store : **CRÉER** action `useGraphStore.batchDeleteNodes(nodeIds)` dans `graphStore.ts` — itère sur `deleteNode(id)` **existant** pour chaque nœud, puis `markDirty()` unique
- Tagging : **CRÉER** action `useGraphStore.batchTagNodes(nodeIds, tag)` — modifie `node.data.tag` pour chaque nœud via `updateNode()` existant ; pas d'endpoint dédié
- Validation batch : Réutiliser `validateGraph()` **existant** → `POST /api/v1/unity-dialogues/graph/validate` (valide tout le graphe, filtrer les erreurs par nœud sélectionné)
- Persistance : Via auto-save `saveDialogue()` → `POST /api/v1/unity-dialogues/graph/save-and-write` (pas d'endpoints batch dédiés)
- Feedback : `useToast` **existant** pour les notifications de résultats batch
- Tests : Unit (batchDeleteNodes, batchTagNodes), Integration (auto-save après batch), E2E (workflow batch)

**Dev Notes:**
- CRÉER `BatchOperationsMenu.tsx` (aucun composant similaire existant).
- CRÉER `batchDeleteNodes` et `batchTagNodes` dans `graphStore.ts` — implémentation simple en boucle sur actions existantes, pas d'appels API dédiés.
- Pas d'endpoints batch côté backend : `deleteNode` + `save-and-write` suffit.
- La validation batch réutilise `validateGraph()` complet côté store — filtrer côté UI par `selectedNodeIds`.

**References:** FR32 (opérations batch), Story 2.10 (sélection multiple), Epic 4 (validation)

---

### Story 2.12: Actions contextuelles sur nœuds (menu clic droit) (FR33)

As a **utilisateur créant des dialogues**,
I want **accéder à des actions contextuelles sur les nœuds via un menu clic droit**,
So that **je peux accéder rapidement aux opérations courantes sans naviguer dans l'interface**.

**Acceptance Criteria:**

**Given** je suis dans l'éditeur de graphe
**When** je fais un clic droit sur un nœud
**Then** un menu contextuel s'affiche avec options : "Éditer", "Dupliquer", "Supprimer", "Valider", "Voir prompt", etc.

**Given** je sélectionne "Éditer" dans le menu contextuel
**When** l'option est cliquée
**Then** le panneau d'édition s'ouvre pour ce nœud (voir Story 1.5)
**And** le menu contextuel se ferme

**Given** je sélectionne "Dupliquer" dans le menu contextuel
**When** l'option est cliquée
**Then** le nœud est dupliqué (voir Story 1.7)
**And** le menu contextuel se ferme

**Given** je sélectionne "Voir prompt" dans le menu contextuel
**When** l'option est cliquée
**Then** le modal de prompt transparency s'ouvre (voir Story 1.14)
**And** le prompt de génération de ce nœud est affiché

**Given** je fais un clic droit sur un espace vide (pane)
**When** le menu contextuel s'affiche
**Then** des options globales s'affichent : "Nouveau nœud", "Auto-layout", etc.
**And** les options sont adaptées au contexte (pane vs nœud)

**Technical Requirements:**
- Frontend : **CRÉER** composant `ContextMenu.tsx` dans `frontend/src/components/graph/` — menu custom avec position absolue calculée depuis l'event clic droit
- Handlers : **ÉTENDRE** `GraphCanvas.tsx` — ajouter `onNodeContextMenu` et `onPaneContextMenu` props sur `<ReactFlow>` + état local `contextMenuState` (nodeId, position x/y)
- Actions "Éditer" : `setSelectedNode(nodeId)` **existant** (ouvre automatiquement `NodeEditorPanel`)
- Actions "Supprimer" : `setShowDeleteNodeConfirm(true)` **existant** dans le store
- Actions "Dupliquer" : dispatch event `open-ai-generation-panel` **existant** ou action dédiée selon Story 1.7
- Actions "Voir prompt" : dépend de Story 1.14 (prompt transparency)
- Actions "Nouveau nœud" (pane) : `createEmptyNode()` + `addNode()` **existants** dans le store
- Tests : Unit (menu contextuel + actions), Integration (interactions nœuds), E2E (workflow menu contextuel)

**Dev Notes:**
- CRÉER `ContextMenu.tsx` (aucun composant similaire dans `frontend/src/components/graph/`).
- ÉTENDRE `GraphCanvas.tsx` : ajouter `onNodeContextMenu`, `onPaneContextMenu` et l'état local de position du menu (pattern `{nodeId, x, y} | null`).
- Fermer le menu sur `onPaneClick` (déjà géré) et sur `Escape` via `useKeyboardShortcuts`.
- RÉUTILISER `createEmptyNode` + `addNode` + `setSelectedNode` + `setShowDeleteNodeConfirm` **existants**.

**References:** FR33 (actions contextuelles), Story 1.5 (éditer), Story 1.7 (dupliquer), Story 1.14 (prompt)

---

### Story 2.13: Auto-layout graphe pour lisibilité (FR34)

As a **utilisateur créant des dialogues**,
I want **que le système organise automatiquement le layout du graphe pour la lisibilité**,
So that **je peux voir clairement la structure narrative sans organiser manuellement chaque nœud**.

**Acceptance Criteria:**

**Given** j'ai un graphe avec des nœuds désorganisés (positions aléatoires)
**When** je clique sur "Auto-layout" (bouton dans contrôles ou menu)
**Then** le graphe est réorganisé automatiquement avec un algorithme de layout (ex: dagre, hierarchical)
**And** les nœuds sont positionnés de manière lisible (pas de chevauchements, espacement cohérent)

**Given** le graphe a une structure hiérarchique (START → nœuds → END)
**When** l'auto-layout est appliqué
**Then** le layout hiérarchique est respecté (nœuds parents en haut, enfants en bas)
**And** les niveaux sont clairement visibles (alignement horizontal par niveau)

**Given** le graphe a des cycles (boucles)
**When** l'auto-layout est appliqué
**Then** les cycles sont gérés intelligemment (layout circulaire ou détection cycles)
**And** le graphe reste lisible malgré les cycles

**Given** je modifie le graphe après auto-layout
**When** j'ajoute un nouveau nœud
**Then** le nouveau nœud est positionné intelligemment (près du nœud parent, pas de chevauchement)

**Technical Requirements:**
- Store : `useGraphStore.applyAutoLayout(algorithm, direction)` **existant** dans `graphStore.ts:2076` — appelle `POST /api/v1/unity-dialogues/graph/calculate-layout`
- Backend : Endpoint `POST /api/v1/unity-dialogues/graph/calculate-layout` **existant** dans `api/routers/graph.py:423` — retourne les positions calculées
- UI : Bouton "Auto-layout" **déjà présent** dans `GraphEditor.tsx` (handler `handleAutoLayout`, `Ctrl+L`)
- Options direction : `'TB'`, `'LR'`, `'BT'`, `'RL'` — déjà supportés par le store et l'API
- Algorithme : Implémenté côté backend (`graph_layout_service` ou équivalent) — pas de dagre.js côté client
- Tests : Unit (applyAutoLayout store), Integration (API calculate-layout), E2E (workflow auto-layout)

**Dev Notes:**
- FONCTIONNALITÉ DÉJÀ IMPLÉMENTÉE dans le store et l'API backend.
- L'algorithme de layout est côté backend (pas dagre.js côté client) — ne pas ajouter de dépendance client dagre/elkjs.
- Le bouton et les raccourcis clavier existent dans `GraphEditor.tsx`.
- Cette story est en grande partie prête — vérification et tests suffisent.

**References:** FR34 (auto-layout), Story 2.4 (drag-and-drop), NFR-P1 (Graph Rendering <1s)

---

### Story 2.14: Undo/Redo opérations graphe (FR35)

As a **utilisateur créant des dialogues**,
I want **annuler et refaire les opérations d'édition du graphe (undo/redo)**,
So that **je peux corriger mes erreurs et itérer sur le design sans crainte**.

**Acceptance Criteria:**

**Given** je modifie le graphe (déplacer nœud, créer connexion, supprimer nœud)
**When** je fais une modification
**Then** l'opération est ajoutée à l'historique undo/redo
**And** le bouton "Undo" devient actif (Ctrl+Z disponible)

**Given** je fais une erreur (suppression accidentelle)
**When** j'appuie sur Ctrl+Z (ou bouton "Undo")
**Then** la dernière opération est annulée
**And** le graphe revient à l'état précédent (nœud restauré, connexion supprimée, etc.)

**Given** j'ai annulé plusieurs opérations
**When** j'appuie sur Ctrl+Y (ou bouton "Redo")
**Then** la dernière opération annulée est refaite
**And** le graphe revient à l'état après cette opération

**Given** je fais une nouvelle modification après avoir annulé
**When** je modifie le graphe après undo
**Then** l'historique redo est effacé (pas de branchement)
**And** seul l'historique undo est disponible

**Given** je consulte l'historique undo/redo
**When** j'ouvre le menu "Historique" (ou Ctrl+Shift+Z)
**Then** une liste des opérations récentes s'affiche (dernières 50 opérations)
**And** je peux sauter à n'importe quel point de l'historique (non-linéaire si supporté)

**Technical Requirements:**
- Store : **CRÉER** dans `graphStore.ts` — état `undoStack: GraphSnapshot[]`, `redoStack: GraphSnapshot[]` avec `type GraphSnapshot = { nodes: Node[]; edges: Edge[] }`
- Store : **CRÉER** actions `undo()`, `redo()`, `canUndo(): boolean`, `canRedo(): boolean`
- Snapshot : **CRÉER** helper `_pushUndoSnapshot()` — à appeler dans chaque action mutante (`addNode`, `deleteNode`, `connectNodes`, `disconnectNodes`, `updateNodePosition`) avant la modification
- Limite : Stack limité à 50 snapshots pour éviter les fuites mémoire
- Keyboard : **ÉTENDRE** `useKeyboardShortcuts` dans `GraphEditor.tsx` — ajouter `ctrl+z` (undo) et `ctrl+y` / `ctrl+shift+z` (redo)
- UI : Boutons Undo/Redo dans `GraphEditor.tsx` toolbar avec état disabled quand `!canUndo()` / `!canRedo()`
- Tests : Unit (undo/redo logic + stack), Integration (historique store), E2E (workflow undo/redo)

**Dev Notes:**
- CRÉER le système undo/redo entièrement (aucune base existante dans `graphStore.ts`).
- Pattern : snapshots d'état (Memento) — sauvegarder `{ nodes, edges }` avant chaque mutation. Éviter les snapshots sur `updateNodePosition` pendant le drag (seulement sur `onNodeDragStop`).
- Ne pas sauvegarder les snapshots lors des rechargements (`loadDialogue`, `resetGraph`) — réinitialiser les stacks.
- `ctrl+z` n'est pas encore dans `useKeyboardShortcuts` — l'ajouter en vérifiant qu'il ne conflicte pas avec les inputs.

**References:** FR35 (undo/redo), Story 2.4 (drag-and-drop), Story 2.5 (créer connexions), Story 2.6 (supprimer connexions)

---
