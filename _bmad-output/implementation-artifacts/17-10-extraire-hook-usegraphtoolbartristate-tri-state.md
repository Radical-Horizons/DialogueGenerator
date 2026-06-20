# Story 17.10: Extraire logique layout `useGraphToolbarLayoutMode`

Status: done

<!-- Ultimate context engine analysis completed - comprehensive developer guide created -->

## Story

As a **développeur frontend**,
I want **centraliser la logique narrow / confort (seuil 640px, tokens `graphToolbarChrome`, styles tactiles, structure de rangées) dans un hook dédié**,
so that **les bascules layout soient testables par contrat sans relire l’orchestration JSX du header**.

## Acceptance Criteria

1. **Hook `useGraphToolbarLayoutMode`** (`frontend/src/hooks/useGraphToolbarLayoutMode.ts`) expose au minimum :
   - `toolbarRef` — callback ref `useNarrowInlineSize` avec `{ measureParentClientWidth: true }`
   - `isNarrow` — booléen layout (&lt;640px conteneur parent)
   - `chrome` — tokens `graphToolbarChrome.narrow` | `graphToolbarChrome.comfortable`
   - `chromeStyles` — objet `GraphToolbarChromeStyles` (touch min, padding, fontSize)
   - `rootLayout` — helpers structure racine : `display`, `gridTemplateAreas` (avec/sans search), `gridTemplateColumns`, flags `flexWrap`/`alignItems`/`justifyContent` dérivés de `isNarrow` + `showSearchBar`
2. **`GraphEditorHeader.tsx`** consomme le hook ; ne contient plus d’appel direct à `useNarrowInlineSize` ni de construction inline de `chrome` / `chromeStyles` / styles racine grid-flex.
3. **Comportement strictement inchangé** — layout binaire confort (≥640px, 1 rangée) vs narrow (&lt;640px, grille + 2 rangées) ; **pas** d’état « compact desktop » 640–1099 ; `data-graph-toolbar-compact-desktop="false"` inchangé.
4. **Tests** : fichier contrat `useGraphToolbarLayoutMode.test.tsx` (seuil 640, tokens chrome, `chromeStyles`, `rootLayout` avec/sans search) + suite Vitest toolbar existante **100 % verte** + `npm --prefix frontend run lint` sans régression.

## Tasks / Subtasks

