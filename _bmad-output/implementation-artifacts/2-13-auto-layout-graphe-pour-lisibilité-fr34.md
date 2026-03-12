# Story 2.13: Auto-layout graphe pour lisibilité (FR34)

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **utilisateur créant des dialogues**,
I want **que le système organise automatiquement le layout du graphe pour la lisibilité**,
so that **je peux voir clairement la structure narrative sans organiser manuellement chaque nœud**.

## Acceptance Criteria

1. **Given** j'ai un graphe avec des nœuds désorganisés (positions aléatoires)  
   **When** je clique sur "Auto-layout" (bouton dans la toolbar ou menu contextuel pane)  
   **Then** le graphe est réorganisé automatiquement avec un algorithme de layout (Dagre)  
   **And** les nœuds sont positionnés de manière lisible (pas de chevauchements, espacement cohérent)

2. **Given** le graphe a une structure hiérarchique (START → nœuds → END)  
   **When** l'auto-layout est appliqué  
   **Then** le layout hiérarchique est respecté (nœuds parents en haut, enfants en bas pour TB)  
   **And** les niveaux sont clairement visibles (alignement horizontal par niveau)

3. **Given** le graphe a des cycles (boucles)  
   **When** l'auto-layout est appliqué  
   **Then** les cycles sont gérés par l'algorithme (Dagre gère les DAG ; comportement défini pour cycles)  
   **And** le graphe reste lisible

4. **Given** je modifie le graphe après auto-layout  
   **When** j'ajoute un nouveau nœud  
   **Then** le nouveau nœud est positionné par l'utilisateur ou par un nouvel auto-layout ; le comportement "positionner intelligemment près du parent" relève du flux de création (Story 2.12 pane "Nouveau nœud")  
   **And** un nouvel auto-layout peut être relancé pour réorganiser l'ensemble

5. **Given** j'ai accès à l'éditeur de graphe  
   **When** je veux changer la direction du layout  
   **Then** je peux choisir TB / LR / BT / RL via le bouton "Auto-layout" (menu direction dans GraphEditorHeader)  
   **And** l'application du layout utilise la direction sélectionnée

## Tasks / Subtasks

<!-- Chaque task = un comportement testable (TDD). Dev Notes = WHERE/HOW. -->

