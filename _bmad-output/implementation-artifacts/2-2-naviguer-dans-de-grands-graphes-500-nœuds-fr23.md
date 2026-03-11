# Story 2.2: Naviguer dans de grands graphes (500+ nœuds) (FR23)

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **utilisateur créant des dialogues**,
I want **naviguer efficacement dans de grands graphes (500+ nœuds)**,
so that **je peux travailler sur des dialogues complexes sans perte de performance**.

## Acceptance Criteria

1. **Given** j'ai un graphe avec 500+ nœuds  
   **When** je charge le graphe  
   **Then** le graphe se charge en <1 seconde (NFR-P1)  
   **And** la navigation (zoom, pan) reste fluide (<100ms latence, NFR-P4)

2. **Given** je navigue dans un grand graphe  
   **When** je zoome et pan  
   **Then** seuls les nœuds visibles dans le viewport sont rendus (virtualisation)  
   **And** les nœuds hors viewport sont déchargés (mémoire optimisée)

3. **Given** je cherche un nœud spécifique dans un grand graphe  
   **When** j'utilise la recherche (voir Story 2.7)  
   **Then** le graphe se centre automatiquement sur le nœud trouvé  
   **And** le nœud est surligné (highlight) pour identification rapide

4. **Given** je navigue dans un grand graphe  
   **When** je change de dialogue  
   **Then** le graphe précédent est déchargé de la mémoire  
   **And** le nouveau graphe se charge rapidement (<1s)

5. **Given** je travaille sur un grand graphe  
   **When** je modifie un nœud (édition, déplacement)  
   **Then** seule la partie modifiée est re-rendue (optimisation React)  
   **And** le reste du graphe reste stable (pas de re-render complet)

## Tasks / Subtasks

