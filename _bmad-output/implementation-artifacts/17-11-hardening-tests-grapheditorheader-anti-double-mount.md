# Story 17.11: Hardening tests GraphEditorHeader — anti double-mount

Status: done

<!-- Ultimate context engine analysis completed - comprehensive developer guide created -->

## Story

As a **développeur frontend**,
I want **des tests anti-régression explicites sur la toolbar (dont un seul mount `SaveStatusIndicator` par mode layout) et des fixtures partagées harmonisées**,
so that **les refactors futurs (17.9–17.10+) ne réintroduisent pas double-mount, overflow toolbar ni mocks divergents**.

## Acceptance Criteria

1. **Anti double-mount** — en mode confort **et** narrow, un test dédié vérifie qu’`SaveStatusIndicator` n’est monté qu’**une fois** par render de `GraphEditorHeader` (spy mount count ou `queryAllBy*` sur un marqueur stable).
2. **Fixture partagée** — `frontend/src/__tests__/graphEditorHeaderTestUtils.ts` exporte `makeMockToolbar` (baseline complète `UseGraphToolbarReturn`) et `mockNarrowToolbar(boolean)` ; les copies locales dans `GraphEditorHeader.{desktopToolbar,searchRow,undoRedo}.test.tsx` sont supprimées.
3. **Preuve UI** — confort → narrow → confort documentée dans Dev Agent Record : pas de scroll horizontal parasite sur la toolbar, pas d’écran noir (procédure `.cursor/skills/dialogue-frontend/references/responsive-epic17.md` §17.11).
4. **Suite verte** — `GraphEditorHeader.desktopToolbar`, `searchRow`, `undoRedo`, `GraphEditor.multiSelection` + `npm --prefix frontend run lint` sans régression.

## Tasks / Subtasks

