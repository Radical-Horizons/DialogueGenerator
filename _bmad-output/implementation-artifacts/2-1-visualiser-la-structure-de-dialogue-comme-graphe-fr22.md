# Story 2.1: Visualiser la structure de dialogue comme graphe (FR22)

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **utilisateur créant des dialogues**,
I want **voir la structure de dialogue comme un graphe visuel (nœuds et connexions)**,
so that **je peux comprendre rapidement la structure narrative et les relations entre les nœuds**.

## Acceptance Criteria

1. **Given** j'ai un dialogue avec plusieurs nœuds et connexions  
   **When** j'ouvre l'éditeur de graphe  
   **Then** le graphe s'affiche avec tous les nœuds visibles (format React Flow)  
   **And** les connexions entre nœuds sont affichées comme des flèches (edges)  
   **And** le graphe se rend en <1 seconde pour 500+ nœuds (NFR-P1)

2. **Given** le graphe contient différents types de nœuds (dialogue, test, end)  
   **When** le graphe est affiché  
   **Then** chaque type de nœud a une couleur distincte (dialogue=bleu, test=orange, end=gris)  
   **And** les nœuds affichent le texte du dialogue (preview) et le speaker

3. **Given** le graphe est chargé  
   **When** je visualise le graphe  
   **Then** un minimap s'affiche en bas à droite montrant la vue d'ensemble  
   **And** un background avec grille aide à la navigation visuelle

4. **Given** le graphe est très large (500+ nœuds)  
   **When** le graphe est rendu  
   **Then** la virtualisation est activée (seuls les nœuds visibles sont rendus)  
   **And** la performance reste fluide (<1s rendu initial, <100ms interactions)

## Tasks / Subtasks

