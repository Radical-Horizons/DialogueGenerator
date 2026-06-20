# Story 17.9: Extraire sous-composants presentation GraphEditorHeader (toolbar responsive)

Status: done

<!-- Ultimate context engine analysis completed - comprehensive developer guide created -->

## Story

As a **développeur frontend**,
I want **extraire le JSX presentation de `GraphEditorHeader` en trois sous-composants dédiés**,
so that **le header (~1611 L) devienne lisible sans régression sur le layout binaire confort/narrow déjà validé (17.1–17.8)**.

## Acceptance Criteria

1. **Comportement inchangé** — modes confort (≥640px, 1 rangée) et narrow (&lt;640px, grille + rangées actions/status) : suite Vitest toolbar existante **100 % verte**.
2. **Sous-composants créés** sous `frontend/src/components/graph/` :
   - `GraphToolbarTitleBlock` — zone titre / retour / `headerSelector`
   - `GraphToolbarToolsRow` — outils (layout, batch, undo/redo, actions, qualités, raccourcis, recherche)
   - `GraphToolbarStatusRow` — badge santé graphe + `SaveStatusIndicator` (+ regroupement status en narrow)
3. **`GraphEditorHeader.tsx`** allégé en JSX ; logique layout (`useNarrowInlineSize`, tokens chrome) **reste dans le header** pour cette story (extraction hook = **17.10**).
4. `npm --prefix frontend run lint` sans régression.

## Tasks / Subtasks

