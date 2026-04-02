# Story 2.9: Filtrer vue graphe (show/hide types nœuds, speakers) (FR30)

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **utilisateur créant des dialogues**,
I want **filtrer la vue du graphe (afficher/masquer types de nœuds, speakers)**,
so that **je peux me concentrer sur des parties spécifiques du dialogue sans distraction**.

## Acceptance Criteria

1. **Given** je suis dans l'éditeur de graphe  
   **When** j'ouvre le panneau "Filtres" (bouton dans la toolbar ou menu)  
   **Then** des options de filtrage s'affichent : types de nœuds (dialogue / test / end), speakers extraits dynamiquement du store  
   **And** le panneau est accessible au clavier (focus trap, Escape ferme)

2. **Given** je désactive le filtre "Test Nodes"  
   **When** le filtre est appliqué  
   **Then** tous les nœuds de type "test" sont masqués du graphe  
   **And** les edges dont `source` ou `target` est un nœud masqué sont également masqués  
   **And** un badge "X nœuds masqués" s'affiche dans le panneau (ou la toolbar)

3. **Given** je filtre par speaker (ex: "Afficher uniquement Akthar")  
   **When** le filtre est appliqué  
   **Then** seuls les nœuds avec `data.speaker === "Akthar"` sont visibles  
   **And** tous les autres nœuds et leurs edges sont masqués  
   **And** les edges entre nœuds **visibles** restent affichés

4. **Given** je combine plusieurs filtres (types + speakers)  
   **When** j'applique "Dialogue nodes" ET "Speaker: Akthar"  
   **Then** seuls les nœuds dialogue avec speaker Akthar sont visibles  
   **And** les filtres sont appliqués en temps réel (pas de bouton "Valider")

5. **Given** je réinitialise les filtres  
   **When** je clique sur "Réinitialiser filtres"  
   **Then** tous les nœuds redeviennent visibles  
   **And** l'état `graphFilters` est remis à sa valeur initiale (tous types actifs, aucun speaker restreint)

## Tasks / Subtasks