- [x] Task 1 : Contrat hook — bascule narrow/confort et tokens chrome (AC: #1, #4)
  - [x] 🔴 Test échoue : `useGraphToolbarLayoutMode.test.tsx` — host avec largeur simulée 400px → `isNarrow === true`, `chrome === graphToolbarChrome.narrow` ; 800px → `isNarrow === false`, `chrome === graphToolbarChrome.comfortable` ; seuil = `GRAPH_TOOLBAR_COMFORT_MIN_WIDTH_PX` (640)
  - [x] 🟢 Créer `useGraphToolbarLayoutMode` encapsulant `useNarrowInlineSize(640, { measureParentClientWidth: true })`, sélection `chrome`, construction `chromeStyles` (voir Dev Notes — extrait actuel du header)
  - [x] 🔵 Refactor : typer le retour du hook (`UseGraphToolbarLayoutModeReturn`) dans le même fichier ; éviter de dupliquer le type `GraphToolbarChromeStyles` — importer depuis `graphToolbarTypes.ts`

- [x] Task 2 : Structure de rangées et wiring header (AC: #2, #3)
  - [x] 🔴 Test échoue : tests contrat — `rootLayout.gridTemplateAreas` avec `showSearchBar: true` inclut la zone `"search"` ; avec `false`, zones `"header" "tools"` uniquement ; + `GraphEditorHeader.desktopToolbar.test.tsx` au moins un test rouge si le header n’utilise pas encore le hook (mock `useGraphToolbarLayoutMode` ou spy sur hook)
  - [x] 🟢 Brancher `GraphEditorHeader` sur le hook (`toolbarRef`, `isNarrow`, `chrome`, `chromeStyles`, `rootLayout`) ; supprimer logique layout inline lignes ~124–151 et styles racine dupliqués
  - [x] 🔵 Refactor : regrouper l’application de `rootLayout` sur le conteneur `data-testid="graph-editor-toolbar"` dans une petite fonction pure exportée (ex. `buildGraphToolbarRootStyle`) testable sans RTL du header complet — si le hook grossit trop

- [x] Task 3 : Suite toolbar complète + lint (AC: #3, #4)
  - [x] 🔴 Test échoue : exécuter les 4 fichiers toolbar — `GraphEditorHeader.{desktopToolbar,searchRow,undoRedo}.test.tsx` + `GraphEditor.multiSelection.test.tsx` — au moins une assertion liée au layout si le wiring casse `data-graph-toolbar-narrow`, `graph-toolbar-row-actions`, ou `flexWrap: nowrap` en confort
  - [x] 🟢 Adapter les mocks existants : remplacer ou compléter `mockNarrowToolbar` pour cibler `useGraphToolbarLayoutMode` **ou** conserver mock bas niveau `useNarrowInlineSize` si le hook reste thin wrapper — choix KISS, mais tests contrat hook obligatoires
  - [x] 🔵 Refactor : `GraphEditorHeader.tsx` cible **≤300 lignes** (déjà ~343 L post-17.9) ; ne pas extraire `useGraphToolbarMenuItems` ni splitter `GraphToolbarToolsRow` (646 L) — dette reportée ; documenter taille finale dans Dev Agent Record

## Dev Notes

- **Architecture guardrails** : extraction **logique existante** uniquement — zéro changement store, zéro nouveau breakpoint, zéro état « compact desktop ». Le hook ne doit **pas** importer `useGraphStore` ; le header garde store + menu items.
- **Nommage** : hook canonique **`useGraphToolbarLayoutMode`** (epic 17, skill responsive). Le slug fichier sprint `…tristate…` est un alias historique — **ne pas** implémenter de 3e mode layout. Export alias `useGraphToolbarTriState = useGraphToolbarLayoutMode` acceptable si utile pour grep legacy.
- **What to reuse** :
  - `useNarrowInlineSize` (callback ref Story 17.8) — le hook layout l’appelle, ne le réimplémente pas
  - `GRAPH_TOOLBAR_COMFORT_MIN_WIDTH_PX`, `graphToolbarChrome` (`frontend/src/theme/responsiveChrome.ts`)
  - `GraphToolbarChromeStyles` (`frontend/src/components/graph/graphToolbarTypes.ts`)
  - Sous-composants 17.9 inchangés en API props (`isNarrowToolbar`, `chrome`, `chromeStyles`)
- **Extrait à migrer** (état actuel `GraphEditorHeader.tsx` ~124–271) :
  - Appel `useNarrowInlineSize(GRAPH_TOOLBAR_COMFORT_MIN_WIDTH_PX, { measureParentClientWidth: true })`
  - `chrome = isNarrow ? narrow : comfortable`
  - Objet `chromeStyles` (`graphChromeTouch`, `graphChromeTouchNarrow` 32px en narrow, `effectiveButtonPadding`, `effectiveButtonFontSizeRem`)
  - Styles racine : `display grid|flex`, `gridTemplateAreas` conditionné par `showSearchBar`, `data-graph-toolbar-narrow`
- **Signature hook suggérée** : `useGraphToolbarLayoutMode(options?: { showSearchBar?: boolean })` — `showSearchBar` nécessaire pour `gridTemplateAreas` ; défaut `false`.
- **Quality bar** : tests contrat hook couvrent seuil et structure rangées ; 4 fichiers Vitest toolbar listés restent verts ; pas de régression sur `measureParentClientWidth` (mesure parent ResizablePanels, pas viewport).
- **Refactor bar** : hook ≤ ~120 L ; fonctions pures extraites testables ; max ~300 L header post-story.
- **Fichiers chauds** :
  - `frontend/src/components/graph/GraphToolbarToolsRow.tsx` (**646 L**) — consommateur props, **hors scope modification** sauf imports types ; split fichier = dette séparée
  - `frontend/src/components/graph/useGraphToolbarMenuItems.tsx` (**475 L**) — idem, non touché
  - `frontend/src/components/graph/GraphEditorHeader.tsx` (**343 L**) — orchestration uniquement ; objectif ≤300 L après extraction hook
- **Conventions** : hooks layout dans `frontend/src/hooks/` (à côté de `useNarrowInlineSize.ts`) ; tests colocalisés `useGraphToolbarLayoutMode.test.tsx`. Pattern mock toolbar : `vi.spyOn` comme dans `GraphEditorHeader.desktopToolbar.test.tsx`.

### Previous Story Intelligence (17.9)

- Header réduit **1611 → 335 L** ; JSX dans `GraphToolbarTitleBlock`, `GraphToolbarToolsRow`, `GraphToolbarStatusRow`, `GraphToolbarUndoRedoButtons`, `useGraphToolbarMenuItems`.
- Layout (`useNarrowInlineSize`, tokens, styles touch) **volontairement laissé dans le header** — c’est le scope exact de 17.10.
- `toolbarRef` doit rester sur la racine `data-testid="graph-editor-toolbar"` — ne pas interposer de wrapper entre ref et conteneur mesuré.
- Mocks tests : `mockNarrowToolbar` spy `useNarrowInlineSize` — après 17.10, préférer mock du hook layout **ou** conserver spy bas niveau si équivalent.
- Code review 17.9 : prop morte `isLoadingDialogue` retirée ; `GRAPH_TOOLBAR_DROPDOWN_Z_INDEX` centralisé ; 14/14 tests toolbar verts.

### Project Structure Notes

- Seuil unique : `GRAPH_TOOLBAR_COMFORT_MIN_WIDTH_PX = 640` — aligné `docs/architecture/GRAPH_EDITOR.md` (layout binaire, pas 1100px).
- Tests existants : `frontend/src/__tests__/GraphEditorHeader.{desktopToolbar,searchRow,undoRedo}.test.tsx`, `GraphEditor.multiSelection.test.tsx`, `frontend/src/hooks/useNarrowInlineSize.test.tsx` (référence patterns callback ref).
- Story **17.11** (backlog) : factorisation fixtures test + anti double-mount — **ne pas** anticiper dans 17.10 sauf mock minimal nécessaire au GREEN.

### References

- [Source: `_bmad-output/planning-artifacts/epics/epic-17.md` — Story 17.10]
- [Source: `docs/architecture/GRAPH_EDITOR.md` — Toolbar binaire 640px]
- [Source: `.cursor/skills/dialogue-frontend/references/responsive-epic17.md` — ligne 17.10 hook layout]
- [Source: `_bmad-output/implementation-artifacts/17-9-extraire-sous-composants-grapheditorheader-tri-state.md` — Dev Agent Record]
- `frontend/src/components/graph/GraphEditorHeader.tsx` (lignes layout ~124–271)
- `frontend/src/hooks/useNarrowInlineSize.ts`
- `frontend/src/theme/responsiveChrome.ts`

## Dev Agent Record

### Agent Model Used

Bob (SM) — create-story workflow 2026-06-20
Amelia (Dev) — dev-story 2026-06-20

### Debug Log References

- Vitest scoped : `frontend/tmp/vitest-cr-17-10.txt` — 22/22 tests verts (hook + 4 fichiers toolbar)
- Lint : `npm --prefix frontend run lint` — 0 erreur

### Completion Notes List

- Hook `useGraphToolbarLayoutMode` (~115 L) : `toolbarRef`, `isNarrow`, `chrome`, `chromeStyles`, `rootLayout` ; alias `useGraphToolbarTriState`
- Fonctions pures : `buildChromeStyles`, `buildRootLayout`, `buildGraphToolbarRootStyle` (testées sans RTL header)
- `GraphEditorHeader.tsx` : 343 → **296 L** ; plus d'appel direct `useNarrowInlineSize` ni construction inline chrome/root
- Mocks tests header : conservés sur `useNarrowInlineSize` (thin wrapper KISS — spy intercepte via hook)
- 🔵 Refactor Task 1 : `UseGraphToolbarLayoutModeReturn` + import `GraphToolbarChromeStyles` depuis `graphToolbarTypes.ts`
- 🔵 Refactor Task 2 : styles racine extraits → `buildGraphToolbarRootStyle(isNarrow, chrome, rootLayout)` remplace objet inline ~20 L
- 🔵 Refactor Task 3 : header 296 L (cible ≤300) ; `GraphToolbarToolsRow` (646 L) et `useGraphToolbarMenuItems` (475 L) non touchés — dette reportée 17.11+

### File List

- `frontend/src/hooks/useGraphToolbarLayoutMode.ts` (added)
- `frontend/src/hooks/useGraphToolbarLayoutMode.test.tsx` (added)
- `frontend/src/components/graph/GraphEditorHeader.tsx` (modified)
- `docs/architecture/GRAPH_EDITOR.md` (modified — doc hook 17.10)
- `.cursor/skills/dialogue-frontend/references/responsive-epic17.md` (modified — pattern toolbar)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (modified)
- `_bmad-output/implementation-artifacts/17-10-extraire-hook-usegraphtoolbartristate-tri-state.md` (modified)

## Senior Developer Review (AI)

_Reviewer: Amelia (Dev CR) — 2026-06-20_

**Verdict:** Approuvé après corrections option [1].

| Sévérité | Finding | Résolution |
|----------|---------|------------|
| MEDIUM | File List incomplet (docs + skill responsive) | File List complété |
| MEDIUM | `GRAPH_EDITOR.md` citait encore `useNarrowInlineSize` direct | Doc → `useGraphToolbarLayoutMode` |
| MEDIUM | Pas de test contrat sur options `useNarrowInlineSize(640, { measureParentClientWidth: true })` | Test spy ajouté |
| LOW | Test seuil 640 : double render sans `cleanup` | `cleanup()` entre renders |
| LOW | Magic `32` dans `buildChromeStyles` | Accepté (comportement hérité header) |
| LOW | Mocks header ciblent `useNarrowInlineSize` vs hook layout | Accepté KISS (Dev Notes) |

**Preuves exécutées (revue):** Vitest 23/23 (hook + 4 fichiers toolbar) ; lint 0 erreur.

**AC:** #1–#4 IMPLEMENTED.

## Change Log

- 2026-06-20 : Story context 17.10 préparée (hook `useGraphToolbarLayoutMode`, extraction logique layout depuis GraphEditorHeader post-17.9)
- 2026-06-20 : Implémentation dev-story — hook layout + tests contrat + wiring header (Amelia)
- 2026-06-20 : Code review — doc hook, test spy measureParentClientWidth, story → done (Amelia CR)