- [x] Task 1 : Toolbar confort desktop inchangée après découpage JSX (AC: #1, #4)
  - [x] 🔴 Test échoue : exécuter `GraphEditorHeader.desktopToolbar.test.tsx` — au moins un test rouge si un sous-composant manque ou casse le DOM attendu (`graph-editor-toolbar-tools`, `flexWrap: nowrap`, pas de `graph-toolbar-row-status` en confort)
  - [x] 🟢 Extraire `GraphToolbarTitleBlock`, `GraphToolbarToolsRow`, `GraphToolbarStatusRow` et brancher dans le header pour le chemin **confort** (voir Dev Notes — cartographie)
  - [x] 🔵 Refactor : regrouper les props des trois composants en interfaces typées exportées (`GraphToolbar*Props`) plutôt que des listes inline de 20+ props ; éviter duplication des styles `graphChromeTouch` entre siblings

- [x] Task 2 : Toolbar narrow (grille + 2 rangées) inchangée (AC: #1, #2)
  - [x] 🔴 Test échoue : `GraphEditorHeader.desktopToolbar` cas « narrow » + `GraphEditorHeader.searchRow.test.tsx` — `graph-toolbar-row-actions` et `graph-toolbar-row-status` présents ; `data-graph-toolbar-narrow="true"` ; recherche embedded si `showSearchBar`
  - [x] 🟢 Adapter les trois sous-composants pour le chemin **narrow** (même props, branches `isNarrowToolbar` conservées)
  - [x] 🔵 Refactor : factoriser les boutons undo/redo dupliqués entre branche confort (top-left) et narrow (`row-actions`) via un petit helper presentation **dans** `GraphToolbarToolsRow` — sans changer les `data-testid`

- [x] Task 3 : Suite toolbar complète + lint (AC: #1, #3, #4)
  - [x] 🔴 Test échoue : `GraphEditorHeader.undoRedo.test.tsx` + `GraphEditor.multiSelection.test.tsx` — au moins une assertion liée à la toolbar si le wiring store/toolbar casse
  - [x] 🟢 Finaliser l'orchestration dans `GraphEditorHeader` (callbacks `render*` remplacés par composants ; conserver portail tooltip raccourcis dans le header ou `ToolsRow` selon KISS)
  - [x] 🔵 Refactor : `GraphEditorHeader.tsx` cible **&lt;1200 lignes** post-extraction (objectif intermédiaire réaliste ; &lt;800 = story 17.10) ; supprimer les `render*()` devenus morts

## Dev Notes

- **Architecture guardrails** : pas de nouvelle logique store ; pas de changement seuil 640px ; pas d'état « compact desktop » (640–1099) — **non implémenté**, hors scope. `data-graph-toolbar-compact-desktop="false"` reste hardcodé.
- **What to reuse** : `BatchOperationsMenu`, `GraphSearchBar`, `GraphActionsDropdown`, `graphToolbarChrome`, `useNarrowInlineSize` (callback ref 17.8), `useGraphToolbar` via prop `toolbar`.
- **Cartographie composants** (découpage cible) :

  | Composant | Contenu principal |
  |-----------|-------------------|
  | `GraphToolbarTitleBlock` | `headerSelector`, bouton Retour standalone, zone `graph-toolbar-top-left` non-narrow |
  | `GraphToolbarToolsRow` | `renderToolsGroup`, undo/redo, Actions/Qualités dropdowns, bouton recherche, rangée `graph-toolbar-row-actions` (narrow) |
  | `GraphToolbarStatusRow` | `renderBatchOperationsMenu`, `renderGraphHealthBadge`, `renderSaveStatusIndicator`, rangée `graph-toolbar-row-status` (narrow) |

- **Quality bar** : zéro régression sur les 4 fichiers tests listés ; pas de mock `useNarrowInlineSize` sauf optimisation explicite (hook sûr post-17.8).
- **Refactor bar** : max ~300 L par nouveau fichier ; fonctions ~60 L ; pas de duplication non triviale entre composants.
- **Fichiers chauds** :
  - `frontend/src/components/graph/GraphEditorHeader.tsx` (**~1611 L**) — cette story = découpage JSX uniquement ; ne pas ajouter de features ; logique layout reste ici jusqu'à 17.10
- **Conventions** : colocaliser sous `frontend/src/components/graph/` (comme `GraphValidationPanel`, `DialogueCostModal`) ; props typées `interface` ; pas de prop drilling store — le header garde `useGraphStore()` et passe des valeurs/callbacks.

### Previous Story Intelligence (17.8)

- `useNarrowInlineSize` utilise une **callback ref** — les sous-composants ne doivent **pas** interposer un wrapper qui casse `toolbarRef` sur la racine `graph-editor-toolbar`.
- Mocks `useNarrowInlineSize` dans les tests : `vi.spyOn(narrowHook, 'useNarrowInlineSize').mockImplementationOnce(...)` — pattern dans `GraphEditorHeader.desktopToolbar.test.tsx`.
- Preuve UI 17.8 validée PO : switch onglets/drawers sans `window.resize`.

### Project Structure Notes

- Tests existants : `frontend/src/__tests__/GraphEditorHeader.{desktopToolbar,searchRow,undoRedo}.test.tsx`, `frontend/src/__tests__/GraphEditor.multiSelection.test.tsx`
- Seuil : `GRAPH_TOOLBAR_COMFORT_MIN_WIDTH_PX = 640` (`frontend/src/theme/responsiveChrome.ts`)
- **Ne pas confondre** avec Story **4.14** (routers API — done)

### References

- [Source: `_bmad-output/planning-artifacts/epics/epic-17.md` — Story 17.9]
- [Source: `docs/architecture/GRAPH_EDITOR.md` — Header toolbar binaire]
- [Source: `.cursor/skills/dialogue-frontend/references/responsive-epic17.md`]
- [Source: `.cursor/rules/graph_editor.mdc` — invariants graphe]
- `frontend/src/components/graph/GraphEditorHeader.tsx`

## Dev Agent Record

### Agent Model Used

Bob (SM) — create-story workflow 2026-06-20
Amelia (Dev) — dev-story 2026-06-20

### Debug Log References

- Baseline pré-extraction : `GraphEditorHeader.desktopToolbar.test.tsx` 3/3 pass (tmp/vitest-17-9-baseline.txt)
- Post-extraction : 4 fichiers toolbar 14/14 pass (tmp/vitest-17-9-toolbar.txt)
- ESLint ciblé graph toolbar : 0 erreur

### Completion Notes List

- Ultimate context engine analysis completed — layout binaire aligné (doc drift 1100px corrigé)
- `GraphEditorHeader.tsx` : 1611 → **335 L** ; layout `useNarrowInlineSize` + orchestration props conservés dans le header
- Sous-composants : `GraphToolbarTitleBlock`, `GraphToolbarToolsRow` (+ `GraphToolbarToolsGroup`), `GraphToolbarStatusRow`
- Helpers colocalisés : `GraphToolbarUndoRedoButtons`, `useGraphToolbarMenuItems`, `graphToolbarTypes` (réexport `GraphToolbar*Props`)
- 🔵 Task 1 : `graphToolbarTypes.ts` centralise `GraphToolbarChromeStyles` — avant : styles inline dupliqués dans le monolithe ; après : objet `chromeStyles` passé aux enfants
- 🔵 Task 2 : `GraphToolbarUndoRedoButtons` — avant : JSX dupliqué confort/narrow ; après : helper unique `variant="comfort-icon"|"narrow-labeled"`, mêmes `data-testid`
- 🔵 Task 3 : tooltip raccourcis déplacé dans `GraphToolbarToolsRow` (`GraphToolbarShortcutsButton`) ; tous les `render*()` supprimés du header
- Dette taille fichier : `GraphToolbarToolsRow.tsx` (~637 L) et `useGraphToolbarMenuItems.tsx` (~469 L) dépassent la barre ~300 L — extraction depuis monolithe ; split additionnel reporté 17.10

### File List

- frontend/src/components/graph/GraphEditorHeader.tsx (modified)
- frontend/src/components/graph/GraphToolbarTitleBlock.tsx (added)
- frontend/src/components/graph/GraphToolbarToolsRow.tsx (added)
- frontend/src/components/graph/GraphToolbarStatusRow.tsx (added)
- frontend/src/components/graph/GraphToolbarUndoRedoButtons.tsx (added)
- frontend/src/components/graph/useGraphToolbarMenuItems.tsx (added)
- frontend/src/components/graph/graphToolbarTypes.ts (added)
- frontend/src/components/graph/graphToolbarConstants.ts (modified)

## Change Log

- 2026-06-20 : Extraction JSX presentation GraphEditorHeader en 3 sous-composants toolbar (Story 17.9) — 14 tests Vitest toolbar verts, header 335 L
- 2026-06-20 : Code review (Amelia) — 6 issues corrigés : prop morte `isLoadingDialogue` retirée de l'interface + 5 callers tests ; `zIndex: 1000` → `GRAPH_TOOLBAR_DROPDOWN_Z_INDEX` dans layout dropdown ; condition redondante `GraphToolbarTitleBlock` ; dead conditional fontSize shortcuts ; pattern `{props}` → spread dans Layout/QualityDropdown ; lint baseline restaurée (structuredPromptMerge + UnityDialogueList). 14/14 tests verts, lint 0 erreur.