- [x] Task 1 : État `graphFilters` et action `setFilters` dans le store (AC: #2, #3, #4, #5)
  - [x] 1.1 (TDD) Test : `setFilters({ hiddenTypes: ['test'] })` → les nodes de type 'test' disparaissent des nodes dérivés (via sélecteur) ; `setFilters({})` → tous nodes visibles ; combinaison `hiddenTypes + allowedSpeakers` → intersection correcte
  - [x] 1.2 Dans `frontend/src/store/types/graphState.ts`, ajouter interface `GraphFilters { hiddenTypes?: NodeType[]; allowedSpeakers?: string[] }` (où `NodeType = 'dialogue' | 'test' | 'end'`)
  - [x] 1.3 Dans `frontend/src/store/slices/uiSlice.ts`, ajouter état `graphFilters: GraphFilters` (valeur initiale : `{}`) et action `setFilters(filters: GraphFilters): void` ; réinitialisation via `resetFilters(): void` (alias `setFilters({})`)

- [x] Task 2 : Filtrage dans `GraphCanvas.tsx` (AC: #2, #3, #4)
  - [x] 2.1 (TDD) Test : quand `graphFilters.hiddenTypes` contient `'test'`, les nodes de type 'test' sont absents du tableau passé à ReactFlow ; les edges dont source ou target pointe vers un node masqué sont également absents
  - [x] 2.2 Dans `GraphCanvas.tsx`, récupérer `graphFilters` depuis `useGraphStore()` ; avant le `useMemo` de dérivation (ligne 216), calculer `visibleStoreNodes = applyNodeFilters(storeNodes, graphFilters)` et `visibleStoreEdges = applyEdgeFilters(storeEdges, visibleStoreNodeIds, graphFilters)` ; remplacer `storeNodes` par `visibleStoreNodes` dans le `useMemo` existant
  - [x] 2.3 Créer helpers purs dans `frontend/src/components/graph/graphFilterUtils.ts` : `applyNodeFilters(nodes, filters)` et `applyEdgeFilters(edges, visibleNodeIds, filters)` — séparés pour testabilité

- [x] Task 3 : Composant `GraphFiltersPanel.tsx` (AC: #1, #2, #3, #4, #5)
  - [x] 3.1 (TDD) Test : rendu checkboxes types nœuds (dialogue/test/end) et dropdown/checkboxes speakers extraits de `storeNodes` ; clic sur checkbox type appelle `setFilters` avec le type toggleé ; clic "Réinitialiser" appelle `resetFilters` ; badge "X nœuds masqués" correct
  - [x] 3.2 Créer `frontend/src/components/graph/GraphFiltersPanel.tsx` : checkboxes pour chaque `NodeType` (dialogue/test/end), liste de speakers unique extraite de `useGraphStore().nodes.map(n => n.data.speaker).filter(Boolean)`, bouton "Réinitialiser filtres", badge compteur masqués ; appeler `setFilters` à chaque changement (temps réel, pas de bouton Valider)
  - [x] 3.3 Accessibilité : `role="dialog"`, focus trap (Tab/Shift+Tab), Escape ferme, `aria-label="Filtres du graphe"`, labels explicites pour chaque checkbox

- [x] Task 4 : Intégration dans `GraphEditor.tsx` (AC: #1)
  - [x] 4.1 (TDD) Test : bouton "Filtres" (ou raccourci clavier) ouvre `GraphFiltersPanel` ; Escape ferme ; badge visible dans toolbar quand filtres actifs
  - [x] 4.2 Dans `GraphEditor.tsx`, ajouter état local `showFiltersPanel` ; rendre `GraphFiltersPanel` conditionnel ; ajouter bouton "Filtres" dans la toolbar (cohérent avec pattern bouton "Jump to Node") avec badge si `graphFilters` non vide
  - [x] 4.3 ÉTENDRE `useKeyboardShortcuts` dans `GraphEditor.tsx` : ajouter raccourci `ctrl+shift+f` pour ouvrir/fermer le panneau filtres (ne pas conflicte avec Ctrl+F qui ouvrira la recherche 2.7 ou d'autres raccourcis existants)

## Dev Notes

- **Objectif US (vérification existant) :** **Nouvelle fonctionnalité.** Aucun panneau de filtres (types nœuds, speakers) ni état `graphFilters` dans la codebase aujourd'hui. Filtrage 100 % client à créer.
- **CRÉER** `GraphFiltersPanel.tsx` dans `frontend/src/components/graph/` — aucun composant similaire existant.
- **CRÉER** `graphFilterUtils.ts` dans `frontend/src/components/graph/` — helpers purs `applyNodeFilters` / `applyEdgeFilters` pour testabilité.
- **CRÉER** `graphFilters` + `setFilters` + `resetFilters` dans `uiSlice.ts` — même fichier que `selectedNodeId`, `jumpToNode`, `findNodesByQuery` (pattern établi en 2.8).
- **ÉTENDRE** `GraphCanvas.tsx` : filtrage des nodes **avant** le `useMemo` de dérivation enrichie (ligne 216-243). Pattern : `storeNodes` → `applyNodeFilters(storeNodes, graphFilters)` → `useMemo(...)`. Même logique pour edges : filtrer les edges dont source ou target est dans les nodes masqués.
- **AUCUN appel backend** : filtrage 100 % client sur les nodes déjà dans le store.

### Project Structure Notes

- **Fichiers à créer :**
  - `frontend/src/components/graph/GraphFiltersPanel.tsx`
  - `frontend/src/components/graph/graphFilterUtils.ts`
- **Fichiers à modifier :**
  - `frontend/src/store/types/graphState.ts` — ajouter `GraphFilters`, `NodeType` (si absent)
  - `frontend/src/store/slices/uiSlice.ts` — ajouter `graphFilters`, `setFilters`, `resetFilters`
  - `frontend/src/components/graph/GraphCanvas.tsx` — récupérer `graphFilters`, appeler `applyNodeFilters` + `applyEdgeFilters` avant le `useMemo` de dérivation (l.216-243)
  - `frontend/src/components/graph/GraphEditor.tsx` — état `showFiltersPanel`, bouton toolbar, raccourci `ctrl+shift+f`, rendu `<GraphFiltersPanel />`
- **Aucun fichier backend** à créer ou modifier.

### Architecture Compliance

- **ADR-007 (React Flow controlled) :** Le filtrage ne modifie pas `storeNodes` ni `storeEdges` — il dérive un sous-ensemble à passer à React Flow. L'état du store reste la source de vérité ; `graphFilters` est de l'état UI pur.
- **ADR-006 (auto-save) :** Aucun impact : `graphFilters` est de l'état de session (non persisté) ; aucun `markDirty()` à appeler.
- **NFR-P4 (UI Responsiveness <100ms) :** `applyNodeFilters` est un filtre tableau pur, O(n) ; pas de risque de perf même à 500 nodes.
- **NFR-A1 (Keyboard Navigation 100%) :** `ctrl+shift+f` ouvre le panneau, Escape ferme, checkboxes navigables au clavier, focus trap dans le panneau.

### Library / Framework Requirements

- **React Flow (xyflow) :** Aucune API React Flow spécifique pour le filtrage — on passe simplement un sous-ensemble de nodes/edges aux props `nodes` et `edges` du composant `<ReactFlow>`. React Flow gère le rendu des seuls éléments passés.
- **Zustand (graphStore) :** Nouvel état `graphFilters` et actions `setFilters`/`resetFilters` dans `uiSlice.ts`. Accès depuis `GraphCanvas.tsx` via `useGraphStore()`.
- **React :** Composant contrôlé `GraphFiltersPanel` — les checkboxes reflètent `graphFilters` du store ; chaque changement appelle `setFilters` immédiatement (temps réel, pas de state local).

### File Structure Requirements

- `frontend/src/components/graph/GraphFiltersPanel.tsx` — nouveau composant
- `frontend/src/components/graph/graphFilterUtils.ts` — helpers purs (séparés pour testabilité)
- `frontend/src/store/types/graphState.ts` — ajouter `GraphFilters`, `NodeType`
- `frontend/src/store/slices/uiSlice.ts` — ajouter `graphFilters`, `setFilters`, `resetFilters`
- `frontend/src/components/graph/GraphCanvas.tsx` — étendre pour utiliser `applyNodeFilters`/`applyEdgeFilters`
- `frontend/src/components/graph/GraphEditor.tsx` — intégration panneau + raccourci
- Tests : `frontend/src/__tests__/` — tests unitaires pour `graphFilterUtils`, `setFilters`/`resetFilters`, tests composant pour `GraphFiltersPanel`, tests intégration pour `GraphCanvas` avec filtres actifs, test `GraphEditor` raccourci `ctrl+shift+f`

### Testing Requirements

- **Unit (graphFilterUtils) :** `applyNodeFilters([...], { hiddenTypes: ['test'] })` → nodes 'test' exclus ; `applyNodeFilters([...], {})` → tous nodes ; `applyEdgeFilters(edges, visibleIds, filters)` → edges masqués quand source ou target absent de `visibleIds`.
- **Unit (uiSlice) :** `setFilters({ hiddenTypes: ['end'] })` → `graphFilters.hiddenTypes === ['end']` ; `resetFilters()` → `graphFilters === {}`.
- **Composant (GraphFiltersPanel) :** Rendu checkboxes dialogue/test/end ; clic checkbox type → `setFilters` appelé avec le bon payload ; dropdown speakers dynamique depuis nodes ; bouton "Réinitialiser" → `resetFilters` ; badge "X nœuds masqués" correct.
- **Intégration (GraphCanvas) :** Quand `graphFilters.hiddenTypes = ['test']`, les nodes 'test' et leurs edges ne sont pas dans le tableau passé à React Flow.
- **GraphEditor :** `ctrl+shift+f` ouvre `GraphFiltersPanel` ; Escape ferme ; badge toolbar actif si filtres non vides.
- **Régression :** `graphStore.controlledMode.test.ts` ne doit pas être cassé ; `JumpToNodeModal.test.tsx` et `GraphEditor.keyboard.test.tsx` (2.8) restent verts ; `setHighlightedNodes` / `focus-generated-node` non impactés.

### Previous Story Intelligence (2.8)

- **Pattern modal/panneau :** `GraphEditor.tsx` gère l'état ouvert/fermé (`showXxxModal / showXxxPanel`) + raccourci clavier via `useKeyboardShortcuts`. Même pattern pour `showFiltersPanel` + `ctrl+shift+f`.
- **Pattern store UI :** Actions UI ajoutées dans `uiSlice.ts` (`jumpToNode`, `findNodesByQuery` en 2.8). Idem pour `graphFilters`, `setFilters`, `resetFilters`.
- **Helpers purs dans des fichiers dédiés :** `findNodesByQuery` était dans `uiSlice.ts` directement ; pour les filtres, préférer un fichier `graphFilterUtils.ts` séparé (fonctions pures sans dépendance Zustand) pour faciliter les tests.
- **Accessibilité :** JumpToNodeModal utilisait `role="dialog"`, focus trap, Escape, `aria-label`. Appliquer le même pattern à `GraphFiltersPanel`.

### Git Intelligence Summary

- Dernier commit : `ff15ee5` — Implement Story 2.8 (Jump to Node). Convention : un commit par story, description en anglais.
- Patterns établis : actions UI dans `uiSlice.ts`, nouveaux composants dans `frontend/src/components/graph/`, tests dans `frontend/src/__tests__/`.
- Pas d'endpoint dédié créé depuis Story 2.1 pour les features graph UI — confirme que le filtrage est 100 % client.

### Latest Tech Information

- **React Flow 11.x :** Passer un sous-ensemble de nodes/edges est le pattern officiel pour masquer des éléments — React Flow ne gère que ce qu'on lui passe dans `nodes` et `edges`. Pas d'API `hidden` à utiliser (préférer le filtre avant passage des props pour éviter les résidus de layout).
- **Zustand :** Pas de sélecteur mémoïsé nécessaire pour `graphFilters` — lecture directe dans `GraphCanvas.tsx` via `useGraphStore()` suffisant ; `useMemo` déjà présent pour la dérivation nodes/edges.

### Project Context Reference

- [Source: _bmad-output/planning-artifacts/epics/epic-02.md#Story-2.9] — Story 2.9 complète, AC, contraintes techniques, FR30.
- [Source: frontend/src/components/graph/GraphCanvas.tsx l.120-243] — `storeNodes`, `storeEdges`, `useMemo` de dérivation enrichie, pattern `validationErrors` filter.
- [Source: frontend/src/store/slices/uiSlice.ts] — `setFilters` / `graphFilters` à ajouter dans ce fichier (pattern 2.8 : `jumpToNode`, `findNodesByQuery`).
- [Source: _bmad-output/planning-artifacts/architecture/v10-architectural-decisions-adrs.md#ADR-007] — GraphCanvas controlled mode ; filtrage node/edge uniquement côté dérivation, jamais modification du store.

## Dev Agent Record

### Agent Model Used

(Dev Story workflow — agent non spécifié)

### Debug Log References

### Completion Notes List

- Task 1: `GraphFilters`, `NodeType` dans `graphState.ts` ; `graphFilters`, `setFilters`, `resetFilters` dans `uiSlice.ts`. Tests unitaires store + graphFilterUtils.
- Task 2: `applyNodeFilters` / `applyEdgeFilters` dans `graphFilterUtils.ts` ; GraphCanvas dérive `visibleStoreNodes` et `visibleStoreEdges` avant useMemo enrichissement (store inchangé, ADR-007).
- Task 3: `GraphFiltersPanel.tsx` avec checkboxes types (dialogue/test/end), speakers dynamiques via `getUniqueSpeakers()`, badge "X nœuds masqués", bouton Réinitialiser, focus trap et Escape.
- Task 4: Bouton "Filtres" sous menu **Actions** (toolbar GraphEditor), raccourci `ctrl+shift+f`, badge actif si filtres non vides, entrée aide raccourcis.
- Code review (AI) : Tests TDD manquants ajoutés — `GraphFiltersPanel.test.tsx` (Task 3.1), test Ctrl+Shift+F + Escape dans `GraphEditor.keyboard.test.tsx` (Task 4.1). Retour de focus sur le bouton Actions à la fermeture du panneau (NFR-A1).

### File List

- frontend/src/store/types/graphState.ts
- frontend/src/store/slices/uiSlice.ts
- frontend/src/components/graph/graphFilterUtils.ts
- frontend/src/components/graph/GraphCanvas.tsx
- frontend/src/components/graph/GraphFiltersPanel.tsx (new)
- frontend/src/components/graph/GraphEditor.tsx
- frontend/src/__tests__/graphStore.graphFilters.test.ts (new)
- frontend/src/__tests__/graphFilterUtils.test.ts (new)
- frontend/src/__tests__/GraphFiltersPanel.test.tsx (new)
- frontend/src/__tests__/GraphEditor.keyboard.test.tsx (modified — Story 2.9)

### Senior Developer Review (AI)

- **Review:** code-review-2-9-filtrer-vue-graphe-fr30.md
- **Correctifs appliqués :** (1) Ajout `GraphFiltersPanel.test.tsx` — rendu checkboxes types/speakers, setFilters/resetFilters, badge "X nœuds masqués", Escape ferme. (2) Ajout test Story 2.9 dans `GraphEditor.keyboard.test.tsx` — Ctrl+Shift+F ouvre le panneau, Escape ferme. (3) Retour de focus sur le bouton Actions à la fermeture du panneau (`onClose` + `actionsDropdownBtnRef.current?.focus()`). Bouton Filtres déplacé sous menu Actions (demande utilisateur).

### Change Log

| Date | Auteur | Modification |
|------|--------|--------------|
| (implémentation) | Dev Agent | Story 2.9 implémentée (graphFilters, GraphFiltersPanel, GraphCanvas filtrage, Actions → Filtres, Ctrl+Shift+F). |
| 2026-03-12 | AI Code Review | Revu adversarial ; correctifs : tests TDD 3.1 et 4.1 ajoutés, focus return à la fermeture panneau ; statut → done. |
