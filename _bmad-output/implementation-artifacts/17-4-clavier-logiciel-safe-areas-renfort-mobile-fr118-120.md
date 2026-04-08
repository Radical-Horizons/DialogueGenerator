# Story 17.4: Qualité mobile — clavier logiciel, viewport dynamique, safe areas (FR118–FR120)

Status: done

<!-- Note: Validation optionnelle — validate-create-story avant dev-story si besoin. -->

## Story

As a **utilisateur sur appareil réel (iOS / Android)**,
I want **éviter les zones masquées par encoches / barres système et que le clavier logiciel ne cache pas les champs ou CTA essentiels**,
so that **je peux saisir du texte et valider des actions sans devoir deviner où est le focus**.

## Acceptance Criteria

1. **Clavier logiciel et zone utile**  
   - **Given** un **viewport narrow** (mobile ou tablette — cohérent avec `useViewportMode` : **&lt; 1024px**)  
   - **When** un **champ de saisie pertinent** (éditeur de nœud, champ de génération, recherche shell, etc. — au minimum **un** parcours représentatif documenté en tests) reçoit le **focus** et que le **clavier logiciel** occupe une partie de l’écran (comportement agent utilisateur simulé ou API **`VisualViewport`** / resize si disponible en test)  
   - **Then** le **champ actif** et les **actions primaires** associées au même panneau (ex. boutons Sauvegarder / Générer / Valider visibles dans le contexte d’édition) restent **visibles ou atteignables par scroll** dans la **zone utile** du shell — pas de CTA définitivement hors écran **sans** scroll possible vers eux  

2. **Safe areas (encoches / indicateurs système)**  
   - **Given** un navigateur qui expose **`env(safe-area-inset-*)`** (ou équivalent documenté)  
   - **When** l’app est utilisée en **plein écran** ou sur appareil à encoche  
   - **Then** le **shell principal** (header + zone centrale / `MainLayout`) applique des **marges ou paddings** sûrs documentés en CSS (ex. `padding` / `min-height` combinant les insets) **sans** casser le layout desktop (≥ 1024px : insets souvent 0px, non-régression)

**References:** FR118, FR120, NFR-P4, `responsive-design-accessibility.md`, Epic 17 stories 17.1–17.3, 17.6.

## Tasks / Subtasks

