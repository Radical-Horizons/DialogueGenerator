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

### Checklist de Vérification

1. **Fichiers mentionnés dans les stories :**
   - [ ] Vérifier existence avec `glob_file_search` ou `grep`
   - [ ] Vérifier chemins corrects (ex: `core/llm/` vs `services/llm/`)
   - [ ] Si existe : **DÉCISION** - Étendre ou remplacer ? (documenter dans story)

2. **Composants/Services similaires :**
   - [ ] Rechercher composants React similaires (`codebase_search` dans `frontend/src/components/`)
   - [ ] Rechercher stores Zustand similaires (`codebase_search` dans `frontend/src/store/`)
   - [ ] Rechercher services Python similaires (`codebase_search` dans `services/`, `core/`)
   - [ ] Si similaire existe : **DÉCISION** - Réutiliser ou créer nouveau ? (documenter dans story)

3. **Endpoints API :**
   - [ ] Vérifier namespace cohérent (`/api/v1/dialogues/*` vs autres)
   - [ ] Vérifier si endpoint similaire existe (`grep` dans `api/routers/`)
   - [ ] Si endpoint similaire : **DÉCISION** - Étendre ou créer nouveau ? (documenter dans story)

4. **Patterns existants :**
   - [ ] Vérifier patterns Zustand (immutable updates, structure stores)
   - [ ] Vérifier patterns FastAPI (routers, dependencies, schemas)
   - [ ] Vérifier patterns React (composants, hooks, modals)
   - [ ] Respecter conventions de nommage et structure dossiers

5. **Documentation des décisions :**
   - Si remplacement : Documenter **POURQUOI** dans story "Dev Notes"
   - Si extension : Documenter **COMMENT** (quels champs/méthodes ajouter)
   - Si nouveau : Documenter **POURQUOI** pas de réutilisation

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
- Frontend : Composant `GraphCanvas.tsx` avec React Flow 12 (existant, à optimiser)
- Store : `useGraphStore` avec conversion Unity JSON → React Flow nodes/edges
- Performance : Virtualisation React Flow pour graphes larges (500+ nodes)
- Minimap : Composant `MiniMap` React Flow avec couleurs par type nœud
- Background : Composant `Background` React Flow avec grille
- Tests : Unit (conversion JSON → graph), Integration (rendu graphe), E2E (affichage graphe)

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
**When** j'utilise la recherche (voir Story 2.8)
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
- Frontend : Virtualisation React Flow (nodesOnlyVisibleInViewport)
- Performance : Memoization composants nœuds (`memo()`) pour éviter re-renders inutiles
- Store : `useGraphStore` avec lazy loading (charger nœuds à la demande si nécessaire)
- Navigation : `fitView()` React Flow pour centrer sur nœud spécifique
- Tests : Performance (mesurer rendu 500+ nodes), Integration (navigation fluide), E2E (workflow grand graphe)

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
- Frontend : Contrôles React Flow (`Controls`) avec zoom in/out, fit view
- Zoom : `useReactFlow().zoomIn()`, `zoomOut()`, `setZoom(level)` avec limites min/max (0.1x - 2x)
- Pan : Drag & drop sur pane (fond graphe) avec `onPaneMouseMove`
- Focus : `fitView({ nodes: [node], duration: 300 })` pour centrer sur nœud
- Keyboard : Navigation clavier (flèches, WASD) avec `useKeyboardShortcuts` hook
- Tests : Unit (zoom/pan logic), Integration (contrôles React Flow), E2E (navigation complète)

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
- Frontend : React Flow `onNodeDrag` et `onNodeDragStop` handlers dans `GraphCanvas.tsx`
- Store : `useGraphStore.updateNodePosition(nodeId, position)` pour sauvegarder position
- Backend : Endpoint `/api/v1/dialogues/{id}/nodes/{nodeId}/position` (PUT) pour persister position
- Snap to grid : React Flow `snapToGrid={true}`, `snapGrid={[15, 15]}` (existant)
- Auto-pan : Détection nœud hors viewport + `panBy()` React Flow pendant drag
- Tests : Unit (drag logic), Integration (API position), E2E (workflow drag-and-drop)