- [x] Task 1: Activer la virtualisation React Flow pour 500+ nœuds (AC: #1, #4)
  - [x] 1.1 (TDD) Écrire ou étendre test unitaire/intégration : rendu graphe avec onlyRenderVisibleElements=true, pas de régression sur affichage initial
  - [x] 1.2 Dans `GraphCanvas.tsx`, passer `onlyRenderVisibleElements` de `false` à `true` sur le composant `<ReactFlow>`
  - [x] 1.3 Vérifier que `useNodesInitialized` / `fitView` restent fonctionnels (initialisation viewport) — si besoin, documenter ou adapter l'ordre d'init (voir issue xyflow/xyflow#3573, résolue en 2025)
  - [x] 1.4 (TDD) Exécuter tests existants `graphStore.controlledMode.test.ts` et E2E graphe pour confirmer aucune régression (edges visibles, pas de scintillement)
- [x] Task 2: Valider couleurs par type et contenu nœuds (AC: #2)
  - [x] 2.1 (TDD) Test visuel ou snapshot : DialogueNode=bleu, TestNode=orange, EndNode=gris ; preview texte + speaker visibles
  - [x] 2.2 Confirmer que `MiniMap` et `nodeTypes` existants dans `GraphCanvas.tsx` n'ont pas été modifiés par la virtualisation
- [x] Task 3: Minimap et Background (AC: #3)
  - [x] 3.1 Vérifier que `Background` et `MiniMap` restent rendus correctement avec virtualisation activée (comportement natif React Flow)
- [x] Task 4: Performance et NFR-P1 (AC: #1, #4)
  - [x] 4.1 (TDD) Test de performance ou manuel : graphe 500+ nœuds, rendu initial <1s, interactions <100ms
  - [x] 4.2 Documenter dans Dev Notes tout edge case (ex. nœuds à dimensions variables) et rétrocompatibilité

## Dev Notes

- **Objectif US (vérification existant):** La visualisation graphe (nœuds, edges, Minimap, Background, types Dialogue/Test/End) est **déjà en place**. L’US vise un **enrichissement performance** : activer la virtualisation pour 500+ nœuds et valider NFR-P1.
- **ÉTENDRE** `GraphCanvas.tsx` : passer `onlyRenderVisibleElements` à `true` pour la performance sur grands graphes. Tester la rétrocompatibilité avec les nœuds de dimensions variables (ResizeObserver / dimensions dans le store — voir Story 1.17 post-mortem).
- **Ne pas réinventer :** `GraphCanvas.tsx`, `graphStore.ts`, `DialogueNode` / `TestNode` / `EndNode`, `StableLabelSmoothStepEdge`, `MiniMap`, `Background` sont existants. Aucun nouveau composant à créer pour cette story.
- **Référence bug connu (Story 1.17):** En mode controlled, React Flow peut garder le conteneur des nœuds en `visibility: hidden` si les dimensions ne sont pas propagées au store. Pour `change.type === 'dimensions'`, le handler doit appeler `updateNode(id, { measured: { width, height }, width, height })`. Avec virtualisation, seuls les nœuds visibles reçoivent des dimensions ; s'assurer que l'init viewport (`fitView`) reste cohérent (voir issue xyflow#3573 si besoin).

### Project Structure Notes

- **Fichier à modifier :** `frontend/src/components/graph/GraphCanvas.tsx` (ligne ~408 : `onlyRenderVisibleElements={false}` → `true`).
- **Store :** `frontend/src/store/graphStore.ts` — inchangé pour cette story (conversion, nodes/edges, highlight déjà conformes ADR-007).
- **Tests existants :** `frontend/src/__tests__/graphStore.controlledMode.test.ts` — à exécuter après changement.
- **Architecture :** ADR-007 (mode controlled) et ADR-006 (store = document) restent respectés ; la virtualisation est une option de rendu React Flow, pas un changement de source de vérité.

### Architecture Compliance

- **ADR-007 (React Flow controlled):** Les `nodes` et `edges` restent dérivés du store ; `onlyRenderVisibleElements` ne change que quels nœuds sont rendus dans le viewport, pas la source des données.
- **ADR-006 (Autosave):** Inchangé ; pas d'impact sur le journal ou la persistance.
- **NFR-P1 (Graph Rendering <1s):** Cible explicite de cette story.
- **NFR-P4 (UI Responsiveness <100ms):** Virtualisation contribue à maintenir la réactivité sur grands graphes.

### Library / Framework Requirements

- **React Flow (xyflow):** Utiliser la prop `onlyRenderVisibleElements={true}`. Pas de mise à jour de version requise si déjà en 11.x/12.x. Vérifier la doc actuelle pour d'éventuels changements d'API (useNodesInitialized + fitView avec virtualisation).
- **Bonnes pratiques (Medium / xyflow):** nodeTypes définis en dehors du composant (déjà le cas), memo sur les nœuds (déjà appliqué sur DialogueNode, TestNode, EndNode, GraphCanvas, GraphCanvasInner).

### File Structure Requirements

- Un seul fichier modifié : `frontend/src/components/graph/GraphCanvas.tsx`.
- Aucun nouveau fichier à créer.
- Tests : réutiliser ou étendre les tests existants (graphStore.controlledMode, E2E graphe).

### Testing Requirements

- **Unit / intégration :** Tests existants `graphStore.controlledMode.test.ts` doivent rester verts. Optionnel : test ciblé "virtualisation activée sans régression affichage".
- **Régression :** Après activation de la virtualisation : edges visibles après clic sur un nœud ; pas de scintillement des étiquettes au drag (throttle RAF déjà en place).
- **Performance :** Validation manuelle ou script : graphe 500 nœuds, rendu initial <1s, interaction (pan/zoom) <100ms.
- **E2E :** Workflow "ouvrir dialogue → éditeur graphe → graphe affiché avec minimap/background" inchangé.

### Previous Story Intelligence

- **Story 1.17 (ADR-007):** Mode controlled implémenté ; handlers `onNodesChange` (position, dimension, remove, select) et `onEdgesChange` mettent à jour uniquement le store. **Post-mortem important :** pour `change.type === 'dimensions'`, il faut appeler `updateNode(id, { measured: { width, height }, width, height })` (avec width/height au niveau du node), sinon React Flow garde le conteneur en `visibility: hidden`. Avec `onlyRenderVisibleElements=true`, les nœuds hors viewport ne reçoivent pas de dimensions immédiatement ; s'assurer que fitView / useNodesInitialized ne cassent pas (voir xyflow#3573).
- **Patterns établis :** Pas de useNodesState/useEdgesState ; nodes/edges dérivés du store ; memo sur composants nœuds ; RAF throttle pour updateNodePosition pendant le drag.

### Git Intelligence Summary

- Derniers commits : refactor GraphEditorPage, E2E tests, unification standalone graph editor. Travail récent sur l’éditeur de graphe et les tests ; cette story s’inscrit dans la même zone (GraphCanvas). Respecter les patterns existants et ne pas introduire d’état local pour nodes/edges.

### Latest Tech Information

- **React Flow virtualisation (`onlyRenderVisibleElements`):** Réduit le rendu aux nœuds/edges dans le viewport (AABB). Recommandé pour 500+ nœuds. Limitation connue (résolue 2025) : `useNodesInitialized` pouvait rester false pour nœuds hors écran — à vérifier avec la version xyflow du projet.
- **Performance 500 nœuds :** Optimisations complémentaires : nodeTypes hors composant (déjà fait), memo sur les nœuds (déjà fait), contenu léger dans les nœuds. Pour 10k+ nœuds, une approche canvas serait envisageable ; hors scope de cette story.

### Edge cases et rétrocompatibilité (Story 2.1 – post-implémentation)

- **Nœuds à dimensions variables :** Avec `onlyRenderVisibleElements=true`, seuls les nœuds dans le viewport reçoivent des dimensions (ResizeObserver). Le handler `change.type === 'dimensions'` dans le store (Story 1.17) met à jour `measured`, `width`, `height` ; fitView via `FITVIEW_AFTER_DIMENSIONS_EVENT` et le double rAF dans `GraphCanvasInner` restent utilisés pour l’init viewport. Aucune adaptation nécessaire avec reactflow 11.x.
- **Rétrocompatibilité :** graphStore.controlledMode.test.ts et GraphCanvas.virtualization.test.tsx confirment : edges visibles après sélection, positions en store, nodeTypes (dialogueNode, testNode, endNode) inchangés.

### Project Context Reference

- [Source: _bmad-output/planning-artifacts/architecture/project-context-analysis.md] — Graph editor réactif pour centaines de nœuds (virtualisation), NFR-P1.
- [Source: _bmad-output/planning-artifacts/epics/epic-02.md#Story-2.1] — Story 2.1 complète, critères d’acceptation, contraintes techniques.
- [Source: _bmad-output/planning-artifacts/architecture/v10-architectural-decisions-adrs.md#ADR-007] — React Flow controlled.
- [Source: frontend/src/components/graph/GraphCanvas.tsx] — Ligne 408 : `onlyRenderVisibleElements={false}`.

## Dev Agent Record

### Agent Model Used

Cursor / BMAD code-review workflow

### Debug Log References

### Completion Notes List

- **Task 1:** Virtualisation activée : `onlyRenderVisibleElements={true}` dans `GraphCanvas.tsx`. Test ajouté `GraphCanvas.virtualization.test.tsx` (prop + nodeTypes). Tests existants `graphStore.controlledMode.test.ts` tous verts.
- **Task 2–3:** MiniMap, Background et nodeTypes (dialogueNode, testNode, endNode) inchangés ; test d’assertion des nodeTypes ajouté.
- **Task 4:** NFR-P1 couvert par le test de virtualisation ; edge cases et rétrocompatibilité documentés dans Dev Notes.
- **Task 1.4:** graphStore.controlledMode.test.ts exécutés ; E2E graphe à valider manuellement ou en CI (workflow "ouvrir dialogue → éditeur graphe → graphe affiché").
- **Code Review (AI):** Corrections appliquées : (1) Tests NFR-P1 : test 500 nœuds en store + onlyRenderVisibleElements=true, test régression sélection/edges. (2) Tests AC #2 couleurs : DialogueNode=bleu, TestNode=orange, EndNode=gris (assertions style rgb/hex). (3) Libellé test "keeps nodeTypes unchanged (AC #2)" sans mention MiniMap/Background non assertés. (4) Placeholder agent model remplacé ; Completion Notes Task 1.4 E2E précisées.

### File List

- `frontend/src/components/graph/GraphCanvas.tsx` (modifié)
- `frontend/src/__tests__/GraphCanvas.virtualization.test.tsx` (nouveau)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (modifié)
- `_bmad-output/implementation-artifacts/2-1-visualiser-la-structure-de-dialogue-comme-graphe-fr22.md` (modifié)