- [ ] Task 1 : Vérifier que l’auto-layout (Dagre) réorganise les nœuds et persiste (AC: #1, #2)
  - [ ] 🔴 Test échoue : appel `applyAutoLayout('dagre', 'TB')` avec nœuds/edges de test → les positions des nœuds changent et sont cohérentes (hiérarchie TB) ; après `applyAutoLayout`, le store contient des positions mises à jour
  - [ ] 🟢 Confirmer/étendre `layoutSlice.applyAutoLayout` et `dagreLayout.calculateDagreLayout` (voir Dev Notes) ; s’assurer que `markDirty()` ou la persistance est déclenchée après mise à jour des positions
  - [ ] 🔵 Si la logique de "layout puis persistance" est dupliquée entre toolbar et PaneContextMenu, centraliser dans le store ; sinon no-op

- [ ] Task 2 : Vérifier l’UI (bouton toolbar + menu pane) et direction TB/LR/BT/RL (AC: #1, #5)
  - [ ] 🔴 Test échoue : clic sur le bouton "Auto-layout" dans GraphEditorHeader ou choix d’une direction (TB/LR/BT/RL) appelle `applyAutoLayout` avec la bonne direction ; clic "Auto-layout" dans PaneContextMenu appelle `applyAutoLayout('dagre', 'TB')` (ou direction par défaut)
  - [ ] 🟢 Vérifier `useGraphToolbar.handleAutoLayout` et `GraphEditorHeader` (bouton + dropdown direction) ; vérifier `GraphCanvas` + `PaneContextMenu` → `applyAutoLayout('dagre', 'TB')` ; pas de régression sur les points d’entrée existants
  - [ ] 🔵 Si le libellé ou l’accessibilité du bouton Auto-layout peut être amélioré (aria-label, title), l’ajouter ; sinon no-op

- [ ] Task 3 : Tests d’intégration et E2E (AC: #1–#3)
  - [ ] 🔴 Test échoue : test d’intégration (store ou composant) : graphe avec 3+ nœuds et edges → applyAutoLayout → positions différentes et pas de chevauchement évident ; test API (si fallback backend utilisé) : POST `/calculate-layout` retourne des positions valides
  - [ ] 🟢 Ajouter ou compléter tests dans `layoutSlice` / `dagreLayout` et, si pertinent, `tests/api/test_graph_crud.py` pour `calculate-layout` ; documenter le comportement avec cycles (Dagre) dans Dev Notes
  - [ ] 🔵 Pas de refactor majeur ; no-op ou petit nettoyage de tests

## Dev Notes

- **Objectif US (vérification existant) :** **Vérification + tests.** Auto-layout est **déjà implémenté** : `applyAutoLayout` dans `layoutSlice.ts`, Dagre côté client (`utils/dagreLayout.ts`), bouton et menu direction dans `GraphEditorHeader` / `useGraphToolbar`, entrée "Auto-layout" dans `PaneContextMenu`. L’US vise à valider les AC, documenter si besoin et couvrir par tests (unitaires, intégration, optionnel E2E) — pas de dev fonctionnel nouveau majeur.
- **Store :** `applyAutoLayout(algorithm, direction)` dans `frontend/src/store/slices/layoutSlice.ts`. Pour `algorithm === 'dagre'` : import dynamique `calculateDagreLayout` depuis `utils/dagreLayout`, puis `set({ nodes: layoutedNodes })`. Pour les autres algorithmes : appel `graphAPI.calculateLayout()` → `POST /api/v1/unity-dialogues/graph/calculate-layout`.
- **Backend :** `POST /api/v1/unity-dialogues/graph/calculate-layout` dans `api/routers/graph.py` ; `GraphConversionService.calculate_layout` dans `services/graph_conversion_service.py` (fallback cascade pour "dagre"/autres ; le vrai Dagre est côté client).
- **UI :** Bouton "📐 Auto-layout" et menu direction (TB/LR/BT/RL) dans `GraphEditorHeader` ; `handleAutoLayout(direction)` dans `useGraphToolbar.ts` appelle `applyAutoLayout('dagre', dir)`. `PaneContextMenu` appelle `applyAutoLayout('dagre', 'TB')` depuis `GraphCanvas.tsx`.
- **Persistance :** Après `set({ nodes: layoutedNodes })`, le store doit marquer le document dirty pour ADR-006. **À vérifier :** `applyAutoLayout` dans `layoutSlice.ts` n’appelle pas `get().markDirty()` après le `set` ; l’ajouter pour les deux branches (dagre et fallback backend) si manquant.
- **Cycles :** Dagre gère des DAG ; en présence de cycles le comportement dépend de l’implémentation (ex. coupe d’arêtes). Documenter ou tester le comportement observé si pertinent pour les AC.
- **Raccourci clavier :** L’epic mentionnait Ctrl+L ; aucun raccourci dédié auto-layout n’est trouvé dans `useKeyboardShortcuts`. Optionnel : ajouter Ctrl+L pour déclencher l’auto-layout (hors scope minimal de cette story "vérification + tests").

### Project Structure Notes

- **Fichiers concernés :**
  - `frontend/src/store/slices/layoutSlice.ts` — `applyAutoLayout`
  - `frontend/src/utils/dagreLayout.ts` — `calculateDagreLayout`
  - `frontend/src/api/graph.ts` — `calculateLayout` (appel backend)
  - `frontend/src/hooks/useGraphToolbar.ts` — `handleAutoLayout`
  - `frontend/src/components/graph/GraphEditorHeader.tsx` — bouton Auto-layout + dropdown direction
  - `frontend/src/components/graph/GraphCanvas.tsx` — PaneContextMenu `onAutoLayout` → `applyAutoLayout('dagre', 'TB')`
  - `api/routers/graph.py` — endpoint `calculate-layout`
  - `services/graph_conversion_service.py` — `calculate_layout`, `_simple_cascade_layout`
- **Tests existants :** `tests/api/test_graph_crud.py` — `test_calculate_layout_success` ; pas de tests unitaires frontend dédiés `applyAutoLayout` / dagre dans le périmètre actuel.
- **Réutiliser :** `useGraphStore().applyAutoLayout`, `useGraphToolbar().handleAutoLayout`, styles et patterns de `GraphEditorHeader` et `PaneContextMenu`.

### Architecture Compliance

- **ADR-007 (React Flow controlled) :** Les nœuds mis à jour par `applyAutoLayout` sont écrits dans le store (`set({ nodes: layoutedNodes })`) ; le canvas reflète l’état du store. Conforme.
- **ADR-006 (auto-save) :** S’assurer que la mise à jour des positions après auto-layout déclenche bien le marquage dirty / auto-save (pas d’endpoint dédié ; persistance via save-and-write).
- **NFR-P1 (Graph Rendering <1s) :** Le calcul Dagre côté client doit rester raisonnable pour 500+ nœuds ; si besoin, documenter les limites ou optimisations.

### Library / Framework Requirements

- **Dagre (client) :** `frontend/src/utils/dagreLayout.ts` — dépendance dagre (ou équivalent) pour le calcul des positions. Ne pas ajouter de nouvelle lib côté client pour cette story (vérification uniquement).
- **API :** `POST /api/v1/unity-dialogues/graph/calculate-layout` — body avec `nodes`, `edges`, `algorithm`, `direction` ; réponse avec `nodes` (positions). Déjà utilisé en fallback dans `layoutSlice`.

### File Structure Requirements

- Aucun nouveau fichier obligatoire ; tests à ajouter dans les répertoires existants (ex. `frontend/src/__tests__/` pour layout/store, `tests/api/` pour backend).
- Ne pas déplacer ou renommer les modules existants sans raison.

### Testing Requirements

- **Unit :** Store ou utilitaire : `applyAutoLayout('dagre', 'TB')` avec un petit graphe (nœuds + edges) → positions modifiées, cohérentes (ex. ordre Y croissant pour TB).
- **Intégration :** Composant ou store : déclencher auto-layout depuis la toolbar ou le menu pane → état du store mis à jour ; optionnel : appel API `calculate-layout` si chemin fallback testé.
- **Backend :** Conserver ou étendre `test_calculate_layout_success` dans `tests/api/test_graph_crud.py`.
- **E2E (optionnel) :** Ouvrir un dialogue → éditeur graphe → clic Auto-layout → les nœuds changent de position et le graphe reste utilisable.
- **Régression :** Menu contextuel pane (Story 2.12) et bouton toolbar continuent d’appeler l’auto-layout sans régression.

### Previous Story Intelligence (2.12)

- **PaneContextMenu** : "Auto-layout" appelle `onAutoLayout()` qui dans `GraphCanvas` est branché sur `applyAutoLayout('dagre', 'TB')`. Vérifier que l’ordre des arguments est bien `(algorithm, direction)` (ex. `('dagre', 'TB')`) partout pour éviter les inversions (cf. correctif 2.12 : `applyAutoLayout('dagre', 'TB')`).
- **GraphEditorHeader** : `handleAutoLayout(value)` avec `value` = TB/LR/BT/RL ; `applyAutoLayout('dagre', dir)` dans `useGraphToolbar`. Cohérence à maintenir.

### Git Intelligence Summary

- Fichiers récents : `layoutSlice.ts`, `dagreLayout.ts`, `GraphEditorHeader.tsx`, `useGraphToolbar.ts`, `GraphCanvas.tsx`, `PaneContextMenu.tsx`. Rester aligné avec les patterns existants (store = source de vérité, pas d’état local pour les nœuds).

### Latest Tech Information

- **Dagre (npm)** : Algorithme de layout pour graphes orientés ; directions TB/LR/BT/RL standard. Aucune mise à jour de version requise pour cette story de vérification.
- **Backend** : `_simple_cascade_layout` utilisé comme fallback ; le frontend privilégie le calcul Dagre client-side pour "dagre".

### Project Context Reference

- [Source: _bmad-output/planning-artifacts/epics/epic-02.md#Story-2.13] — Exigences AC, objectif "vérification + tests", pas de nouveau développement fonctionnel majeur
- [Source: frontend/src/store/slices/layoutSlice.ts] — `applyAutoLayout`, branche dagre vs API
- [Source: frontend/src/utils/dagreLayout.ts] — `calculateDagreLayout`
- [Source: frontend/src/hooks/useGraphToolbar.ts] — `handleAutoLayout`, direction
- [Source: frontend/src/components/graph/GraphEditorHeader.tsx] — Bouton Auto-layout, dropdown direction
- [Source: _bmad-output/implementation-artifacts/2-12-actions-contextuelles-sur-nœuds-menu-clic-droit-fr33.md] — PaneContextMenu "Auto-layout" et ordre des arguments

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### File List