**References:** FR25 (drag-and-drop), Epic 0 Story 0.5 (auto-save), Story 2.11 (sélection multiple)

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
- Frontend : React Flow `onConnect` handler dans `GraphCanvas.tsx` (existant)
- Handles : React Flow `Handle` components sur nœuds (source/target handles)
- Store : `useGraphStore.connectNodes(fromNodeId, toNodeId, label?)` pour créer connexion
- Backend : Endpoint `/api/v1/dialogues/{id}/connections` (POST) pour persister connexion
- Labels : Edge avec `label` property dans React Flow (éditable via double-clic)
- Validation : Integration avec Epic 0 Story 0.6 (détection cycles)
- Tests : Unit (création connexion), Integration (API connection), E2E (workflow connexion)

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
**Then** je peux annuler avec Ctrl+Z (undo, voir Story 2.15)
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
- Frontend : Sélection edge React Flow (`onEdgeClick`) + touche Delete keyboard
- Store : `useGraphStore.deleteConnection(edgeId)` pour supprimer connexion
- Backend : Endpoint `/api/v1/dialogues/{id}/connections/{edgeId}` (DELETE) pour suppression
- Confirmation : Modal confirmation avant suppression (composant `ConfirmDialog.tsx`)
- Undo/Redo : Integration avec Story 2.15 (undo/redo) pour restaurer connexions
- Validation : Integration avec Epic 4 (détection orphans)
- Tests : Unit (suppression connexion), Integration (API delete), E2E (workflow suppression + undo)

**References:** FR27 (supprimer connexions), Epic 0 Story 0.5 (auto-save), Story 2.15 (undo/redo), Epic 4 (validation)

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
- Frontend : Composant `GraphSearchBar.tsx` avec champ recherche + filtres (texte, speaker)
- Store : `useGraphStore.searchNodes(query, filters)` pour recherche dans nœuds
- Highlight : Mise à jour `highlightedNodeIds` dans store pour surligner résultats
- Navigation : Boutons Précédent/Suivant pour naviguer entre résultats + `fitView()` sur résultat
- Keyboard : Raccourci Ctrl+F pour ouvrir recherche, Escape pour fermer
- Tests : Unit (recherche logique), Integration (recherche store), E2E (workflow recherche)

**References:** FR28 (recherche nœuds), NFR-A1 (Keyboard Navigation 100%), Story 2.9 (jump to node)

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
**And** le nœud est zoomé à un niveau confortable (200% zoom)
**And** le nœud est surligné (highlight) pour identification

**Given** je saisis un nom de nœud (ex: "Opening Scene")
**When** je valide
**Then** le nœud correspondant est trouvé (recherche par displayName)
**And** le graphe se centre sur ce nœud avec zoom + highlight

**Given** plusieurs nœuds correspondent au nom saisi
**When** je saisis un nom ambigu (ex: "Scene 1")
**Then** une liste de nœuds correspondants s'affiche
**And** je peux sélectionner le nœud désiré dans la liste

**Given** le nœud recherché n'existe pas
**When** je saisis un ID/nom invalide
**Then** un message d'erreur s'affiche "Nœud non trouvé"
**And** le graphe reste inchangé

**Technical Requirements:**
- Frontend : Composant `JumpToNodeModal.tsx` avec champ recherche + autocomplete
- Store : `useGraphStore.jumpToNode(nodeId)` pour centrer + zoomer sur nœud
- Recherche : Recherche par stableID (exact) ou displayName (fuzzy) dans nœuds
- Navigation : `fitView({ nodes: [node], duration: 300 })` React Flow pour centrer
- Highlight : Mise à jour `selectedNodeId` dans store pour surligner nœud
- Keyboard : Raccourci Ctrl+G pour ouvrir modal, Enter pour valider
- Tests : Unit (jump logic), Integration (navigation nœud), E2E (workflow jump)

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
- Frontend : Composant `GraphFiltersPanel.tsx` avec checkboxes types nœuds + dropdown speakers
- Store : `useGraphStore.setFilters(filters)` pour appliquer filtres
- Filtrage : Filtrage nœuds dans `GraphCanvas.tsx` avant rendu React Flow (`nodes.filter()`)
- Connexions : Masquer connexions si nœud source ou target est masqué
- Indicateur : Badge "X nœuds masqués" dans panneau filtres
- Tests : Unit (filtrage logique), Integration (filtres store), E2E (workflow filtres)

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
**When** je maintiens Alt+drag pour dessiner un rectangle de sélection
**Then** tous les nœuds dans le rectangle sont sélectionnés
**And** le rectangle de sélection est visible pendant le drag

**Given** j'ai plusieurs nœuds sélectionnés
**When** je déplace un nœud sélectionné (drag)
**Then** tous les nœuds sélectionnés se déplacent ensemble (groupe)
**And** les positions relatives entre nœuds sont préservées

