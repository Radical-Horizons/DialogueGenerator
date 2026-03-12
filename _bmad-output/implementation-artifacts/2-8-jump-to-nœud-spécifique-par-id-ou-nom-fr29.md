# Story 2.8: Jump to nœud spécifique par ID ou nom (FR29)

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **utilisateur créant des dialogues**,
I want **sauter directement à un nœud spécifique par ID ou nom**,
so that **je peux naviguer rapidement vers un nœud précis sans chercher manuellement**.

## Acceptance Criteria

1. **Given** je suis dans l'éditeur de graphe  
   **When** j'ouvre le panneau "Jump to Node" (Ctrl+J ou menu)  
   **Then** un champ de saisie s'affiche pour ID ou nom de nœud  
   **And** une liste de suggestions apparaît (autocomplete) avec nœuds correspondants

2. **Given** je saisis un ID de nœud (ex: "node_abc123")  
   **When** je valide (Enter)  
   **Then** le graphe se centre automatiquement sur ce nœud  
   **And** le nœud est sélectionné pour identification

3. **Given** je saisis un nom de nœud (ex: "Opening Scene")  
   **When** je valide  
   **Then** le nœud correspondant est trouvé (recherche par displayName ou extrait de data.line)  
   **And** le graphe se centre sur ce nœud avec animation

4. **Given** plusieurs nœuds correspondent au nom saisi  
   **When** je saisis un nom ambigu (ex: "Scene 1")  
   **Then** une liste de nœuds correspondants s'affiche  
   **And** je peux sélectionner le nœud désiré dans la liste

5. **Given** le nœud recherché n'existe pas  
   **When** je saisis un ID/nom invalide  
   **Then** un message d'erreur s'affiche "Nœud non trouvé"  
   **And** le graphe reste inchangé

## Tasks / Subtasks

