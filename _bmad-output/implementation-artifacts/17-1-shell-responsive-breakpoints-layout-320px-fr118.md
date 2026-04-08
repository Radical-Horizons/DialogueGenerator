# Story 17.1: Shell responsive et breakpoints (layout utilisable ≥320px) (FR118)

Status: done

## Story

As a **utilisateur sur mobile ou tablette**,  
I want **un agencement qui s’adapte à la largeur du viewport (≥320px) sans débordement horizontal global**,  
so that **je peux ouvrir l’app et accéder aux zones principales (navigation, graphe, contexte) de façon prévisible**.

## Acceptance Criteria

1. **Viewport narrow (mobile/tablet)**
   - **Given** une largeur viewport **320px**, **375px**, **768px** et **1024px**  
     **When** je charge l’application authentifiée sur un dialogue / graphe  
     **Then** aucun scroll horizontal **sur le document entier** (root) pour le shell principal  
     **And** les zones critiques (header / accès graphe / ouverture panneaux) restent atteignables
   - **Note** : les exceptions doivent rester **localisées** et justifiées (ex. un conteneur interne), jamais un overflow global du document.

2. **Desktop non-regression**
   - **Given** un viewport desktop large  
     **When** je redimensionne au-dessus du breakpoint « large »  
     **Then** le layout desktop actuel (3 colonnes / panneaux redimensionnables) est **préservé** sans régression majeure.

3. **Breakpoints**
   - Les breakpoints implémentés doivent être cohérents avec la spec UX `responsive-design-accessibility.md` (Mobile 320–767, Tablet 768–1023, Desktop 1024+).

## Tasks / Subtasks