**Given** j'ai plusieurs nœuds sélectionnés
**When** j'applique une opération (supprimer, taguer, valider - voir Story 2.12)
**Then** l'opération s'applique à tous les nœuds sélectionnés
**And** un message de confirmation s'affiche "Opération appliquée à X nœuds"

**Given** je clique sur un espace vide du graphe
**When** je clique sur le pane (fond)
**Then** la sélection multiple est désélectionnée
**And** tous les nœuds reviennent à l'état normal

**Technical Requirements:**
- Frontend : React Flow `multiSelectionKeyCode` (Shift) + `selectionOnDrag` pour lasso selection
- Store : `useGraphStore.setSelectedNodes(nodeIds[])` pour gérer sélection multiple
- Highlight : Mise à jour `selectedNodeIds` dans store pour surligner nœuds sélectionnés
- Lasso : React Flow `selectionOnDrag={true}` avec rectangle de sélection visuel
- Operations : Integration avec Story 2.12 (opérations batch) pour appliquer actions
- Tests : Unit (sélection logique), Integration (sélection store), E2E (workflow sélection multiple)

**References:** FR31 (sélection multiple), Story 2.12 (opérations batch), Story 2.4 (drag-and-drop)

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
- Frontend : Menu contextuel `BatchOperationsMenu.tsx` avec options delete/tag/validate
- Store : `useGraphStore.batchDeleteNodes(nodeIds)`, `batchTagNodes(nodeIds, tag)`, `batchValidateNodes(nodeIds)`
- Backend : Endpoints batch `/api/v1/dialogues/{id}/nodes/batch-delete` (POST), `/batch-tag` (POST), `/batch-validate` (POST)
- Validation : Integration avec Epic 4 (validation structurelle, lore, qualité)
- Feedback : Toast notifications pour résultats batch (succès/échecs)
- Tests : Unit (opérations batch), Integration (API batch), E2E (workflow batch)

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
**Then** des options globales s'affichent : "Nouveau nœud", "Coller", "Filtres", etc.
**And** les options sont adaptées au contexte (pane vs nœud)

**Technical Requirements:**
- Frontend : Composant `ContextMenu.tsx` avec menu contextuel React (react-contextmenu ou custom)
- Handlers : `onNodeContextMenu` React Flow pour détecter clic droit sur nœud
- Actions : Intégration avec Stories 1.5 (éditer), 1.7 (dupliquer), 1.14 (prompt), etc.
- Pane menu : Menu contextuel différent pour clic droit sur pane (fond graphe)
- Keyboard : Raccourci clavier (ex: Menu key) pour ouvrir menu contextuel
- Tests : Unit (menu contextuel), Integration (actions menu), E2E (workflow menu contextuel)

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
**And** l'auto-layout partiel est appliqué automatiquement

**Given** je veux préserver certaines positions manuelles
**When** j'applique l'auto-layout avec option "Préserver positions manuelles"
**Then** seuls les nœuds non positionnés manuellement sont réorganisés
**And** les nœuds avec positions fixes restent à leur place

**Technical Requirements:**
- Frontend : Algorithme auto-layout (dagre.js ou elkjs) intégré dans `GraphCanvas.tsx`
- Layout : Options layout (hierarchical, force-directed, dagre) avec sélection utilisateur
- Store : `useGraphStore.applyAutoLayout(layoutType, preserveManualPositions?)` pour appliquer layout
- Performance : Layout calculé en arrière-plan (Web Worker si nécessaire) pour graphes larges
- Préservation : Flag `manualPosition: true` sur nœuds pour préserver positions manuelles
- Tests : Unit (algorithme layout), Integration (auto-layout store), E2E (workflow auto-layout)

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
- Frontend : Système undo/redo avec Command + Memento patterns dans `useGraphStore`
- Store : `useGraphStore.undo()`, `redo()`, `canUndo()`, `canRedo()` pour gérer historique
- Historique : Stack d'états graphe (snapshots) avec limite 50 opérations (mémoire optimisée)
- Keyboard : Raccourcis Ctrl+Z (undo), Ctrl+Y (redo), Ctrl+Shift+Z (historique)
- Snapshot : Sauvegarde état graphe (nodes + edges) avant chaque modification
- Tests : Unit (undo/redo logic), Integration (historique store), E2E (workflow undo/redo)

**References:** FR35 (undo/redo), Story 2.4 (drag-and-drop), Story 2.5 (créer connexions), Story 2.6 (supprimer connexions)

---