- [x] Task 1 : Fixture partagée toolbar — mocks harmonisés (AC: #2)
  - [x] 🔴 Test échoue : au moins un fichier `GraphEditorHeader.*.test.tsx` importe `makeMockToolbar` / `mockNarrowToolbar` depuis `graphEditorHeaderTestUtils.ts` — le module n’existe pas encore (build/import error)
  - [x] 🟢 Créer `graphEditorHeaderTestUtils.ts` avec baseline `makeMockToolbar` (union des champs requis par desktopToolbar, searchRow, undoRedo — voir Dev Notes) et `mockNarrowToolbar` (spy `useNarrowInlineSize`, pattern 17.10 KISS)
  - [x] 🔵 Refactor : extraire les constantes/refs dupliquées du mock (ex. refs `{ current: null }`) dans des helpers privés du fichier utils ; nommer le mock baseline `defaultMockToolbarState` si ça clarifie les overrides par test

- [x] Task 2 : Un seul `SaveStatusIndicator` par mode layout (AC: #1)
  - [x] 🔴 Test échoue : nouveau cas (ex. `GraphEditorHeader.saveStatusMount.test.tsx` ou describe dédié dans `desktopToolbar`) — render confort + narrow avec dialogue actif → spy `SaveStatusIndicator` ou marqueur DOM → count === 1 ; test rouge tant qu’aucune assertion anti double-mount n’existe
  - [x] 🟢 Implémenter l’assertion mount unique pour confort (`segments` batch vs health+save sur deux `GraphToolbarStatusRow`) **et** narrow (rangée unique `graph-toolbar-row-status`) — **sans modifier le comportement produit** sauf ajout optionnel `data-testid="graph-toolbar-save-status"` sur le wrapper save si le spy module est trop fragile (voir Dev Notes)
  - [x] 🔵 Refactor : clarifier les noms de cas (« comfort-single-save-indicator », « narrow-single-save-indicator ») ; factoriser le render minimal `GraphEditorHeader` partagé dans les utils si duplication >2 lignes entre tests mount et density

- [x] Task 3 : Suite toolbar complète, lint et preuve UI (AC: #3, #4)
  - [x] 🔴 Test échoue : exécuter les 4 fichiers Vitest listés — au moins un échec tant que les imports locaux `makeMockToolbar` / mocks narrow inline ne sont pas migrés vers la fixture partagée
  - [x] 🟢 Migrer `GraphEditorHeader.{desktopToolbar,searchRow,undoRedo}.test.tsx` vers la fixture ; conserver le mock `SaveStatusIndicator: () => null` dans `GraphEditor.multiSelection.test.tsx` (intégration GraphEditor, hors scope fixture header)
  - [x] 🔵 Refactor : documenter dans Dev Agent Record la preuve UI (viewport ou resize colonne, 3 étapes confort→narrow→confort) ; si les utils dépassent ~120 L, scinder `mockNarrowToolbar` vs `makeMockToolbar` en exports nommés sans second fichier

## Dev Notes

- **Architecture guardrails** : **tests + fixtures uniquement** — zéro changement layout, store ou JSX produit. Exception minimale acceptée : `data-testid` sur le nœud save de la toolbar **si** le spy ESM sur `SaveStatusIndicator` est instable en Vitest (préférer spy en premier).
- **Contexte double-mount (17.9)** : en confort, `GraphEditorHeader` rend **deux** `GraphToolbarStatusRow` avec `segments={['batch']}` puis `segments={['health','save']}` — le save ne doit apparaître que dans le second. En narrow, une seule row status inclut batch + save. Régression typique : dupliquer `save` dans les deux rows ou remonter `SaveStatusIndicator` hors `GraphToolbarStatusRow`.
- **What to reuse** :
  - Pattern spy narrow : `vi.spyOn(narrowHook, 'useNarrowInlineSize').mockImplementationOnce(...)` (`GraphEditorHeader.desktopToolbar.test.tsx` actuel)
  - Alternative post-17.10 : spy `useGraphToolbarLayoutMode` — **équivalent** si KISS ; ne pas maintenir deux stratégies divergentes entre fichiers
  - Mocks save ailleurs : `GraphEditor.loreValidationPanel.test.tsx` et `graphEditorStandalone.routeLoad.test.tsx` utilisent `data-testid="save-status-indicator"` — **ne pas** confondre avec la toolbar graphe
- **Baseline `makeMockToolbar`** : `undoRedo.test.tsx` est la plus complète (champs validation/quality/schema) ; `desktopToolbar` / `searchRow` sont des sous-ensembles. La fixture partagée doit couvrir **tous** les champs `UseGraphToolbarReturn` requis par les trois fichiers (TypeScript strict) avec overrides par test.
- **Quality bar** :
  - Mount count : 1 en confort avec `activeDialogueFilename` défini ; 0 si pas de dialogue actif (`GraphSaveStatusIndicator` retourne null)
  - Mount count narrow : idem
  - Aucune régression sur assertions existantes (`flexWrap: nowrap`, `graph-toolbar-row-status`, `data-graph-toolbar-narrow`)
- **Refactor bar** : fixture utils ≤ ~150 L ; pas de duplication `makeMockToolbar` restante dans les 3 fichiers header ; tests mount ≤ ~80 L.
- **Fichiers chauds** :
  - `frontend/src/components/graph/GraphToolbarToolsRow.tsx` (**646 L**) — **hors scope** ; pas de modification
  - `frontend/src/components/graph/GraphEditorHeader.tsx` (**296 L**) — **hors scope** sauf testid optionnel sur enfant save
  - `frontend/src/components/graph/GraphToolbarStatusRow.tsx` (**267 L**) — lecture seule pour comprendre segments ; pas de refactor produit
- **Conventions** : fixtures sous `frontend/src/__tests__/` (suffixe `TestUtils.ts`, ex. patterns existants) ; Vitest ciblé : `cd frontend && npx vitest run src/__tests__/GraphEditorHeader*.test.tsx src/__tests__/GraphEditor.multiSelection.test.tsx --reporter=dot` ; lint : `npm --prefix frontend run lint`.

### Previous Story Intelligence (17.10)

- Hook `useGraphToolbarLayoutMode` encapsule `useNarrowInlineSize(640, { measureParentClientWidth: true })` — les tests header **peuvent** continuer à spy le hook bas niveau (choix KISS 17.10, intercepte via thin wrapper).
- 23 tests toolbar + hook verts post-17.10 ; mocks header **non** migrés — c’est le scope exact de **17.11**.
- `GraphEditorHeader.tsx` à **296 L** — ne pas rouvrir l’extraction composants (`GraphToolbarToolsRow` 646 L = dette séparée).
- Code review 17.10 : test spy `measureParentClientWidth` ; `cleanup()` entre renders seuil 640.

### Project Structure Notes

- Fichiers à migrer : `GraphEditorHeader.desktopToolbar.test.tsx` (169 L), `searchRow.test.tsx` (77 L), `undoRedo.test.tsx` (287 L).
- `fr119-touch.chrome.test.tsx` duplique aussi `makeMockToolbar` — **hors AC** ; migration optionnelle si trivial lors du 🔵 Task 1.
- `SaveStatusIndicator` (`frontend/src/components/shared/SaveStatusIndicator.tsx`) n’a **pas** de `data-testid` natif — les tests existants mockent le composant ou utilisent `save-status-indicator` en stub local.
- Preuve UI : `npm run dev` → Dashboard → onglet graphe → réduire colonne centrale sous 640px → re-élargir ; vérifier toolbar + canvas visibles (checklist skill responsive §17.11).

### References

- [Source: `_bmad-output/planning-artifacts/epics/epic-17.md` — Story 17.11]
- [Source: `.cursor/skills/dialogue-frontend/references/responsive-epic17.md` — §17.11 hardening]
- [Source: `docs/architecture/GRAPH_EDITOR.md` — Toolbar binaire 640px, `useGraphToolbarLayoutMode`]
- [Source: `_bmad-output/implementation-artifacts/17-10-extraire-hook-usegraphtoolbartristate-tri-state.md` — mocks KISS, Dev Agent Record]
- [Source: `_bmad-output/implementation-artifacts/17-9-extraire-sous-composants-grapheditorheader-tri-state.md` — `GraphToolbarStatusRow` segments]
- `frontend/src/components/graph/GraphEditorHeader.tsx` (l.260–274 — double StatusRow confort)
- `frontend/src/components/graph/GraphToolbarStatusRow.tsx` (`GraphSaveStatusIndicator`)

## Dev Agent Record

### Agent Model Used

Amelia (Dev) — dev-story workflow 2026-06-20

### Debug Log References

- Task 1 🔴 : `GraphEditorHeader.desktopToolbar.test.tsx` import `./graphEditorHeaderTestUtils` → Vite `Failed to resolve import` (preuve RED).
- Task 2 🔴 : spy récursif `shared.SaveStatusIndicator(props)` → `RangeError: Maximum call stack size exceeded` ; corrigé via import direct `RealSaveStatusIndicator` + `createElement`.

### Completion Notes List

- **Task 1** : `graphEditorHeaderTestUtils.ts` (141 L) — `defaultMockToolbarState`, `nullRef<T>()`, `makeMockToolbar`, `mockNarrowToolbar`, `renderGraphEditorHeader`, `defaultGraphEditorHeaderProps`. Baseline = union complète `UseGraphToolbarReturn` (undoRedo + champs export/preview). Migrations : desktopToolbar, searchRow, undoRedo.
- **Task 2** : `GraphEditorHeader.saveStatusMount.test.tsx` (52 L) — spy barrel `shared.SaveStatusIndicator` avec délégation non-récursive ; cas `comfort-single-save-indicator`, `narrow-single-save-indicator`, zéro mount sans dialogue. Comportement produit inchangé (segments 17.9 déjà corrects).
- **Task 3** : 17/17 tests verts (5 fichiers) ; lint green. Preuve UI (checklist §17.11) : `npm run dev` → Dashboard → onglet Graphe → dialogue actif → resize colonne centrale &lt;640px (narrow : `data-graph-toolbar-narrow="true"`, row-status visible, pas de scroll horizontal toolbar) → re-élargir &gt;640px (confort : flexWrap nowrap, pas de row-status narrow) ; canvas React Flow reste visible aux deux étapes — pas d’écran noir.
- 🔵 Refactor Task 1 : `{ current: null }` ×5 → `nullRef()` ; baseline nommée `defaultMockToolbarState`.
- 🔵 Refactor Task 2 : noms de cas explicites ; `renderGraphEditorHeader` factorisé dans utils (réutilisé par searchRow + saveStatusMount).
- 🔵 Refactor Task 3 : utils 141 L (&lt;150) — pas de second fichier ; preuve UI documentée ci-dessus.

### File List

- `frontend/src/__tests__/graphEditorHeaderTestUtils.ts` (added)
- `frontend/src/__tests__/GraphEditorHeader.saveStatusMount.test.tsx` (added)
- `frontend/src/__tests__/GraphEditorHeader.desktopToolbar.test.tsx` (modified)
- `frontend/src/__tests__/GraphEditorHeader.searchRow.test.tsx` (modified)
- `frontend/src/__tests__/GraphEditorHeader.undoRedo.test.tsx` (modified)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (modified)

## Change Log

- 2026-06-20 : Story 17.11 — fixture toolbar partagée, tests anti double-mount SaveStatusIndicator, migration mocks header, suite 17/17 + lint green.
- 2026-06-20 : Code review (Amelia) — `mockNarrowToolbar` stable (`mockImplementation`), `cleanup()` saveStatusMount test 3 ; statut **done**.

## Senior Developer Review (AI)

**Reviewer:** Véronique (via Amelia CR workflow) — 2026-06-20

**Outcome:** Approve (HIGH/MEDIUM corrigés en revue)

### AC Validation

| AC | Statut | Preuve |
|----|--------|--------|
| #1 Anti double-mount | ✅ | `GraphEditorHeader.saveStatusMount.test.tsx` — spy barrel + cas confort/narrow/sans dialogue |
| #2 Fixture partagée | ✅ | `graphEditorHeaderTestUtils.ts` ; 3 fichiers header migrés, copies locales supprimées |
| #3 Preuve UI | ✅ | Dev Agent Record §17.11 (confort→narrow→confort, pas scroll/noir) |
| #4 Suite verte | ✅ | 17/17 Vitest + `npm --prefix frontend run lint` green (re-vérifié en CR) |

### Findings (0 HIGH — 2 MEDIUM corrigés, 3 LOW ouverts)

**MEDIUM (corrigés en revue)**

1. **`mockNarrowToolbar` — `mockImplementationOnce`** [`graphEditorHeaderTestUtils.ts:104`] — 2e appel `useNarrowInlineSize` (StrictMode / ref) ignorait le mock → flaky. **Fix:** `mockImplementation` (aligné `useGraphToolbarLayoutMode.test.tsx`).
2. **`saveStatusMount` test 3 — pas de `cleanup()`** entre renders confort/narrow — DOM empilé. **Fix:** `cleanup()` avant 2e render.

**LOW (non bloquants)**

3. Spy compte **invocations composant**, pas instances DOM — AC autorise spy ; nom « mount » imprécis.
4. `desktopToolbar` / `undoRedo` — props render dupliquées ; `renderGraphEditorHeader` utilisé seulement searchRow + saveStatusMount.
5. `fr119-touch.chrome.test.tsx` — `makeMockToolbar` local incomplet (hors AC ; migration optionnelle).

**Git vs File List:** changements prod 17.9/17.10 sur branche — hors scope 17.11 (branch tolerance OK).

### File List (post-review)

- `frontend/src/__tests__/graphEditorHeaderTestUtils.ts` (modified — mock stable)
- `frontend/src/__tests__/GraphEditorHeader.saveStatusMount.test.tsx` (modified — cleanup)
