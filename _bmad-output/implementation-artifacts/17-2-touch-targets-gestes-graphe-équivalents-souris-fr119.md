# Story 17.2: Cibles tactiles et équivalents aux interactions souris (FR119)

Status: done

<!-- validate-create-story (checklist qualité) : 2026-04-08 — PASS après enrichissements (inventaire menus, garde-fous RF / pointer, périmètre toolbar). -->

## Story

As a **utilisateur tactile**,  
I want **des zones d’appui suffisantes et des gestes standards (pan, zoom) sur le graphe**,  
so that **je peux naviguer et sélectionner sans frustration**.

## Acceptance Criteria

1. **Cibles tactiles (chrome shell)**  
   - **Given** un écran tactile (ou simulation viewport mobile/tablette)  
   - **When** j’interagis avec les contrôles chrome (boutons, onglets, toggles du shell — header, onglets Dashboard, boutons de panneaux latéraux visibles)  
   - **Then** les cibles respectent **minimum 44×44px** (zone d’appui), ou l’écart est **documenté** avec justification accessibilité (ex. contrôle composite avec label clair)

2. **Pan / zoom graphe**  
   - **Given** le graphe affiché (React Flow)  
   - **When** j’utilise les gestes **pan / zoom** supportés par la lib (tactile / trackpad selon environnement de test)  
   - **Then** la navigation reste **fluide** et **cohérente** avec Epic 2 — **pas de régression** sur le comportement desktop (souris / molette)

3. **Équivalent au clic droit**  
   - **Given** une action exposée aujourd’hui surtout via **menu contextuel** (clic droit) sur le graphe  
   - **When** je suis en contexte **tactile** (pas de clic droit)  
   - **Then** un **chemin équivalent** existe : **long press** sur nœud / pane, bouton « … » dans la barre graphe (`GraphEditorHeader`), ou autre pattern explicite — la **liste des actions couvertes** est **alignée** sur les entrées réelles des menus (voir **Inventaire menus** ci-dessous) et **figée** dans un commentaire de test ou cette section.

### Inventaire menus (source de vérité code — à jour au moment de la validation)

**`PaneContextMenu` (fond du canvas)**  
- Nouveau nœud  
- Auto-layout  

**`NodeContextMenu` (nœud)** — libellés UI tels qu’affichés  
- Éditer  
- Si nœud dialogue ou test : **Générer**, **Voir le prompt**  
- Dupliquer (uniquement nœud dialogue — sinon désactivé)  
- Supprimer  

*Si le code ajoute des entrées, mettre à jour cette liste et les assertions de test.*

## Tasks / Subtasks

