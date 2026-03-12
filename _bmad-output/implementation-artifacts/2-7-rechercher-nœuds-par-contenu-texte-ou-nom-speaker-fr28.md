# Story 2.7: Rechercher nœuds par contenu texte ou nom speaker (FR28)

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **utilisateur créant des dialogues**,
I want **rechercher des nœuds par contenu texte ou nom du speaker**,
so that **je peux trouver rapidement des nœuds spécifiques dans de grands graphes**.

## Acceptance Criteria

1. **Given** je suis dans l'éditeur de graphe  
   **When** j'ouvre la barre de recherche (Ctrl+F ou bouton "Rechercher")  
   **Then** un champ de recherche s'affiche en haut du graphe  
   **And** je peux saisir du texte pour rechercher

2. **Given** je recherche un texte (ex: "bonjour")  
   **When** je saisis "bonjour" dans la recherche  
   **Then** tous les nœuds contenant "bonjour" dans leur texte sont surlignés (highlight)  
   **And** un compteur s'affiche "3 résultats trouvés"  
   **And** je peux naviguer entre les résultats (boutons Précédent/Suivant)

3. **Given** je recherche par nom de speaker (ex: "Akthar")  
   **When** je saisis "Akthar" dans la recherche  
   **Then** tous les nœuds avec speaker "Akthar" sont surlignés  
   **And** le graphe se centre automatiquement sur le premier résultat

4. **Given** je recherche avec plusieurs critères  
   **When** je recherche "bonjour" ET speaker "Akthar"  
   **Then** seuls les nœuds correspondant aux deux critères sont surlignés  
   **And** les résultats sont filtrés en temps réel (pas besoin de valider)

5. **Given** je ferme la recherche (Escape ou bouton Fermer)  
   **When** la recherche est fermée  
   **Then** tous les highlights sont supprimés  
   **And** le graphe revient à l'état normal

## Tasks / Subtasks

