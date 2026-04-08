# Story 17.6: Typographie et densité adaptatives (panneaux / onglets étroits) (FR118 renfort)

Status: done

<!-- validate-create-story (checklist qualité) : optionnel avant dev-story. Priorité PO : **17.6 avant 17.4** (sprint). -->

## Story

As a **utilisateur qui réduit la largeur des panneaux ou travaille sur une colonne centrale étroite**,  
I want **que la taille du texte, des boutons et des onglets reste proportionnée à l’espace disponible**,  
so that **je ne me retrouve pas avec des libellés disproportionnés, tronqués de façon illisible ou des contrôles « hors norme » par rapport au conteneur**.

## Acceptance Criteria

1. **Échelle typographique et densité dans colonnes étroites**  
   - **Given** une **largeur de conteneur réduite** (colonne centrale du `Dashboard` après redimensionnement des `ResizablePanels`, ou viewport mobile / tablette déjà couvert par 17.1–17.3)  
   - **When** les **onglets segmentés** du shell central (et toute barre d’onglets équivalente dans le périmètre Dev Notes) et les **boutons chrome** associés sont visibles  
   - **Then** les **font-size**, **padding** et **gap** des contrôles concernés **diminuent** dans des **bornes documentées** en code (plancher lisibilité ≥ équivalent **12px** pour le libellé d’onglet segmenté, sauf variante « caption » nommée)  
   - **And** les **cibles tactiles 44×44px** (FR119 / story 17.2) **restent respectées** là où le périmètre tactile / narrow s’applique — **pas de régression** mesurable sur les tests existants FR119

2. **Libellés longs (emojis + texte)**  
   - **Given** des libellés d’onglets longs  
   - **When** la largeur utile du rail d’onglets est faible  
   - **Then** le comportement est **contrôlé et verrouillé par test** : **troncature** avec attribut **`title`** reprenant le libellé complet (accessible au survol / lecteur d’écran selon support), **sans** chevauchement illisible entre onglets ni **scroll horizontal sur le document entier**

3. **Non-régression desktop confortable**  
   - **Given** viewport **≥ 1024px** et largeur de **colonne centrale** au-dessus d’un **seuil confort** défini en implémentation (ex. ≥ 480px — à ajuster selon maquette)  
   - **When** j’utilise l’app en bureau sans contraindre extrêmement les panneaux  
   - **Then** les tailles d’onglets segmentés restent **visuellement alignées** sur l’intention actuelle (pas de micro-texte systématique)

**References:** FR118 (renfort), NFR-P4, `responsive-design-accessibility.md` (typographie & densité), stories 17.1–17.3.

## Tasks / Subtasks