- [ ] Task 1: Action jumpToNode dans le store (AC: #2, #3)
  - [ ] 1.1 (TDD) Test : `jumpToNode(nodeId)` appelle `setSelectedNode(nodeId)` puis dispatch `CustomEvent('focus-generated-node', { detail: { nodeId } })` ; si nodeId absent dans nodes, ne pas dispatcher (ou no-op)
  - [ ] 1.2 Dans `graphStore` (uiSlice ou nodeSlice selon où est setSelectedNode), ajouter action `jumpToNode(nodeId: string)`: vérifier que le nœud existe dans `getState().nodes`, appeler `setSelectedNode(nodeId)`, puis `window.dispatchEvent(new CustomEvent('focus-generated-node', { detail: { nodeId } }))`
- [ ] Task 2: Helper recherche nœuds par ID ou nom (AC: #3, #4, #5)
  - [ ] 2.1 (TDD) Test : fonction qui prend une chaîne et retourne des candidats : match exact sur node.id, ou match partiel insensible casse sur "nom" (node.data.displayName ?? première ligne de node.data.line ?? node.id) ; retourner liste ordonnée (exact d'abord, puis partiels)
  - [ ] 2.2 Implémenter helper `findNodesByQuery(query: string)` (dans le store ou utils) : parcourir `getState().nodes`, matcher id exact ou nom dérivé de data ; exposer pour autocomplete et validation "nœud non trouvé"
- [ ] Task 3: Composant JumpToNodeModal (AC: #1, #2, #3, #4, #5)
  - [ ] 3.1 (TDD) Test : rendu champ saisie + liste suggestions ; saisie déclenche recherche et affiche résultats ; Enter sur ID exact appelle jumpToNode ; sélection dans liste appelle jumpToNode puis ferme modal ; "Nœud non trouvé" si aucun résultat et Enter
  - [ ] 3.2 Créer `frontend/src/components/graph/JumpToNodeModal.tsx` : input contrôlé, appel à findNodesByQuery à chaque changement (debounce ~200 ms), affichage liste suggestions (id + nom/label), Enter valide premier résultat ou sélection ; si aucun résultat et Enter → message "Nœud non trouvé" ; onClose ferme et optionnellement clear selected si souhaité
  - [ ] 3.3 Gérer accessibilité : focus trap dans le modal, Escape ferme, aria-label "Jump to node"
- [ ] Task 4: Intégration dans GraphEditor et raccourci Ctrl+J (AC: #1)
  - [ ] 4.1 (TDD) Test : Ctrl+J ouvre le modal Jump to Node (état visible), Escape ferme
  - [ ] 4.2 Dans `GraphEditor.tsx`, ajouter état local `showJumpToNodeModal` et rendre `JumpToNodeModal` (position cohérente avec autres modals) ; passer `onClose` → `setShowJumpToNodeModal(false)`
  - [ ] 4.3 ÉTENDRE `useKeyboardShortcuts` dans `GraphEditor.tsx` : ajouter `ctrl+j` pour ouvrir le modal Jump to Node. **Ne pas utiliser ctrl+g** (déjà réservé à l’ouverture du panneau Génération IA — voir `GraphEditor.tsx` l.525)

## Dev Notes

- **Objectif US (vérification existant):** **Nouvelle fonctionnalité.** Pas de modal « Jump to Node » ni d’action `jumpToNode`. Réutilisation de `setSelectedNode` et de l’event `focus-generated-node` pour le centrage après sélection.
- **CRÉER** `JumpToNodeModal.tsx` dans `frontend/src/components/graph/` (aucun composant similaire existant).
- **CRÉER** `jumpToNode(nodeId)` dans le store — wrapper léger sur `setSelectedNode(nodeId)` + `window.dispatchEvent(new CustomEvent('focus-generated-node', { detail: { nodeId } }))`.
- **RÉUTILISER** l’event `focus-generated-node` **existant** dans `GraphCanvasInner.tsx` (l.56–92) — `fitView({ nodes: [node], duration: 400, padding: 0.3 })` ; pas de nouveau mécanisme de centrage.
- **Raccourci clavier :** Utiliser **Ctrl+J** pour "Jump to Node". **Ctrl+G** est déjà utilisé pour ouvrir le panneau Génération IA (`GraphEditor.tsx` l.525) — ne pas le réutiliser.

### Project Structure Notes

- **Fichiers à créer :** `frontend/src/components/graph/JumpToNodeModal.tsx`.
- **Fichiers à modifier :** `frontend/src/store/` (action `jumpToNode` + helper `findNodesByQuery` ou équivalent), `frontend/src/components/graph/GraphEditor.tsx` (intégration modal + état `showJumpToNodeModal`, raccourci Ctrl+J).
- **Aucun endpoint backend** : recherche et jump 100 % client (nœuds déjà dans le store). Structure des nœuds : `node.id`, `node.data.line`, `node.data.speaker` ; pour "nom" utiliser `node.data.displayName` si présent sinon extrait de `node.data.line` ou `node.id`.

### Architecture Compliance

- **ADR-007 (React Flow controlled):** Le jump ne modifie que la sélection et le viewport. `setSelectedNode(nodeId)` met à jour l’état UI ; le centrage passe par l’event `focus-generated-node` déjà écouté dans `GraphCanvasInner`. Aucune modification des nodes/edges du store.
- **ADR-006 (auto-save):** Aucun impact ; pas de dirty ni save.
- **NFR-A1 (Keyboard Navigation 100%):** Ctrl+J ouvre le modal, Escape ferme. Navigation clavier dans la liste de suggestions (flèches + Enter).

### Library / Framework Requirements

- **React Flow (xyflow):** Aucune API spécifique ; réutilisation de l’event custom `focus-generated-node` et de `fitView` côté `GraphCanvasInner`.
- **Zustand (graphStore):** Nouvelle action `jumpToNode(nodeId)` ; lecture des nodes pour `findNodesByQuery`. `setSelectedNode` déjà présent (uiSlice).
- **React:** Modal contrôlé (état ouvert/fermé dans GraphEditor), input contrôlé, liste de suggestions cliquable et navigable au clavier.

### File Structure Requirements

- Nouveau fichier : `frontend/src/components/graph/JumpToNodeModal.tsx`.
- Modifications : store (action `jumpToNode`, helper recherche par query), `GraphEditor.tsx` (modal + raccourci Ctrl+J).
- Tests : `frontend/src/__tests__/` — unitaires pour `jumpToNode` et `findNodesByQuery`, composant ou intégration pour `JumpToNodeModal` (suggestions, Enter, "Nœud non trouvé", fermeture).

### Testing Requirements

- **Unit :** `jumpToNode(nodeId)` — appelle setSelectedNode + dispatch focus-generated-node ; no-op ou pas de dispatch si nodeId invalide. `findNodesByQuery(query)` — id exact, nom partiel, casse insensible, vide, aucun résultat.
- **Composant / intégration :** JumpToNodeModal — saisie met à jour suggestions, Enter sur résultat unique appelle jumpToNode et ferme, sélection dans liste idem, message "Nœud non trouvé" si aucun résultat + Enter, Escape ferme.
- **Régression :** Ne pas casser `GraphCanvas.virtualization.test.tsx` (focus-generated-node, setSelectedNode) ; ne pas casser le raccourci Ctrl+G (Génération IA) dans GraphEditor.

### Previous Story Intelligence

- **Story 2.7 (Recherche nœuds FR28):** Pattern réutilisable : barre/modal avec input, recherche côté client sur le store, puis `setHighlightedNodes(ids)` et dispatch `focus-generated-node` pour centrer. Pour 2.8 : pas de highlight multiple ; une seule cible → `setSelectedNode` + `focus-generated-node`. Le même event `focus-generated-node` est écouté dans `GraphCanvasInner` (l.85–92) et déclenche `fitView({ nodes: [node], duration: 400, padding: 0.3 })`. Réutiliser tel quel.
- **Stories 2.2–2.3 :** `setSelectedNode` et `focus-generated-node` déjà documentés dans 2.7 ; GraphCanvas.tsx l.36, 71, 85–92, 126, 191–193, 221, 242. Ne pas réimplémenter le centrage ; uniquement fournir l’action `jumpToNode` et le modal pour saisie.

### Git Intelligence Summary

- Travail récent sur GraphCanvas (focus-generated-node, onNodeDoubleClick), GraphEditor (useKeyboardShortcuts, ctrl+g). Convention : pas d’endpoint dédié pour la navigation ; tout côté client. Même pattern que 2.7 (recherche 100 % client).

### Latest Tech Information

- **React Flow 11.x :** Pas d’API "jump to node" intégrée ; utiliser `fitView({ nodes: [node], ... })` via l’event custom existant. Types `Node.data` : `Record<string, unknown>` ; pour "nom" utiliser `data.displayName` ou extrait de `data.line` selon schéma Unity.
- **Zustand :** Ajouter une action dans le store existant ; garder `jumpToNode` et `findNodesByQuery` pures / testables (pas d’effet de bord sauf dispatch d’event pour jumpToNode).

### Project Context Reference

- [Source: _bmad-output/project-context.md] — Stack frontend (React 18, TypeScript, Zustand, React Flow 11.11), tests Vitest/RTL/Playwright.
- [Source: _bmad-output/planning-artifacts/epics/epic-02.md#Story-2.8] — Story 2.8 complète, AC, contraintes techniques, FR29, Story 2.7, NFR-A1.
- [Source: frontend/src/components/graph/GraphCanvas.tsx] — focus-generated-node listener (l.85–92), setSelectedNode (l.36, 71), onNodeDoubleClick dispatch focus-generated-node (l.192–194).
- [Source: frontend/src/components/graph/GraphCanvasInner.tsx] — handleFocusNode (fitView sur nodeId), lignes 56–92.
- [Source: frontend/src/components/graph/GraphEditor.tsx] — useKeyboardShortcuts, ctrl+g (l.525) pour Génération IA ; ajouter ctrl+j pour Jump to Node.
- [Source: frontend/src/store/slices/uiSlice.ts] — setSelectedNode.

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### File List