- [ ] Task 1: Créer action searchNodes dans le store (AC: #2, #3, #4)
  - [ ] 1.1 (TDD) Test : `searchNodes(query, { text?, speaker? })` filtre `state.nodes` sur `data.line` (texte) et/ou `data.speaker` (speaker), retourne `string[]` (IDs), recherche insensible à la casse, trim du query
  - [ ] 1.2 Dans `graphStore` (ou slice dédié), ajouter action `searchNodes(query: string, filters?: { speaker?: string })` : parcourir `getState().nodes`, matcher `node.data.line` et `node.data.speaker`, retourner les `node.id`
  - [ ] 1.3 Exposer la liste des speakers uniques dérivée des nœuds (pour filtre speaker dans l’UI) : helper `getUniqueSpeakers(): string[]` ou dérivé dans le store
- [ ] Task 2: Créer composant GraphSearchBar (AC: #1, #2, #4, #5)
  - [ ] 2.1 (TDD) Test : rendu champ recherche + compteur "N résultats", boutons Précédent/Suivant, appel à `setHighlightedNodes(matchingIds)` et optionnellement dispatch `focus-generated-node` pour le premier résultat
  - [ ] 2.2 Créer `frontend/src/components/graph/GraphSearchBar.tsx` : input contrôlé, filtre optionnel speaker (dropdown ou combobox), appel `searchNodes(query, { speaker })` puis `setHighlightedNodes(ids)`, affichage "X résultats trouvés", Précédent/Suivant pour parcourir et centrer (dispatch `focus-generated-node` avec l’id courant)
  - [ ] 2.3 Gérer fermeture : Escape ou bouton Fermer appelle `setHighlightedNodes([])` et masque la barre ; pas de persistance côté backend
- [ ] Task 3: Intégrer GraphSearchBar dans l’éditeur et raccourci Ctrl+F (AC: #1, #5)
  - [ ] 3.1 (TDD) Test : Ctrl+F ouvre la barre de recherche (état visible), Escape la ferme et vide les highlights
  - [ ] 3.2 Dans `GraphEditor.tsx`, ajouter état local `showSearchBar` et rendre `GraphSearchBar` en haut du canvas (ou au-dessus du graphe) ; passer `onClose` → `setHighlightedNodes([])` + `setShowSearchBar(false)`
  - [ ] 3.3 ÉTENDRE `useKeyboardShortcuts` dans `GraphEditor.tsx` : ajouter `ctrl+f` pour toggle `showSearchBar` (ouvrir si fermée, fermer si ouverte) ; Escape déjà géré dans GraphSearchBar ou au niveau éditeur pour fermer la barre
- [ ] Task 4: Critères combinés et temps réel (AC: #4)
  - [ ] 4.1 Lorsque l’utilisateur saisit du texte et/ou sélectionne un speaker, appeler `searchNodes(query, { speaker })` à chaque changement (debounce optionnel ~150–300 ms pour éviter surcharge) et mettre à jour `setHighlightedNodes(resultIds)`
  - [ ] 4.2 (TDD) Test : combinaison texte + speaker filtre correctement ; aucun appel API (recherche 100 % client)

## Dev Notes

- **Objectif US (vérification existant):** **Nouvelle fonctionnalité.** Aucune barre de recherche nœuds ni action `searchNodes` aujourd’hui. Réutilisation de l’existant uniquement pour highlight et focus (`setHighlightedNodes`, `focus-generated-node`).
- **CRÉER** `GraphSearchBar.tsx` dans `frontend/src/components/graph/` (nouveau composant).
- **CRÉER** `searchNodes(query, filters?)` dans le store — logique purement côté client (filtrer `state.nodes` sur `data.line` et `data.speaker`), pas d'appel backend.
- **RÉUTILISER** `setHighlightedNodes` + `highlightedNodeIds` (uiSlice / graphState) pour le rendu highlight dans `GraphCanvas.tsx` (l.126, 221, 242).
- **RÉUTILISER** le mécanisme `focus-generated-node` (CustomEvent) : `GraphCanvas.tsx` l’écoute (l.85) et appelle `fitView({ nodes: [node], duration: 400, padding: 0.3 })` ; dispatch depuis GraphSearchBar avec `detail: { nodeId }` pour centrer sur le résultat courant.

### Project Structure Notes

- **Fichiers à créer :** `frontend/src/components/graph/GraphSearchBar.tsx`.
- **Fichiers à modifier :** `frontend/src/store/` (nouvelle action `searchNodes` + éventuel helper speakers), `frontend/src/components/graph/GraphEditor.tsx` (intégration barre + état `showSearchBar`, raccourci Ctrl+F).
- **Aucun endpoint backend** : recherche 100 % client sur les nœuds déjà chargés dans le store.
- Structure des nœuds : `node.data.line` (texte dialogue), `node.data.speaker` (nom speaker) — types dans `frontend/src/types/graph.ts` ou équivalent.

### Architecture Compliance

- **ADR-007 (React Flow controlled):** Les nœuds affichés et le highlight proviennent du store. `setHighlightedNodes(nodeIds)` met à jour l’état ; `GraphCanvas` dérive les nœuds enrichis avec `isHighlighted` depuis `highlightedNodeIds`. Pas d’état local pour les résultats de recherche en dehors du store (highlight = store).
- **ADR-006 (auto-save):** La recherche ne modifie pas le document ; pas d’impact sur dirty ni save.
- **NFR-P4 (UI Responsiveness <100ms):** Recherche synchrone sur le store en mémoire ; debounce léger sur l’input pour éviter re-renders excessifs.
- **NFR-A1 (Keyboard Navigation 100%):** Ctrl+F ouvre/ferme la recherche, Escape ferme et vide les highlights.

### Library / Framework Requirements

- **React Flow (xyflow):** Aucune API spécifique pour la recherche ; utilisation des nodes/edges du store uniquement.
- **Zustand (graphStore):** Nouvelle action `searchNodes` dans le store ; lecture seule sur `state.nodes`, pas de mutation du graphe. `setHighlightedNodes` déjà présent (uiSlice).
- **React:** Composant contrôlé pour l’input ; pas de dépendance supplémentaire pour la recherche (filtrer un tableau).

### File Structure Requirements

- Nouveau fichier : `frontend/src/components/graph/GraphSearchBar.tsx`.
- Modifications : store (slice ou graphStore) pour `searchNodes`, `GraphEditor.tsx` pour intégration et raccourci.
- Tests : `frontend/src/__tests__/` — unitaires pour `searchNodes`, intégration ou unitaire pour `GraphSearchBar` (highlight, compteur, Précédent/Suivant, fermeture).

### Testing Requirements

- **Unit :** `searchNodes(query, { speaker })` — cas vide, texte seul, speaker seul, combinaison, casse insensible, trim.
- **Intégration / composant :** GraphSearchBar — saisie déclenche `setHighlightedNodes` avec les bons IDs, compteur affiché, Précédent/Suivant dispatch `focus-generated-node`, Escape ferme et appelle `setHighlightedNodes([])`.
- **Régression :** Ne pas casser `GraphCanvas.virtualization.test.tsx` (focus-generated-node, setHighlightedNodes) ; pas de régression sur les autres raccourcis dans `GraphEditor`.

### Previous Story Intelligence

- **Story 2.6 (Supprimer connexions FR27):** Pattern confirmation + store : état local pour "pending" puis appel store sur confirm. Pour 2.7, pas de confirmation ; état local limité à `showSearchBar` et éventuellement index courant Précédent/Suivant. Réutilisation de `ConfirmDialog` non nécessaire ici.
- **Stories 2.1–2.5 :** Highlight et focus déjà en place : `highlightedNodeIds`, `setHighlightedNodes`, `focus-generated-node` dans `GraphCanvas.tsx` (l.36, 71, 85–92, 126, 191–193, 221, 242). Ne pas réimplémenter le highlight ; uniquement alimenter `setHighlightedNodes` avec les IDs trouvés par `searchNodes`.

### Git Intelligence Summary

- Travail récent sur `GraphCanvas.tsx` (onEdgesChange, confirmation suppression edges), `edgeSlice` (disconnectNodes). Aucun conflit avec la recherche : la recherche est lecture seule sur les nœuds et met à jour uniquement l’état UI (highlight). Même convention : pas d’endpoint dédié ; tout côté client.

### Latest Tech Information

- **React Flow 11.x / 12:** Pas d’API de recherche intégrée ; la recherche se fait sur les données du store (nodes). Vérifier les types `Node.data` pour `line` et `speaker` dans le projet (DialogueNode, etc.).
- **Zustand:** Ajouter une action dans le store existant (slice ou root) ; pas de nouveau store nécessaire. Garder `searchNodes` pure (pas d’effet de bord) pour faciliter les tests.

### Project Context Reference

- [Source: _bmad-output/project-context.md] — Stack frontend (React 18, TypeScript, Zustand, React Flow 11.11), tests Vitest/RTL/Playwright, pas de logique métier hors store/API.
- [Source: _bmad-output/planning-artifacts/epics/epic-02.md#Story-2.7] — Story 2.7 complète, AC, contraintes techniques, FR28, NFR-A1, Story 2.8 (jump to node).
- [Source: frontend/src/components/graph/GraphCanvas.tsx] — highlightedNodeIds (l.126), setHighlightedNodes (l.36, 71), focus-generated-node (l.85–92, 191–193), isHighlighted (l.221).
- [Source: frontend/src/store/slices/uiSlice.ts] — setHighlightedNodes, highlightedNodeIds.
- [Source: frontend/src/store/types/graphState.ts] — highlightedNodeIds, setHighlightedNodes dans GraphState.
- [Source: frontend/src/components/graph/GraphEditor.tsx] — useKeyboardShortcuts (ctrl+g, ctrl+0, delete, arrows) ; ajouter ctrl+f ici.

## Change Log

| Date       | Author | Change |
|------------|--------|--------|
| 2026-03-12 | AI (Code Review) | Review complète. Corrections : AC#3 centrage auto premier résultat (GraphSearchBar), AC#1 bouton « Rechercher » (GraphEditor), renommage speakerSet (uiSlice). Statut → done. |

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

- Implémentation Story 2.7 (FR28) : recherche nœuds par texte et/ou speaker. Store : `searchNodes(query, filters?)` et `getUniqueSpeakers()` dans uiSlice. Composant `GraphSearchBar.tsx` avec input, filtre speaker (dropdown), compteur "X résultats trouvés", Précédent/Suivant (dispatch `focus-generated-node`), debounce 200 ms. Intégration dans `GraphEditor` avec état `showSearchBar` et raccourci Ctrl+F (toggle). Escape et bouton Fermer vident les highlights et ferment la barre. Tests : graphStore.search, GraphSearchBar, GraphEditor.keyboard (Ctrl+F / Escape).

### Senior Developer Review (AI)

- **Date:** 2026-03-12
- **Findings:** AC#3 (centrage auto sur premier résultat) — corrigé : dispatch `focus-generated-node` pour le premier résultat dans `GraphSearchBar.runSearch`. AC#1 (bouton « Rechercher ») — corrigé : bouton « 🔍 Rechercher » ajouté dans l’en-tête de `GraphEditor`. Qualité : variable `set` renommée en `speakerSet` dans `getUniqueSpeakers` (uiSlice).
- **Issues fixed:** 3 (2 HIGH/MEDIUM, 1 LOW). Statut passé à **done**.

### File List

- frontend/src/store/types/graphState.ts (searchNodes, getUniqueSpeakers types)
- frontend/src/store/slices/uiSlice.ts (searchNodes, getUniqueSpeakers impl, speakerSet)
- frontend/src/components/graph/GraphSearchBar.tsx (nouveau, auto-focus premier résultat)
- frontend/src/components/graph/GraphEditor.tsx (showSearchBar, Ctrl+F, bouton Rechercher, GraphSearchBar, tooltip)
- frontend/src/hooks/useKeyboardShortcuts.ts (ctrl+f autorisé dans inputs)
- frontend/src/__tests__/graphStore.search.test.ts (nouveau)
- frontend/src/__tests__/GraphSearchBar.test.tsx (nouveau)
- frontend/src/__tests__/GraphEditor.keyboard.test.tsx (Story 2.7 test Ctrl+F/Escape)