- [x] **Task 1 : Éliminer l’overflow horizontal global du shell sur narrow** (AC: #1)
  - [x] 🔴 Test échoue : à **320px / 375px / 768px / 1024px**, le root (document/app shell) ne présente **aucun overflow horizontal** (pas de scrolling latéral) et les zones “Header + zone main” restent visibles/scrollables verticalement uniquement.
  - [x] 🟢 Implémenter les ajustements de layout/CSS nécessaires sur le shell principal (voir Dev Notes).
  - [x] 🔵 Refactor : normaliser les règles “overflow/minWidth/minHeight” du layout (éviter les overrides ad-hoc inline dispersés) et renforcer la lisibilité des tests de viewport.

- [x] **Task 2 : Rendre le layout utilisable sur mobile (320–767) via un mode narrow explicite** (AC: #1, #3)
  - [x] 🔴 Test échoue : à **320px**, le layout ne force pas un “3 panneaux” compressé illisible ; un mode narrow s’active et permet d’accéder au graphe et aux panneaux (au minimum via actions/boutons visibles).
  - [x] 🟢 Implémenter un comportement narrow (par ex. panels repliables par défaut / mode 1-colonne avec accès explicite aux panneaux) en conservant l’accès aux fonctionnalités cœur.
  - [x] 🔵 Refactor : extraire la logique de breakpoint (détection + état “narrow/tablet/desktop”) dans un hook utilitaire réutilisable et supprimer la duplication de logique responsive si elle émerge.

- [x] **Task 3 : Mode tablette (768–1023) — layout hybride sans régression desktop** (AC: #1, #2, #3)
  - [x] 🔴 Test échoue : à **768px/1024px**, la transition de layout ne provoque ni overflow global ni états incohérents (ex. panneaux impossibles à rouvrir, tabs inaccessibles).
  - [x] 🟢 Implémenter le comportement “tablet” (2 colonnes ou drawers selon choix d’implémentation) tout en conservant le comportement desktop à partir de 1024px.
  - [x] 🔵 Refactor : clarifier le contrat entre “ResizablePanels” et le mode responsive (ex. minSizes/adaptation) pour éviter des bugs de tailles persistées non compatibles avec narrow.

## Dev Notes

- **Architecture guardrails**
  - Conserver l’architecture front existante (React 18 + TS + Vite) et le découpage `frontend/src/components/...`.
  - Éviter les refactorings massifs hors scope : l’objectif est la **stabilité responsive** (Epic 17), pas une refonte UI complète.
  - Ne pas dégrader le desktop-first : le layout 3 colonnes redimensionnables reste la référence au-dessus de 1024px.

- **Ce qui existe déjà (à réutiliser plutôt que réinventer)**
  - Layout principal : `frontend/src/components/layout/MainLayout.tsx` (shell `height: 100vh`, `overflow: hidden`).
  - Layout 3 panneaux : `frontend/src/components/layout/Dashboard.tsx` utilise `ResizablePanels` + panneaux gauche/central/droit.
  - Panneaux redimensionnables : `frontend/src/components/shared/ResizablePanels.tsx` (persist localStorage, drag souris).

- **Points sensibles (risques de régression)**
  - `ResizablePanels` a des `minSizes` “desktop” (ex. `Dashboard`: `[200, 400, 250]`) qui peuvent être incompatibles avec 320px : le responsive doit éviter d’entrer dans un état impossible (panneaux compressés → overflow).
  - La persistance `localStorage` (`resizable_dashboard_panels`) peut réappliquer des tailles “desktop” sur mobile : prévoir un comportement de normalisation/override en mode narrow (sans casser l’expérience desktop).
  - Beaucoup de styles sont inline (Dashboard/Header) : attention aux `minWidth`, `clamp()`, padding et éléments `whiteSpace: 'nowrap'` qui créent facilement de l’overflow horizontal sur narrow.

- **Quality bar (tests)**
  - Tests responsive à minima sur les 4 largeurs de l’AC (320/375/768/1024) avec assertions orientées **résultat observable** : pas d’overflow global, accès aux zones principales, non-régression desktop.
  - Éviter des tests fragiles basés sur des valeurs de pixels exactes (préférer “pas de scroll horizontal global”, présence de contrôles d’accès aux panneaux, etc.).

### Project Structure Notes

- Le layout “3 colonnes” est principalement dans `Dashboard` (panneaux + tabs) et le shell dans `MainLayout` (header + main). Le graphe est encapsulé par `GraphEditor` et ne devrait pas porter la responsabilité du responsive global.

### References

- Source: `_bmad-output/planning-artifacts/epics/epic-17.md` (Story 17.1 / FR118)
- Source: `_bmad-output/planning-artifacts/ux-design-specification/responsive-design-accessibility.md` (breakpoints + stratégie)
- Code: `frontend/src/components/layout/Dashboard.tsx` (3 panneaux, collapse/expand) ; `frontend/src/components/shared/ResizablePanels.tsx` ; `frontend/src/components/layout/MainLayout.tsx`

## Dev Agent Record

### Agent Model Used

GPT-5.2 (Cursor)

### Debug Log References

### Completion Notes List

- Ultimate context engine analysis completed - comprehensive developer guide created
- Task 1: suppression de l’overflow horizontal global via `document.documentElement.style.overflowX = 'hidden'` et `document.body.style.overflowX = 'hidden'` (setup/cleanup dans `MainLayout`). Test Vitest ajouté.
- 🔵 Refactor Task 1: évite les écritures redondantes (avant → après)
  - avant: `document.body.style.overflowX = 'hidden'`
  - après: `if (document.body.style.overflowX !== next) document.body.style.overflowX = next`
- Task 2/3: ajout d’un mode responsive (mobile/tablet) au `Dashboard` avec panneaux repliés par défaut et contrôles explicites pour les rouvrir ; extraction du calcul de breakpoints dans `useViewportMode()`. Tests Vitest ajoutés (mobile 320px, tablette 768px).
- 🔵 Refactor Task 2: extraction de la logique breakpoints (avant → après)
  - avant: calcul inline dans `Dashboard` (innerWidth + listener)
  - après: `const viewportMode = useViewportMode()` (`frontend/src/hooks/useViewportMode.ts`)
- 🔵 Refactor Task 3: adaptation des contraintes `ResizablePanels.minSizes` selon `viewportMode` pour éviter des min-sums incompatibles sur narrow.

## Senior Developer Review (AI)

- **Date:** 2026-04-08  
- **Outcome:** Approve (après correctifs review)  
- **Résumé:** Revue adversariale — écarts tests vs AC (375/1024), persistance `localStorage` en narrow, header `flexShrink: 0` sur zone actions, cibles tactiles expand < 44px (reporté Epic 17.2). Correctifs appliqués sur scope story (Header, Dashboard storage/remount, tests).

### Action Items (résolus dans cette passe)

- [x] Couvrir **375px** et **1024px** + accès graphe en mobile dans `Dashboard.test.tsx`
- [x] Éviter application des tailles **localStorage desktop** en mobile/tablette (`storageKey` conditionnel + `key={viewportMode}` sur `ResizablePanels`)
- [x] Réduire débordement header narrow (`flexWrap`, `minWidth: 0`, zone droite plus flexible)

### File List

- `_bmad-output/implementation-artifacts/17-1-shell-responsive-breakpoints-layout-320px-fr118.md`
- `frontend/src/components/layout/MainLayout.tsx`
- `frontend/src/components/layout/MainLayout.responsive.test.tsx`
- `frontend/src/components/layout/Dashboard.tsx`
- `frontend/src/components/layout/Dashboard.test.tsx`
- `frontend/src/components/layout/Header.tsx`
- `frontend/src/hooks/useViewportMode.ts`

## Change Log

- **2026-04-08 — Code review (AI):** tests responsive 375/1024 + accès graphe mobile ; `ResizablePanels` sans persistance LS hors desktop + remount par `viewportMode` ; assouplissement `Header` pour viewports étroits.