- [x] **Task 1 : Clavier logiciel — champ focalisé et actions primaires restent utilisables en narrow** (AC: #1)  
  - [x] 🔴 Test échoue : en **narrow** (ex. `innerWidth` 375, pattern existant `Dashboard.test.tsx`), après **focus** sur un **input ou textarea** représentatif du parcours édition / génération (choisir **un** écran réaliste monté en RTL avec les mocks déjà utilisés pour le layout), une **action observable** attendue échoue : soit **`scrollIntoView`** (ou équivalent centralisé) **n’a pas été invoqué** pour le contrôle actif / ancêtre scrollable, soit la **zone scrollable** du panneau concerné **ne permet pas** d’atteindre un bouton primaire identifié par rôle / libellé — selon la stratégie retenue dans le 🟢 (le test verrouille le **comportement**, pas l’API interne si une meilleure abstraction existe).  
  - [x] 🟢 Implémenter la **détection** clavier / réduction de hauteur utile (**`window.visualViewport`** + fallbacks, ou `resize` + heuristique documentée) et le **comportement** : scroll du conteneur approprié ou padding du shell, **sans** casser desktop ni les drawers 17.3 (focus trap / overlay).  
  - [x] 🔵 Refactor : si la logique est dupliquée entre deux panneaux, **extraire** un hook du type `useVisualViewportInsets` ou `useKeepFocusedFieldVisible` ; sinon **clarifier les noms** des handlers et **réduire la duplication** dans les tests (helper RTL partagé narrow + focus).

- [x] **Task 2 : Safe areas — insets sur le shell** (AC: #2)  
  - [x] 🔴 Test échoue : le **conteneur shell** (`MainLayout` ou équivalent racine sous `Header`) **n’intègre pas** dans ses styles calculés une référence aux **safe-area insets** (assertion : chaîne de style ou règle CSS appliquée contient `env(safe-area-inset-` **ou** constantes documentées mappées vers ces env dans un module thème — adapter pour jsdom ; si env non résolu, tester au minimum que les **tokens** / **classe** attendus sont présents).  
  - [x] 🟢 Appliquer **`env(safe-area-inset-*)`** (avec **`viewport-fit=cover`** sur le **meta viewport** si requis pour iOS — voir Dev Notes) sur la **colonne principale** et/ou **header**, en préservant **100vh** vs **100dvh** / **`visualViewport`** : documenter le compromis dans un commentaire bref si nécessaire.  
  - [x] 🔵 Refactor : centraliser les insets dans **`theme/responsiveChrome.ts`** (ou petit module `safeArea.ts`) si plusieurs composants répètent les mêmes `max()` / `env()` ; sinon **chantier tests** : un seul helper d’assertion « shell a safe-area ».

### Review Follow-ups (AI)

- [x] [AI-Review][MEDIUM] Étendre le confort clavier au **chemin « recherche shell »** : l’input de `CommandPalette` (et toute modale shell sous `MainLayout` hors `data-dashboard-shell`) n’est ni dans `[data-dashboard-shell]` ni dans `[data-narrow-drawer-root]` — pas de `scrollIntoView` ni padding `visualViewport` dédié. [`useMobileShellKeyboardComfort.ts` L23–L26, `MainLayout.tsx` L53–L60, `CommandPalette.tsx` ~L285]
- [x] [AI-Review][MEDIUM] Test `scrollIntoView` 17.4 : restaurer `Element.prototype.scrollIntoView` dans un **`finally`** (ou `try/finally`) pour éviter une fuite si une assertion échoue avant le restore. [`Dashboard.test.tsx` ~L669–L747]
- [x] [AI-Review][MEDIUM] AC1 **actions primaires** : ajouter au moins une assertion **comportementale** (RTL ou E2E) que le **CTA** du panneau (ex. « Générer ») reste **atteignable** (scroll / viewport) quand `paddingBottom` inset > 0 — aujourd’hui on assert surtout le **padding** du slot drawer, pas l’accessibilité du bouton. [`Dashboard.test.tsx`, `Dashboard.tsx`]
- [x] [AI-Review][LOW] Documenter / valider **`interactive-widget=resizes-content`** (Safari, browserslist) ou retirer si la cible PO exclut Chrome-only. [`frontend/index.html`]
- [x] [AI-Review][LOW] Narrow + drawer droit ouvert : la **colonne centrale** reçoit encore `keyboardBottomInsetPx` sous le backdrop — réserve verticale possiblement **inutile** ; évaluer zéro inset centre quand un drawer couvre le canvas. [`Dashboard.tsx` — styles colonne centrale]
- [x] [AI-Review][LOW] `isFormControl` ignore **`contenteditable`** — si un éditeur riche hors `<textarea>` reçoit le focus narrow, pas de `scrollIntoView`. [`useMobileShellKeyboardComfort.ts` L4–L7]
- [x] [AI-Review][LOW] Réduire warnings **`act(...)`** sur `Dashboard` (effets `loadDefaultConfig` vs hook viewport) si le bruit devient gênant en CI. [`Dashboard.test.tsx` / effets `Dashboard.tsx`] — *résidu acceptable post-[1] (async config) ; amélioration future si CI impose silence.*

## Dev Notes

- **Architecture guardrails** : UI uniquement `frontend/` ; pas de nouvelle API backend. Conserver **`useViewportMode`** (seuils **768 / 1024**) — les correctifs **narrow** ne doivent pas dégrader **desktop**. Respecter **`MainLayout`** qui force déjà `overflowX: hidden` sur `html`/`body` : tout scroll « utile » doit rester dans les **conteneurs flex** internes (`main`, panneaux, drawers 17.3).  
- **What to reuse** : `MainLayout.tsx`, `Header`, `Dashboard`, `NarrowOverlayDrawer` / patterns 17.3 ; tokens **`responsiveChrome.ts`** pour cohérence avec 17.6. Ne pas réinventer un gestionnaire de focus global si **`react-hook-form`** / panneaux gèrent déjà le focus — **composer**.  
- **Quality bar** : Vitest + RTL ; **ESLint** 0 régression ; au moins **un** scénario **narrow** par tâche ; smoke **desktop** si un style global change. Playwright optionnel (un seul scénario mobile) si le harnais le permet sans flaky.  
- **Pièges** : **`100vh`** sur iOS avec barre d’adresse ; **`visualViewport`** null sur certains environnements de test — prévoir **garde** et **no-op** propre. Ne pas casser **scroll lock** des modales (17.3).  
- **Relation 17.4 vs 17.5** : PWA / manifest — **hors scope** ici sauf **`viewport-fit`** dans `index.html` si strictement nécessaire aux safe areas.  
- **Refactor bar** : défauts dev-story (~300 lignes / fichier touché par tâche, ~60 lignes / fonction).

### Project Structure Notes

- Ancrages probables : `frontend/index.html` (meta viewport), `frontend/src/components/layout/MainLayout.tsx`, `frontend/src/components/layout/Dashboard.tsx`, éventuellement `Header.tsx`, panneaux avec formulaires lourds (`NodeEditorPanel`, génération).  
- Spec UX : `_bmad-output/planning-artifacts/ux-design-specification/responsive-design-accessibility.md`.

### References

- [Source: `_bmad-output/planning-artifacts/epics/epic-17.md` — Story 17.4]  
- [Source: `_bmad-output/planning-artifacts/ux-design-specification/responsive-design-accessibility.md` — Mobile / testing]  
- [Source: `_bmad-output/project-context.md` — React / Vitest]  
- [Source: `_bmad-output/implementation-artifacts/17-3-…-fr120.md` — Drawers, focus, tests narrow]  
- [Source: `_bmad-output/implementation-artifacts/17-6-…-fr118.md` — `responsiveChrome`, densité]

## Technical Requirements

- **APIs navigateur** : `window.visualViewport` (écoute `resize` / `scroll`) ; `env(safe-area-inset-*)` en CSS ; optionnel **`interactive-widget=resizes-content`** sur meta viewport (Chrome) — évaluer compatibilité et documenter le fallback.  
- **TypeScript** : garder les gardes `typeof window !== 'undefined'` si hooks sensibles au SSR/tests.  
- **Accessibilité** : ne pas retirer le focus visible ; ne pas casser **Tab** dans les drawers.

## Architecture Compliance

- Cohérent migration web : pas de logique métier dans le layout hors orchestration UI.  
- Epic 17 : 17.1–17.3 et 17.6 sont des **prérequis** ; cette story **renforce** le confort réel appareil sans remplacer les breakpoints existants.

## Library / Framework Requirements

- Pas de dépendance **obligatoire** ; si utilitaire tiers pour clavier virtuel, **justifier** (poids, maintenance). Préférence **Web API** natives.

## File Structure Requirements

- Modifications sous `frontend/src/components/layout/`, `frontend/src/hooks/` si hook dédié, `frontend/src/theme/` pour tokens safe-area, `frontend/index.html` si meta viewport.

## Testing Requirements

- **Vitest** : `Object.defineProperty(window, 'innerWidth', …)` comme les tests `Dashboard` existants ; mocker **`visualViewport`** si nécessaire (`{ height, width, offsetTop, addEventListener, removeEventListener }`).  
- Vérifier **non-régression** : suite `Dashboard.test.tsx` + tests FR119 / layout déjà verts après changement.

## Previous Story Intelligence (17.6)

- **Tokens & doc** : `responsiveChrome.ts`, `useNarrowInlineSize` — réutiliser l’esprit « mesure conteneur / jsdom » pour ne pas sur-promettre des APIs absentes en test.  
- **Tests** : `QueryClientProvider`, `BrowserRouter`, warnings React Router v7 acceptés en stderr tant que les assertions passent.

## Previous Story Intelligence (17.3)

- Drawers **`role="dialog"`**, **Escape**, overlay — toute stratégie « scroll into view » doit **cohabiter** avec le focus trap (ne pas scroller le body derrière un modal de façon incohérente).  
- Éviter les **overlays persistants** après changement d’onglet — même discipline quand le clavier se ferme.

## Git Intelligence Summary

- Activité récente Epic 17 : `Dashboard`, `MainLayout`, `Tabs`, `responsiveChrome`, `NarrowOverlayDrawer` — **pull / rebase** avant dev ; conflits possibles sur `Dashboard.tsx`.

## Latest Technical Notes

- **MDN** : [Visual Viewport API](https://developer.mozilla.org/en-US/docs/Web/API/Visual_Viewport_API) — hauteur utile quand la barre d’adresse / clavier change.  
- **Safe area** : [env()](https://developer.mozilla.org/en-US/docs/Web/CSS/env) ; iOS souvent **`viewport-fit=cover`** sur la balise meta viewport pour activer les insets.  
- **Meta viewport** : attribut `interactive-widget` (Chrome) — à valider sur la cible navigateurs du projet (browserslist).

## Project Context Reference

- `_bmad-output/project-context.md` — React 18, Vitest, ESLint zéro warning.

## Dev Agent Record

### Agent Model Used

Composer (agent dev Amelia / dev-story)

### Debug Log References

- Vitest jsdom : `env()` en inline React supprimé du DOM → safe-area via `:root` + `var(--dg-shell-*)` dans `App.css`.
- `scrollIntoView` absent de `HTMLElement.prototype` en jsdom → mock sur `Element.prototype` dans le test 17.4.

### Completion Notes List

- **AC1** : `useVisualViewportBottomInsetPx` + `useMobileShellKeyboardComfort` (inset Dashboard) ; **`useShellKeyboardFocusScroller`** monté par **`MainLayout`** (narrow) — `focusin` sur `data-dashboard-shell`, `data-narrow-drawer-root`, **`data-shell-keyboard-zone`** (`CommandPalette`) ; `contenteditable` pris en charge.
- **AC1 suite [1]** : `MainLayout` passe `keyboardBottomInsetPx` à `CommandPalette` ; colonne centrale **sans** inset quand un drawer narrow est ouvert ; tests `try/finally` + CTA « Générer » dans slot paddé ; `CommandPalette` `scrollIntoView?.` pour jsdom.
- **AC2** : `viewport-fit=cover` + `interactive-widget=resizes-content` dans `index.html` ; variables CSS safe-area sur `:root` (`App.css`) ; `MainLayout` avec `var(--dg-shell-safe-*)` + `data-testid="main-layout-root"`.
- **🔵 Task 1 refactor** : `shellKeyboardInsetStyle` — avant duplication `paddingBottom` + `boxSizing` sur deux blocs → après `useMemo` unique réutilisé par spread.
- **🔵 Task 2 refactor** : `shellSafeAreaCssVars` dans `responsiveChrome.ts` + `env()` uniquement dans feuille CSS (évite rejet jsdom sur inline) ; test assert `var(--dg-shell-safe-*)` sur l’attribut `style`.

### File List

- `frontend/index.html`
- `frontend/src/App.css`
- `frontend/src/theme/responsiveChrome.ts`
- `frontend/src/hooks/useVisualViewportBottomInsetPx.ts`
- `frontend/src/hooks/useVisualViewportBottomInsetPx.test.ts`
- `frontend/src/hooks/useMobileShellKeyboardComfort.ts`
- `frontend/src/hooks/useShellKeyboardFocusScroller.ts`
- `frontend/src/components/layout/MainLayout.tsx`
- `frontend/src/components/shared/CommandPalette.tsx`
- `frontend/src/components/shared/CommandPalette.keyboard.test.tsx`
- `frontend/src/components/layout/MainLayout.responsive.test.tsx`
- `frontend/src/components/layout/Dashboard.tsx`
- `frontend/src/components/layout/Dashboard.test.tsx`
- `frontend/src/components/layout/NarrowOverlayDrawer.tsx`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
- `_bmad-output/implementation-artifacts/17-4-clavier-logiciel-safe-areas-renfort-mobile-fr118-120.md`

## Change Log

- 2026-04-08 : Implémentation 17.4 (visualViewport + safe-area shell) ; Vitest `npm run test:ci` vert (869 tests).
- 2026-04-08 : Code review (Amelia) — **Changes Requested** ; statut → **in-progress** ; follow-ups sous « Senior Developer Review (AI) » ; `sprint-status.yaml` synchronisé.
- 2026-04-08 : Correctifs **[1]** post-review — palette + `useShellKeyboardFocusScroller`, tests `finally` / CTA / `CommandPalette.keyboard.test`, inset centre conditionnel, `contenteditable`, commentaire `interactive-widget` ; `npm run test:ci` **871** tests OK.

---

**Story completion status**

- **Status** : **done**  
- **Note** : Suite **[1]** appliquée ; lint + Vitest CI verts.

---

## Senior Developer Review (AI)

**Reviewer :** Amelia (Dev agent, workflow code-review)  
**Date :** 2026-04-08  
**Décision initiale :** **Changes Requested** — voir tableau historique ci-dessous (résolu par **[1]**).

**Git vs File List :** les chemins `frontend/src/hooks/useVisualViewport*.ts` apparaissent en **`??`** non commités au moment du review — aligner `git add` + commit avec la story pour traçabilité (tolérance branche : pas d’écart bloquant si tout est versionné avant merge).

**Résumé adversarial (extraits) :**

| Sévérité | Constat |
|----------|---------|
| **MEDIUM** | AC1 cite la **recherche shell** : le focus dans **`CommandPalette`** n’est pas sous `data-dashboard-shell` ni `data-narrow-drawer-root` → pas de `scrollIntoView` automatique ; pas de padding bas dédié au conteneur de la palette. |
| **MEDIUM** | Le test 17.4 `scrollIntoView` **ne restaure pas** le prototype si une assertion échoue avant la fin du test → pollution inter-tests. |
| **MEDIUM** | AC1 exige champ **et** CTA primaires utilisables : les tests prouvent surtout **`paddingBottom`** sur `narrow-drawer-scroll-slot`, pas qu’un bouton « Générer » reste scrollable/visible. |
| **LOW** | `interactive-widget=resizes-content` sans validation **Safari** / matrice navigateurs (story disait « évaluer »). |
| **LOW** | `keyboardBottomInsetPx` sur la **colonne centrale** alors qu’un **drawer** couvre l’écran — possible gaspillage d’espace sous overlay. |
| **LOW** | Pas de prise en charge **`contenteditable`** dans `isFormControl`. |
| **LOW** | Warnings React **`act`** récurrents sur scénarios narrow `Dashboard` (bruit, pas forcément régression 17.4). |

**Action items :** voir **Tasks → Review Follow-ups (AI)** ci-dessus (tous cochés post-**[1]**).

---

## Senior Developer Review (AI) — passe 2

**Reviewer :** Amelia (Dev)  
**Date :** 2026-04-08  
**Décision :** **Approuvé** — follow-ups MEDIUM/LOW traités ou documentés (act résiduel acceptable) ; preuve **`npm run lint`** + **`npm run test:ci`** → **871** tests OK.