- [ ] Task 1: Garantir virtualisation et perf chargement (AC: #1, #2)
  - [ ] 1.1 (TDD) Écrire ou étendre test : graphe 500+ nœuds, rendu initial <1s, zoom/pan <100ms ; virtualisation active (onlyRenderVisibleElements)
  - [ ] 1.2 Vérifier que `onlyRenderVisibleElements={true}` est bien activé dans `GraphCanvas.tsx` (livré par Story 2.1) ; si non, l’activer
  - [ ] 1.3 Confirmer que les nœuds hors viewport ne sont pas rendus (mémoire) — pas de lazy loading backend requis pour 500 nœuds
  - [ ] 1.4 (TDD) Exécuter tests existants `graphStore.controlledMode.test.ts` et `GraphCanvas.virtualization.test.tsx` pour régression
- [ ] Task 2: Brancher highlight et centrage sur recherche (AC: #3)
  - [ ] 2.1 (TDD) Test : lorsqu’un résultat de recherche est sélectionné, `setHighlightedNodes(nodeIds)` est appelé et `fitView` centre sur le nœud
  - [ ] 2.2 S’assurer que le mécanisme `setHighlightedNodes` + `highlightedNodeIds` (graphStore) est prêt pour Story 2.7 — pas de nouveau composant dans cette story, uniquement vérification/connexion si déjà partiellement en place
  - [ ] 2.3 Documenter dans Dev Notes le contrat attendu entre recherche (2.7) et highlight/fitView pour le dev de 2.7
- [ ] Task 3: Déchargement graphe au changement de dialogue (AC: #4)
  - [ ] 3.1 (TDD) Test : après `loadDialogue(otherId)` (ou équivalent), l’état nodes/edges correspond au nouveau dialogue ; pas de fuite de références ancien graphe
  - [ ] 3.2 Vérifier que `loadDialogue()` / reset du store décharge correctement l’ancien graphe (déjà attendu dans graphStore) ; ajouter cleanup si nécessaire (listeners, refs)
  - [ ] 3.3 Vérifier temps de chargement nouveau graphe <1s après changement
- [ ] Task 4: Re-render localisé à la modification (AC: #5)
  - [ ] 4.1 (TDD) Test : modification d’un nœud (position ou données) ne déclenche pas de re-render complet du graphe ; memo sur nodes/GraphCanvas confirmé
  - [ ] 4.2 Confirmer que `DialogueNode`, `TestNode`, `EndNode`, `GraphCanvas`, `GraphCanvasInner` sont bien mémoïsés (`memo()`)
  - [ ] 4.3 Vérifier que les updates du store (ex. `updateNodePosition`, `updateNode`) ne provoquent pas de recalcul inutile de tous les nœuds (structure immuable / sélecteurs si besoin)

## Dev Notes

- **Objectif US (vérification existant):** Navigation (zoom, pan, fitView), highlight et chargement graphe existent. L’US vise un **enrichissement** : s’assurer que la virtualisation (Story 2.1) est active, garantir perf <1s / <100ms, et préparer le branchement du highlight sur la recherche (Story 2.7).
- **RÉUTILISER** le mécanisme `highlightedNodeIds` + `setHighlightedNodes` existant pour le highlight des résultats de recherche (Story 2.7).
- **Pas d’endpoint lazy loading** à créer : la cible 500 nœuds est atteignable avec virtualisation React Flow.
- **Ne pas réinventer :** `GraphCanvas.tsx`, `graphStore.ts`, `fitView`, `setHighlightedNodes`, `loadDialogue`, memo sur les nœuds — tout est déjà en place ou livré par 2.1.

### Project Structure Notes

- **Fichiers concernés :** `frontend/src/components/graph/GraphCanvas.tsx`, `frontend/src/store/graphStore.ts`, `frontend/src/components/graph/GraphCanvasInner.tsx` (fitView, focus-generated-node).
- **Aucun nouveau composant** requis pour cette story ; vérifications, tests et documentation pour 2.7.
- **Architecture :** ADR-007 (controlled) et ADR-006 (store = document) inchangés ; virtualisation et perf sont des optimisations de rendu et de réactivité.

### Architecture Compliance

- **ADR-007 (React Flow controlled):** Les `nodes` et `edges` restent dérivés du store ; la virtualisation ne change que le rendu viewport, pas la source de vérité.
- **ADR-006 (Autosave):** Inchangé ; chargement/déchargement graphe via `loadDialogue` sans impact sur le journal.
- **NFR-P1 (Graph Rendering <1s):** Cible explicite — chargement initial <1s pour 500+ nœuds.
- **NFR-P4 (UI Responsiveness <100ms):** Zoom/pan et interactions <100ms.
- **NFR-SC3 (Graph Scalability 100+ nodes):** Virtualisation + memo pour 500 nœuds.

### Library / Framework Requirements

- **React Flow (xyflow):** `onlyRenderVisibleElements={true}` (Story 2.1). Pas de version supplémentaire requise.
- **React :** Conserver `memo()` sur les composants nœuds et sur `GraphCanvas` / `GraphCanvasInner` pour limiter les re-renders.

### File Structure Requirements

- Modifications limitées à l’existant : `GraphCanvas.tsx`, `graphStore.ts`, éventuellement `GraphCanvasInner.tsx` pour vérifications.
- Aucun nouveau fichier obligatoire ; tests dans `frontend/src/__tests__/` (unit/intégration/perf si besoin).
- Réutiliser `GraphCanvas.virtualization.test.tsx` et `graphStore.controlledMode.test.ts`.

### Testing Requirements

- **Unit / intégration :** Virtualisation active, perf chargement <1s, zoom/pan <100ms ; déchargement au changement de dialogue ; re-render localisé.
- **Régression :** Tous les tests existants du graphe (controlled, virtualisation) restent verts.
- **E2E (optionnel) :** Workflow « ouvrir dialogue → grand graphe → zoom/pan fluide → changer de dialogue → nouveau graphe chargé ».

### Previous Story Intelligence

- **Story 2.1 (Visualiser graphe FR22):** Virtualisation activée (`onlyRenderVisibleElements={true}`), test `GraphCanvas.virtualization.test.tsx` ajouté. Edge cases : dimensions des nœuds avec virtualisation (handler `dimensions` dans le store), `fitView` + `useNodesInitialized` avec virtualisation (xyflow#3573). **À réutiliser :** même fichier `GraphCanvas.tsx`, pas de réintroduction d’état local nodes/edges.
- **Patterns établis :** Store = seule source ; memo sur nœuds ; RAF throttle pour `updateNodePosition` pendant le drag ; pas de useNodesState/useEdgesState.

### Git Intelligence Summary

- Travail récent sur GraphCanvas, virtualisation, tests E2E graphe. Respecter les patterns 2.1 (virtualisation, controlled) et ne pas casser les tests existants.

### Latest Tech Information

- **React Flow virtualisation :** Réduit le rendu au viewport (AABB). Suffisant pour 500 nœuds sans lazy loading serveur. Pour 10k+ nœuds, une approche canvas ou pagination serait à envisager (hors scope).
- **Perf React :** memo sur les nœuds + virtualisation = re-renders limités aux nœuds visibles et aux nœuds dont les données changent.

### Project Context Reference

- [Source: _bmad-output/project-context.md] — Stack frontend (React 18, TypeScript, Zustand, React Flow 11.11), règles tests (Vitest, RTL, Playwright).
- [Source: _bmad-output/planning-artifacts/epics/epic-02.md#Story-2.2] — Story 2.2 complète, AC, contraintes techniques, dépendance 2.7 (recherche).
- [Source: _bmad-output/planning-artifacts/architecture/v10-architectural-decisions-adrs.md#ADR-007] — React Flow controlled, source unique store.
- [Source: _bmad-output/implementation-artifacts/2-1-visualiser-la-structure-de-dialogue-comme-graphe-fr22.md] — Story 2.1 (virtualisation, tests, Dev Notes).

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### File List