- [x] **Task 1 : Échelle fluide pour `Tabs` variant `segmented` (Dashboard central)** (AC: #1, #3)  
  - [x] 🔴 Test échoue : en RTL, conteneur d’onglets **segmentés** à **largeur imposée** (ex. wrapper 320px ou 400px) : le **font-size** calculé ou la **hauteur/padding** du bouton d’onglet est **strictement inférieur** à celui observé pour un conteneur **large** (ex. 720px) — **et** le font-size reste **≥** la valeur plancher fixée dans le test (équivalent 12px en `rem`).  
  - [x] 🟢 Implémenter l’échelle dans `Tabs` (`variant === 'segmented'`) via **`useNarrowInlineSize` + tokens** (`responsiveChrome`) — **sans** modifier le variant `underline` sauf alignement évident non risqué (voir Dev Notes / Technical Requirements).  
  - [x] 🔵 Refactor : extraire les **constantes de typographie segmentée** (plancher/plafond `rem`, breakpoints `@container`) dans un **module ou `theme` nommé** (`responsiveTabTypography` ou clés `theme.typography.tabsSegmented`) pour éviter les nombres magiques dispersés ; renommer les tests « narrow vs wide » pour refléter le **comportement utilisateur** (colonne étroite vs confortable).

- [x] **Task 2 : Rails / en-têtes de panneau `Dashboard` en colonne étroite** (AC: #1)  
  - [x] 🔴 Test échoue : avec **viewport desktop** (1024px) mais **colonne centrale visuellement étroite** simulée (même technique de conteneur parent qu’en Task 1, ou mock largeur panneau si hook dédié), au moins **un** des éléments suivants montre une **réduction mesurable** de `fontSize` ou `padding` par rapport au mode large : **label du `PanelExpandButton`** (texte vertical) **ou** titre d’en-tête de panneau (GDD / Détails) — dans les bornes documentées, **sans** casser `TOUCH_TARGET_MIN_PX` sur le **bouton** rail.  
  - [x] 🟢 Ajuster `Dashboard.tsx` (et extraits locaux si créés) en **réutilisant** les mêmes **tokens + seuil** que Task 1 (`useNarrowInlineSize`, `responsiveChrome`) lorsque le conteneur est partageable.  
  - [x] 🔵 Refactor : si deux blocs CSS répètent les mêmes seuils `@container`, **factoriser** en **une** règle ou hook `useSegmentedChromeDensity` ; sinon **réduire la duplication** entre en-tête gauche/droite uniquement si le code le montre au 🔵.

- [x] **Task 3 : Libellés longs sur onglets centraux** (AC: #2)  
  - [x] 🔴 Test échoue : `Tabs` segmenté avec un tab **label** volontairement long ; conteneur **étroit** : le nœud visible porte un **`title`** égal au libellé complet **ou** le libellé est **tronqué** avec ellipse — **et** `document.documentElement.scrollWidth <= document.documentElement.clientWidth` (pas de scroll horizontal global).  
  - [x] 🟢 Implémenter troncature + `title` sur les boutons d’onglet segmentés (comportement produit **figé**).  
  - [x] 🔵 Refactor : si la logique « label affiché vs title » est dupliquée, extraire un petit helper **`formatTabLabelForDisplay(label, maxChars?)`** ou composant **`SegmentedTabLabel`** ; sinon améliorer **uniquement** la **lisibilité des tests** (helpers RTL partagés avec Task 1).

## Dev Notes

- **Architecture guardrails** : pas de logique métier dans l’API ; respect **React 18** / patterns existants ; **FR119** : `minHeight` / `minWidth` **≥ 44px** sur les contrôles concernés par le tactile — la **réduction** porte surtout sur **font**, **padding interne** et **gap**, pas sur la **boîte d’appui** minimale.  
- **Largeur viewport ≠ largeur colonne** : un utilisateur peut être en **desktop** avec une **colonne centrale très étroite** (`ResizablePanels`) — les **media queries seules** sont **insuffisantes** ; la mesure s’appuie sur **`useNarrowInlineSize`** (`ResizeObserver` + `readLayoutWidthPx`) pour un comportement identique en navigateur et sous Vitest ; le rail peut exposer `container-type` pour une future couche CSS `@container` si besoin.  
- **What to reuse** : `theme`, `TOUCH_TARGET_MIN_PX`, `Tabs.tsx`, `Dashboard.tsx`, `NarrowOverlayDrawer` / en-têtes drawer (story 17.3) — **aligner** les tailles d’en-tête si les **tokens** sont partagés pour cohérence visuelle.  
- **Quality bar** : Vitest + RTL ; assertions **comportementales** (styles calculés ou `getComputedStyle`) ; pas de tests vacuous ; ESLint 0 régression.  
- **Périmètre** : **pas** refonte de tout le repo ; **hors scope** sauf décision explicite : `GraphEditorHeader`, `ContextSelector` profond — mentionner en commentaire si report nécessaire.  
- **Refactor bar** : défauts dev-story (~300 lignes / fichier touché par tâche, ~60 lignes / fonction) ; exception nommée dans Dev Agent Record si besoin.

### Project Structure Notes

- Fichiers attendus : `frontend/src/components/shared/Tabs.tsx`, `frontend/src/components/layout/Dashboard.tsx`, éventuellement `frontend/src/theme.ts` ou nouveau `frontend/src/theme/responsiveChrome.ts`.  
- Tests : `Tabs.test.tsx` si existant, sinon création ; tests `Dashboard` existants — étendre sans dupliquer les mocks stores.

### References

- [Source: `_bmad-output/planning-artifacts/epics/epic-17.md` — Story 17.6]  
- [Source: `_bmad-output/planning-artifacts/ux-design-specification/responsive-design-accessibility.md` — Typographie & densité]  
- [Source: `frontend/src/components/shared/Tabs.tsx` — variant segmented]  
- [Source: story `17-3-…` — drawers, `NarrowOverlayDrawer`]

## Technical Requirements

- **Mesure conteneur** : **`useNarrowInlineSize` + `ResizeObserver`** (voir `frontend/src/hooks/useNarrowInlineSize.ts` et doc en tête de `theme/responsiveChrome.ts`) — choix retenu plutôt que `@container` seul pour fiabilité jsdom/Vitest. Le rail segmenté peut déclarer `container-type: inline-size` pour une évolution CSS ultérieure.  
- **Typographie** : préférer **`rem`** pour le plancher 12px (`0.75rem` si `root` 16px) ; documenter si `root` diffère.  
- **Accessibilité** : `title` sur bouton tronqué ; ne pas retirer le texte visible utile aux seules icônes sans décision PO.

## Architecture Compliance

- UI uniquement dans `frontend/` ; cohérent Epic 17 ; pas de duplication de la logique `useViewportMode` pour remplacer les container queries sans raison.

## Library / Framework Requirements

- Pas de nouvelle dépendance **obligatoire** ; pas besoin de librairie container-query : mesure via API navigateur + hook partagé.

## File Structure Requirements

- Petits modules sous `frontend/src/` ; respect des alias `@/` si utilisés ailleurs.

## Testing Requirements

- Vitest : **au moins** un test **Tabs** (segmented narrow vs wide) + **un** test **Dashboard** ou intégration ciblée pour le chrome.  
- Vérifier **non-régression** : exécuter les tests **layout** / **FR119** touchant `Dashboard` + `Tabs` après changement.

## Previous Story Intelligence (17.3)

- Drawers **narrow** : en-têtes `NarrowOverlayDrawer` avec titres **0.9rem** — si des **tokens** unifiés sont introduits, **harmoniser** ou documenter l’écart volontaire.  
- **Vitest** : `Dashboard.test.tsx` dans la suite par défaut ; patterns `innerWidth` via `Object.defineProperty`.  
- **Review 17.3** : `body overflow` + focus modal — ne pas **casser** le scroll lock lors de l’ajout de styles sur les onglets.

## Git Intelligence Summary

- Travail récent Epic 17 sur `Dashboard.tsx`, `NarrowOverlayDrawer.tsx`, `Tabs.tsx` (FR119 touch targets) — **tirer une branche à jour** avant implémentation.

## Latest Technical Notes

- **Implémentation actuelle** : mesure conteneur via **`ResizeObserver`** (`useNarrowInlineSize`) — voir `responsiveChrome.ts` (entête).  
- **Option future** : [CSS Container Queries](https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_containment/Container_queries) / `clamp()` + `cqw` si la stack tests + navigateurs le permet sans régression jsdom.

## Project Context Reference

- `_bmad-output/project-context.md` — React 18, Vitest, ESLint zéro warning.

## Dev Agent Record

### Agent Model Used

Composer (agent dev-story / Amelia)

### Debug Log References

- jsdom : `offsetWidth` souvent 0 sur flex internes — `readLayoutWidthPx()` déduit largeur depuis `style.width` en `px` / `%` pour les tests et le runtime cohérent.

### Completion Notes List

- **Task 1** : `Tabs` segmenté — `useNarrowInlineSize` sur la racine du composant, tokens `segmentedTabTypography` + seuil `SEGMENTED_CHROME_COMFORT_MIN_WIDTH_PX` dans `theme/responsiveChrome.ts` ; rail avec `containerType: 'inline-size'` ; boutons `flex: 1 1 0` + ellipsis interne ; FR119 conservé (`fr119-touch.chrome.test.tsx` vert).
- **Task 2** : `Dashboard` — même seuil via `useNarrowInlineSize(..., { measureParentClientWidth: true })` sur la colonne centrale ; titres GDD / Détails en `panelHeaderTitleTypography` ; test intégration conteneur 1400 vs 900 px sous desktop 1024.
- **Task 3** : `title={tab.label}` + composant `SegmentedTabLabelText` ; test scroll document + title.

**🔵 Refactor Task 1** : avant → styles segmentés en dur dans `Tabs.tsx` ; après → `frontend/src/theme/responsiveChrome.ts` (`segmentedTabTypography`, constante de seuil) + describe tests « colonne étroite vs confortable ».

**🔵 Refactor Task 2** : avant → titres `0.9rem` fixes ; après → hook partagé `useNarrowInlineSize` + `readLayoutWidthPx` (pas de second hook ad hoc).

**🔵 Refactor Task 3** : avant → `{tab.label}` brut dans le bouton ; après → `<SegmentedTabLabelText text={tab.label} />` + `title` sur le `<button>`.

**Post code-review [1] (2026-04-08)** : `responsiveChrome` — doc explicite ResizeObserver vs `@container` ; `panelExpandRailCaptionTypography` + prop `railCaptionFontRem` sur `PanelExpandButton` ; `Dashboard.test` — cas AC2 montage `Dashboard` 720px desktop ; `Tabs.test` — wrapper long label sans `overflow:hidden` forcé ; `git checkout` sur `tmp/vitest-full.txt` et `data/cost_budgets.json` si modifications accidentelles.

### File List

- `frontend/src/theme/responsiveChrome.ts` (tokens 17.6 + doc stratégie ResizeObserver)
- `frontend/src/hooks/useNarrowInlineSize.ts`
- `frontend/src/components/shared/Tabs.tsx`
- `frontend/src/components/shared/Tabs.test.tsx`
- `frontend/src/components/layout/Dashboard.tsx`
- `frontend/src/components/layout/Dashboard.test.tsx`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
- `_bmad-output/implementation-artifacts/17-6-typographie-densite-adaptive-panneaux-onglets-fr118.md`

**Hors périmètre strict 17.6 (autres epics / branches)** : fichiers graphe, liste Unity, génération, vitest config, etc. — suivre leurs stories respectives ; non requis pour clore 17.6.

## Change Log

- **2026-04-08** : Implémentation 17.6 (densité segmentée, titres panneau, libellés longs) + tests Vitest + lint frontend vert sur périmètre exécuté.
- **2026-04-08** : Code review (Amelia) — Changes Requested ; statut → in-progress ; follow-ups consignés sous « Senior Developer Review (AI) » ; `sprint-status.yaml` synchronisé.
- **2026-04-08** : Suite [1] post-review — doc ResizeObserver vs `@container`, tokens `panelExpandRailCaptionTypography` + `PanelExpandButton`, test AC2 `Dashboard`, retrait `overflow:hidden` artificiel dans `Tabs.test`, revert bruit `tmp/` + `cost_budgets` ; lint + Vitest ciblé vert.

---

**Story completion status**

- **Status** : done (correctifs review [1] appliqués ; lint + Vitest ciblé OK)  
- **Note** : `npm run lint` + `vitest` Tabs + Dashboard + FR119 exécutés verts après suite [1].

---

## Senior Developer Review (AI)

**Reviewer :** Amelia (Dev agent, workflow code-review)  
**Date :** 2026-04-08  
**Décision initiale :** **Changes Requested** — résolue par correctifs [1] (2026-04-08) : doc technique, test AC2 intégration, caption rail, File List clarifiée.

**Preuves exécutées :** `npx vitest run src/__tests__/fr119-touch.chrome.test.tsx` → 5/5 OK (non-régression FR119 touch chrome).

**Résumé :** Implémentation crédible pour 17.6 (`responsiveChrome.ts`, `useNarrowInlineSize`, `Tabs` segmenté, titres panneau `Dashboard` + tests). Voir constats détaillés dans la réponse agent (écarts `@container` vs ResizeObserver, test scroll AC2, `PanelExpandButton` 0.58rem, File List vs git).

### Review Follow-ups (AI)

- [x] [AI-Review][MEDIUM] Aligner story / Dev Notes / implémentation : soit adopter des règles `@container` réelles, soit documenter officiellement `useNarrowInlineSize` + `ResizeObserver` comme stratégie (retirer ou nuancer l’exigence `@container` dans Technical Requirements). [`frontend/src/components/shared/Tabs.tsx`, `frontend/src/theme/responsiveChrome.ts`, story § Technical Requirements]
- [x] [AI-Review][MEDIUM] Renforcer le test AC2 : assertion scroll document dans un montage plus proche du `Dashboard` / colonne centrale réelle, ou E2E ciblé — éviter dépendre uniquement d’un wrapper `overflow: hidden`. [`frontend/src/components/shared/Tabs.test.tsx`]
- [x] [AI-Review][MEDIUM] Clarifier produit / accessibilité : `PanelExpandButton` label vertical `0.58rem` — documenter exception « caption » ou harmoniser avec plancher lisibilité. [`frontend/src/components/layout/Dashboard.tsx` ~L214-217]
- [x] [AI-Review][LOW] Mettre à jour **File List** ou créer lien vers autres stories pour fichiers `git` hors liste (génération, graphe, vitest, coûts, tmp). [story § File List]
- [x] [AI-Review][LOW] Retirer `tmp/vitest-full.txt` et éviter commits accidentels sur `data/cost_budgets.json` sauf intention métier.

---

## Senior Developer Review (AI) — passe 2

**Reviewer :** Amelia (Dev)  
**Date :** 2026-04-08  
**Story :** `17-6-typographie-densite-adaptive-panneaux-onglets-fr118.md` (statut fichier : **done**)  
**Décision :** **Approuvé avec réserves mineures** — pas de régression bloquante ; AC alignés code + tests ; preuve Vitest : `Tabs.test.tsx` + `Dashboard.test.tsx` + `fr119-touch.chrome.test.tsx` → **29/29** verts (exécution locale agent).

### Constats (adversarial, ≥3)

1. **MOYEN (livraison)** : si `git status` montre encore la story en **`??` non trackée**, **commit** `_bmad-output/implementation-artifacts/17-6-typographie-densite-adaptive-panneaux-onglets-fr118.md` + `sprint-status.yaml` avec le code — sinon traçabilité BMAD cassée.  
2. **FAIBLE** : test AC2 `Dashboard` (`720px` outer) ne force pas la colonne centrale sous **480px** ; utile comme fumée shell, **pas** le pire cas « rail le plus étroit » — considérer un scénario **760px** (comme test titres) ou E2E si exigence PO durcit.  
3. **FAIBLE** : **aucun test RTL** sur `railCaptionFontRem` (`PanelExpandButton`) narrow vs comfortable — régression typo possible sans échec CI.  
4. **FAIBLE** : tâches 🟢 Task 1/2 mentionnaient encore « container query » / `@container` ; **corrigé** dans cette passe pour coller à `Technical Requirements` + code.  
5. **INFO** : fichiers `git` hors File List 17.6 (Unity, GraphEditor, vitest…) — **hors périmètre** story ; pas compté comme manque 17.6 (tolérance branche).

### Suivi proposé (optionnel)

- [ ] Committer story + artefacts sprint si non versionnés.  
- [ ] (Option) test RTL `PanelExpandButton` caption narrow vs wide colonne.  
- [ ] (Option) AC2 sous contrainte largeur type **760px** pour coller au seuil narrow.