- [x] **Task 1 : Cibles tactiles 44×44px sur le chrome applicatif (shell)** (AC: #1)  
  - [x] 🔴 Test échoue : pour un ensemble **représentatif** de contrôles chrome — **minimum** : un contrôle `Header` (session authentifiée), les onglets segmentés du `Dashboard`, les boutons **Déplier** panneaux latéraux ; **si l’onglet graphe est actif** : au moins **deux** contrôles visibles de `GraphEditorHeader` (ex. sauvegarde / ajout nœud / menu batch selon ce qui est rendu dans le test) — la **boîte d’appui** est **≥ 44px** en largeur et hauteur **ou** l’exception est **documentée** (texte court dans le test).  
  - [x] 🟢 Implémenter les ajustements de taille / padding / hit-area sur les composants concernés (voir Dev Notes).  
  - [x] 🔵 Refactor : factoriser une constante ou helper de **taille minimale tactile** (ex. `TOUCH_TARGET_MIN_PX`) partagée entre zones critiques, et clarifier les noms de tests (chrome vs graphe).

- [x] **Task 2 : Pan / zoom tactile sur le canvas graphe sans régression desktop** (AC: #2)  
  - [x] 🔴 Test échoue : comportement React Flow **contrôlé** (ADR-007) inchangé pour desktop ; vérifier explicitement que les interactions par défaut **ne sont pas désactivées** par erreur (`panOnDrag`, `zoomOnScroll`, `zoomOnPinch` selon doc **React Flow 11** — aujourd’hui `GraphCanvas` fixe notamment `panActivationKeyCode="Space"` : le pan **souris** reste attendu ; confirmer le comportement **touch** pinch/pan et l’absence de régression). Assertion **comportementale** ou snapshot de props exportées / test léger si jsdom limite.  
  - [x] 🟢 Implémenter / ajuster la config `ReactFlow` dans `GraphCanvas` uniquement si nécessaire (pas de duplication de logique store).  
  - [x] 🔵 Refactor : regrouper les options « interaction viewport » dans un objet ou constante nommée pour limiter la dérive future entre desktop et touch.

- [x] **Task 3 : Équivalent tactile aux menus contextuels nœud + pane** (AC: #3)  
  - [x] 🔴 Test échoue : en contexte **pointer coarse** (mock `matchMedia('(pointer: coarse)')` ou équivalent), un **long press** (ou mécanisme retenu) sur **pane** puis sur **nœud dialogue** (fixture minimale) ouvre les menus avec les **rôles / libellés** attendus (`role="menu"`, `menuitem` : *Nouveau nœud*, *Auto-layout* ; *Éditer*, *Générer*, *Voir le prompt*, *Dupliquer*, *Supprimer* selon visibilité). Annulation du long press si **drag / pan** du canvas (pas d’ouverture fantôme).  
  - [x] 🟢 Implémenter le déclenchement tactile (long press + annulation si scroll) en réutilisant les handlers existants (`openContextMenu`, actions store) — pas de second chemin métier dupliqué.  
  - [x] 🔵 Refactor : extraire la logique « ouvrir menu à (x,y) » déjà partiellement centralisée dans `GraphCanvas` pour éviter divergence souris vs touch ; renforcer la lisibilité des tests (liste d’actions attendues alignée sur les libellés du menu).

## Dev Notes

- **Architecture guardrails** : graphe en **mode controlled** (ADR-007) ; mutations via store / `runGraphTransaction` ; pas de handlers React Flow parallèles non documentés.  
- **What to reuse** : `GraphCanvas` (`onNodeContextMenu`, `onPaneContextMenu`, `openContextMenu`), `NodeContextMenu`, `PaneContextMenu`, `useReactFlowHandlers` ; toolbar : `GraphEditorHeader` ; shell : `Header`, `Dashboard` (`PanelExpandButton`, `PanelCollapseButton`, `Tabs`).  
- **Piège connu (à traiter dans Task 3 ou test de non-régression)** : `GraphCanvas` ferme les menus sur **`mousedown`** hors conteneur — sur tactile, valider que la fermeture fonctionne aussi (**`pointerdown`** / tap outside) pour ne pas laisser un menu bloquant.  
- **Contexte review 17.1** : boutons **Déplier** latéraux &lt; 44×44 — à corriger ici. Les **`Controls`** / **`MiniMap`** React Flow : vérifier hit-area ; amélioration optionnelle si mesurable sans casser le layout.  
- **Quality bar** : tests **comportement** ; pas de tests vacuous (`if (el) expect…` sans `expect(el).toBeTruthy()` avant) ; **Playwright** optionnel pour pinch/pan réel si utile.  
- **Périmètre** : ne pas refondre toute la toolbar ; viser **couverture représentative** + **chemins équivalents** aux menus contextuels.

### Project Structure Notes

- Graphe : `frontend/src/components/graph/GraphCanvas.tsx`, `NodeContextMenu.tsx`, `PaneContextMenu.tsx`, `GraphEditorHeader.tsx`.  
- Shell : `frontend/src/components/layout/Dashboard.tsx`, `Header.tsx`.

### References

- [Source: `_bmad-output/planning-artifacts/epics/epic-17.md` — Story 17.2 / FR119]  
- [Source: `_bmad-output/planning-artifacts/ux-design-specification/responsive-design-accessibility.md` — Touch targets]  
- [Source: `.cursor/rules/graph_editor.mdc` — ADR-007, context menus via store]

## Dev Agent Record

### Agent Model Used

Composer (agent dev Cursor) — session 2026-04-08

### Debug Log References

### Completion Notes List

- **AC1** : `TOUCH_TARGET_MIN_PX` dans `constants.ts` ; styles min 44px sur `Header`, `Tabs`, `Dashboard` (collapse/expand), `GraphEditorHeader` (Undo/Redo, Auto-layout, Actions). Tests `fr119-touch.chrome.test.tsx` (assertions sur styles inline + `QueryClientProvider` pour `Header`).
- **AC2** : `GRAPH_VIEWPORT_INTERACTION_OPTIONS` + test unitaire ; `GraphCanvas` spread sur `ReactFlow` (`panOnDrag`, `zoomOnScroll`, `zoomOnPinch`, `Space`).
- **AC3** : `useGraphContextMenuLongPress` + `useCoarsePointerMatch` ; long press touch → `openContextMenuAt` / `openPaneContextMenuAt` ; `clampContextMenuToViewport` ; `suppressNextPaneClickRef` pour éviter fermeture immédiate au relâchement ; `pointerdown` document + `onMoveStart` / `onNodeDragStart` annulent le timer ; `Header` fermeture dropdowns au `pointerdown`.
- **🔵 Task1** : constante partagée `TOUCH_TARGET_MIN_PX` + `GRAPH_CHROME_TOUCH` dans `GraphEditorHeader`.
- **🔵 Task2** : module `graphViewportInteraction.ts`.
- **🔵 Task3** : `contextMenuPlacement.ts` + hook dédié ; garde `matchMedia` absente → coarse false (tests jsdom sans mock).
- **Divers** : `vitest.config` `define.__BUILD_DATE__` ; `GraphEditorHeader` `(graphValidationErrors ?? [])` ; `Dashboard.test.tsx` `innerWidth` sans `any` (lint).

### File List

- `frontend/src/constants.ts`
- `frontend/src/components/graph/graphViewportInteraction.ts`
- `frontend/src/components/graph/graphViewportInteraction.test.ts`
- `frontend/src/utils/contextMenuPlacement.ts`
- `frontend/src/utils/contextMenuPlacement.test.ts`
- `frontend/src/hooks/useGraphContextMenuLongPress.ts`
- `frontend/src/components/graph/GraphCanvas.tsx`
- `frontend/src/components/graph/GraphEditorHeader.tsx`
- `frontend/src/components/graph/BatchOperationsMenu.tsx`
- `frontend/src/components/layout/Dashboard.tsx`
- `frontend/src/components/layout/Header.tsx`
- `frontend/src/components/shared/Tabs.tsx`
- `frontend/src/__tests__/fr119-touch.chrome.test.tsx`
- `frontend/src/__tests__/GraphCanvas.touchLongPress.test.tsx`
- `frontend/vitest.config.ts`
- `frontend/src/components/layout/Dashboard.test.tsx`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
- `_bmad-output/implementation-artifacts/17-2-touch-targets-gestes-graphe-équivalents-souris-fr119.md`

## Change Log

- 2026-04-08 : Impl FR119 — touch targets 44px, props RF11 explicites, long press menus + pointerdown, tests + lint.
- 2026-04-08 : Code review (AI) — correctifs toolbar (raccourcis 28px, Coûts/Recherche), `pointerdown` sur `BatchOperationsMenu`, test onglet graphe mobile + assertions supplémentaires header graphe.

---

## Senior Developer Review (AI)

**Date :** 2026-04-08  
**Issue :** Story `17-2-touch-targets-gestes-graphe-équivalents-souris-fr119` (FR119)  
**Résultat :** **Approuvé** (après correctifs ci-dessous)

### Synthèse adversariale

| Gravité | Trouvé | Statut |
|---------|--------|--------|
| **MEDIUM** | Bouton « ? » raccourcis graphe en **28×28px** — sous le seuil 44px (AC1 / toolbar) | **Corrigé** : `TOUCH_TARGET_MIN_PX` + `GRAPH_CHROME_TOUCH` sur le bouton raccourcis ; idem **Coûts** et **Rechercher** (min explicite). |
| **MEDIUM** | `BatchOperationsMenu` : fermeture du sous-menu tag uniquement sur `mousedown` — même classe de bug que `GraphCanvas` / `Header` sur tactile | **Corrigé** : écoute `pointerdown` en plus de `mousedown`. |
| **MEDIUM** | Sous-tâche Task1 : « onglet graphe actif » — les tests ne basculaient pas sur l’onglet graphe dans le `Dashboard` (GraphEditor mocké) | **Corrigé** : test dédié « onglet Éditeur de graphe actif » + élargissement assertions `GraphEditorHeader` (Rechercher, Coûts, raccourcis). |
| **LOW** | Tests FR119 : assertions sur **styles inline** plutôt que `getBoundingClientRect` — acceptable si `minWidth`/`minHeight` appliqués (conforme à l’AC « ou documenté ») | **Info** — pas de changement requis. |
| **LOW** | Long press activé seulement si `matchMedia('(pointer: coarse)')` — appareils tactiles rapportant `fine` peuvent ne pas avoir le long press | **Info** — hors périmètre strict story ; piste `(hover: none)` en évolution future. |
| **LOW** | `onMoveStart` annule le timer long press : **non couvert** par un test dédié (le déplacement souris sur pane est testé) | **Info** — code présent dans `GraphCanvas.tsx` ; test optionnel. |
| **LOW** | Fichiers git hors File List story (`MainLayout.tsx`, story 17.1, etc.) — branche multi-stories | **Info** — tolérance branche (workflow code-review). |

### Action items review

- [x] Tous les points **HIGH/MEDIUM** traités dans le code ; aucun `[AI-Review]` restant ouvert.

### Où tester dans l’UI

- **Header** connecté : Options, Actions, avatar (≥44px).  
- **Dashboard** : onglets segmentés centraux ; mobile (~320px) : boutons **Déplier** ; onglet **Éditeur de graphe**.  
- **Graphe** : barre d’outils (Undo, Actions, Coûts, Rechercher, raccourcis « ? ») ; **long press** sur fond / nœud si `(pointer: coarse)` ; clic droit inchangé desktop.

---

## Rapport validation (checklist create-story)

| Catégorie | Verdict |
|-----------|---------|
| Contexte / AC | **OK** — aligné epic 17.2 + inventaire menus raccroché au code |
| Tâches TDD | **OK** — 🔴/🟢/🔵 présents ; Task 1 étendue au toolbar graphe |
| Dev Notes | **Renforcé** — `pointer` vs `mousedown`, props RF, `GraphEditorHeader` |
| Anti-sur-prescription | **OK** — pas de liste exhaustive de fichiers/méthodes |
| Risque dev agent | **Réduit** — liste d’actions et piège fermeture menu explicites |

**Definition of Done (validation story) :** prêt pour `dev-story` après lecture rapide par le dev.
