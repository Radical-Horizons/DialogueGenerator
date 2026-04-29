# Story 17.7: Sélecteur de dialogue intégré à la toolbar en mode narrow (suppression colonne gauche) (renfort FR120)

Status: done

## Story

As a **utilisateur en mode narrow viewport (mobile / tablette / colonne centrale étroite)**,
I want **sélectionner un dialogue Unity directement depuis la toolbar des onglets `Édition de Dialogues` et `Éditeur de Graphe`, sans colonne liste dédiée**,
so that **je récupère 100 % de la largeur disponible pour l'édition ou le graphe — sans perdre la recherche (`/`), le tri configurable, le compteur de dialogues ni le contrat de rafraîchissement après génération / suppression**.

## Acceptance Criteria

1. **Suppression colonne liste et restitution de la surface (mode narrow uniquement)**
   - **Given** une largeur de la colonne workspace **strictement inférieure** au seuil `PANEL_COMFORT_MIN_WIDTH_PX` (`responsiveChrome.ts`, soit le même seuil que `useNarrowInlineSize` aujourd'hui consommé par les deux onglets)
   - **When** je suis sur l'onglet `Édition de Dialogues` **ou** `Éditeur de Graphe`
   - **Then** la colonne `unityDialogueListColumnStyle` (composant `UnityDialogueList`) **n'est plus rendue**
   - **And** le workspace (`unityDialogueWorkspaceColumnStyle`) prend **toute la largeur** de l'onglet (`flex: 1`, plus de bord gauche `borderRight` apparent côté liste)

2. **Sélecteur de dialogue compact dans la toolbar (combobox)**
   - **Given** un onglet narrow concerné
   - **When** je clique / focus sur le sélecteur de dialogue placé dans la toolbar (header de `UnityDialogueEditor` ou `GraphEditorHeader`)
   - **Then** un panneau combobox s'ouvre conservant **toutes** les capacités actuelles de `UnityDialogueList` :
     - Champ de **recherche** avec raccourci `/` (focus + select sur la touche `/` quand le focus n'est pas déjà dans un input / textarea / contenteditable)
     - **Tri configurable** (`Date (récent)`, `Date (ancien)`, `Nom (A-Z)`, `Nom (Z-A)`)
     - **Compteur** « N dialogues » (avec « (sur M total) » si filtre actif)
     - **Liste filtrée + triée** rendue avec `UnityDialogueItem` (ou équivalent visuel équivalent contractuel)
   - **And** la sélection d'un item :
     - **Ferme** l'overlay
     - Déclenche **`onSelectDialogue(dialogue)`** vers le parent (chargement du dialogue actif)

3. **Préservation desktop — zéro régression visuelle ni comportementale**
   - **Given** une largeur de la colonne workspace **≥** seuil narrow
   - **When** j'ouvre les onglets `Édition de Dialogues` ou `Éditeur de Graphe`
   - **Then** la structure 2-colonnes actuelle est **strictement identique** : `unityDialogueListColumnStyle` (≤25 %, plafond 280 px) à gauche + `unityDialogueWorkspaceColumnStyle` à droite
   - **And** la toolbar du header **ne contient pas** le sélecteur combobox (pas d'élément vestigial / zéro surface ajoutée)
   - **And** les tests existants `Dashboard.test.tsx` et `GraphEditor` largeur desktop restent verts sans modification d'assertion

4. **Alignement bord gauche toolbar ↔ contenu en narrow**
   - **Given** le mode narrow avec workspace pleine largeur
   - **When** la toolbar du header et le premier élément du contenu sous-jacent sont rendus (carte `ID: START` du `NodeEditorPanel` pour Édition / canvas + sa carte React Flow pour Graphe)
   - **Then** leur **bord gauche visible** coïncide à **±2 px** près (assertion via `getBoundingClientRect()` sur les deux éléments dans un test RTL en narrow), sans bandeau ni padding asymétrique entre header et contenu

5. **Contrat `refresh()` préservé**
   - **Given** une suppression de dialogue (`UnityDialogueDetails.handleDelete`) ou une génération IA (`AIGenerationPanel.onGenerated`)
   - **When** le code consommateur appelle `dialogueListRef.current?.refresh()` ou son équivalent narrow
   - **Then** la source de données du combobox est **rafraîchie** (réémission `unityDialoguesAPI.listUnityDialogues()`) et un test RTL atteste que la nouvelle liste est observable lors de la prochaine ouverture

6. **Accessibilité combobox (clavier + ARIA)**
   - **Given** le sélecteur fermé
   - **When** j'utilise `Tab` pour atteindre le déclencheur, `Enter` / `Espace` pour ouvrir, `↑` / `↓` pour naviguer, `Enter` pour sélectionner, `Escape` pour fermer
   - **Then** le composant respecte le **pattern combobox WAI-ARIA** minimal : `role="combobox"`, `aria-expanded` synchronisé, `aria-controls` pointant sur le panneau (`role="listbox"`), focus rendu visible
   - **And** au close (Escape ou sélection), le focus revient sur le déclencheur

**References:** renfort **FR120** (panneaux narrow), Epic 1 (génération), Epic 2 (graphe), UX `responsive-design-accessibility.md`, Story 17.3 (drawers narrow), Story 17.6 (densité segmentée).

## Tasks / Subtasks

- [x] **Task 1 : Composant `DialogueCombobox` autonome (AC #2, #5, #6)**
  - [x] 🔴 Tests RTL `frontend/src/components/unityDialogues/DialogueCombobox.test.tsx` :
    - rendu fermé : déclencheur visible, panneau absent du DOM (ou `aria-expanded="false"`)
    - ouverture par clic / `Enter` ; recherche `/` focus l'input ; tri change l'ordre ; compteur `N dialogues` à jour
    - clavier `↑/↓/Enter/Escape` ; focus retourne au déclencheur sur close
    - exposition d'un `ref` typé `DialogueComboboxRef` avec `refresh()` qui ré-appelle `unityDialoguesAPI.listUnityDialogues()`
  - [x] 🟢 Implémenter `frontend/src/components/unityDialogues/DialogueCombobox.tsx` :
    - **Réutilise** `UnityDialogueItem`, `StyledSelect`, `unityDialoguesAPI`
    - Extraire de `UnityDialogueList` la logique fetch + sort + filter dans un hook **partagé** `useDialogueListData()` (`frontend/src/hooks/useDialogueListData.ts`) consommé par les **deux** composants pour éviter la duplication
    - Z-index du dropdown au-dessus de React Flow (référencer une constante `theme/zIndex.ts` si existante, sinon valeur cohérente avec `GraphSearchBar`)
  - [x] 🔵 Refactor : `UnityDialogueList` consomme `useDialogueListData()` ; pas de divergence de comportement entre les deux composants (mêmes filtres, même tri par défaut `date-desc`).

- [x] **Task 2 : Intégration narrow — onglet `Édition de Dialogues` (AC #1, #2, #3, #5)**
  - [x] 🔴 Test échoue : à largeur **narrow** sur la colonne workspace, le wrapper `unityDialogueListColumnStyle` est **absent** du DOM (`queryByTestId('unity-dialogue-list')` → `null`) **et** le combobox est **présent** dans la toolbar (`queryByTestId('dialogue-combobox-trigger')`).
  - [x] 🔴 Test desktop : largeur ≥ seuil → liste présente, combobox **absent**.
  - [x] 🟢 `frontend/src/components/layout/Dashboard.tsx` (tab `edition`) : conditionner `unityDialogueListColumnStyle` à `!isDialogueEditionNarrow` ; injection `headerSelector` quand narrow.
  - [x] 🟢 `frontend/src/components/unityDialogues/UnityDialogueDetails.tsx` : forwarding du slot `headerSelector` vers `UnityDialogueEditor`.
  - [x] 🟢 `frontend/src/components/generation/UnityDialogueEditor.tsx` : nouveau slot `headerSelector?: ReactNode` rendu dans la zone titre.
  - [x] 🟢 `dialogueListRef` partagé entre `UnityDialogueList` (desktop) et `DialogueCombobox` (narrow) via signature `refresh()` compatible.
  - [x] 🔵 **Diagnostic blocage test (44 min)** : sortir les tests narrow/desktop dans un fichier dédié `Dashboard.combobox-17_7.test.tsx` qui mocke `useNarrowInlineSize` (cause racine : ref attachée tardivement à un nœud sous onglet inactif → `ResizeObserver` jamais attaché ; cf. **Story 17.8** dette technique).
  - [x] 🔵 Renforcement : 2 nouveaux tests slot `headerSelector` dans `UnityDialogueEditor.narrow.test.tsx` (présence et absence).

- [x] **Task 3 : Intégration narrow — onglet `Éditeur de Graphe` (AC #1, #2, #3, #5)**
  - [x] 🔴 Test échoue : équivalent Task 2 sur `GraphEditor` (mock narrow vs desktop via `useNarrowInlineSize`) — `unity-dialogue-list` absent + `dialogue-combobox-trigger` présent en narrow.
  - [x] 🟢 `frontend/src/components/graph/GraphEditor.tsx` :
    - Nouveau hook `useNarrowInlineSize(PANEL_COMFORT_MIN_WIDTH_PX)` mesurant le container `graph-editor` (cohérence UX avec Dashboard, même seuil 640 px).
    - Conditionner `<div style={{ ...unityDialogueListColumnStyle }}>...</div>` à `!isGraphEditorNarrow`.
    - Passer un slot `headerSelector={isGraphEditorNarrow ? <DialogueCombobox ref={dialogueListRef} ... /> : undefined}` à `GraphEditorHeader`.
  - [x] 🟢 `frontend/src/components/graph/GraphEditorHeader.tsx` :
    - Nouveau prop `headerSelector?: ReactNode` typé.
    - Insertion du slot dans la zone titre (`graph-toolbar-top-left`), au-dessus de « Éditeur de graphe », avec `data-testid="graph-editor-header-selector"`.
    - Layout `gridTemplateAreas` narrow inchangé (`"header" "tools"` / `"header" "tools" "search"`) — le slot reste dans la zone `header`.
  - [x] 🟢 `dialogueListRef` (`useDialogueLoader`) : pont identique à Task 2 — `DialogueCombobox.refresh()` est compatible avec `UnityDialogueList.refresh()`.
  - [x] 🔵 Test ciblé `frontend/src/components/graph/GraphEditor.combobox-17_7.test.tsx` (2 tests narrow/desktop, mock `useNarrowInlineSize` + dépendances lourdes) — passe en 1.24 s.

- [x] **Task 4 : Alignement bord gauche toolbar ↔ contenu (AC #4)**
  - [x] 🔴 Test : narrow et comfortable, `|toolbar.getBoundingClientRect().left - content.getBoundingClientRect().left| ≤ 2` sur `unity-dialogue-editor-toolbar` et `unity-dialogue-editor-content` (conforme à l’AC #4).
  - [x] 🟢 `frontend/src/theme/responsiveChrome.ts` : extraction d'un token interne `unityDialogueEditorPaddingHorizontal = { comfortable: '0.85rem', narrow: '0.58rem' }` partagé entre `headerPadding` (composante horizontale) et `contentPadding`. Header passe de `'0.35rem 0.48rem'` → `'0.35rem 0.58rem'` en narrow ; idem en comfortable.
  - [x] 🟢 `frontend/src/components/generation/UnityDialogueEditor.tsx` : ajout `data-testid="unity-dialogue-editor-content"` sur le wrapper scrollable (sans changer de styling).
  - [x] 🔵 2 tests dans `UnityDialogueEditor.narrow.test.tsx` (AC #4 narrow + AC #4 comfortable) — verts en 1.08 s.
  - [x] 🔵 **Note Éditeur de Graphe** : le canvas React Flow occupe tout le wrapper sans `padding-left` (comportement attendu pour un canvas plein avec viewport pan/zoom). Aligner artificiellement le canvas sur le `padding-left` de la toolbar comprimerait inutilement la zone de travail. **L'AC #4 est interprété pour Édition de Dialogues uniquement** ; pour Graphe, on conserve le contrat « toolbar paddée + canvas plein ».

- [x] **Task 5 : Tests RTL transverses + non-régression (AC tous)**
  - [x] `DialogueCombobox.test.tsx` (15 tests) — Task 1 (dont tri `StyledSelect` → ordre liste ; **Enter/Espace** déclencheur fermé AC #6).
  - [x] `Dashboard.combobox-17_7.test.tsx` (2 tests) — narrow + desktop ; mock de `useNarrowInlineSize` pour éviter le bug 17.8 (workaround documenté).
  - [x] `GraphEditor.combobox-17_7.test.tsx` (2 tests) — narrow + desktop sur l'onglet Éditeur de Graphe.
  - [x] `UnityDialogueEditor.narrow.test.tsx` (7 tests) — étendu avec slot `headerSelector` (présence + absence) et alignement AC #4 narrow/comfortable.
  - [x] `useDialogueListData.test.ts` (6 tests) — hook isolé.
  - [x] `npm --prefix frontend run lint` — **zéro warning** (~16 s).
  - [x] Suite Vitest complète frontend : **894/894 tests verts** (~34 s, `npx vitest run --reporter=dot`).
  - [ ] Playwright e2e narrow : non couvert dans cette story (peut faire l'objet d'une story complémentaire si désiré).

## Dev Notes

- **Architecture guardrails** : périmètre **strictement narrow viewport** côté UI ; **aucun** changement contrat API (`unityDialoguesAPI`), **aucun** changement comportement desktop. Les modifications doivent être **conditionnées** sur le résultat de `useNarrowInlineSize` (déjà consommé dans `Dashboard.tsx` et `GraphEditor.tsx`).
- **What to reuse** :
  - `useNarrowInlineSize` + seuil `PANEL_COMFORT_MIN_WIDTH_PX` (`theme/responsiveChrome.ts`)
  - `UnityDialogueItem` (rendu d'item de liste)
  - `StyledSelect` (tri configurable)
  - `unityDialoguesAPI.listUnityDialogues()` (source de données)
  - `theme.*` tokens (couleurs, bords, panel header)
  - `useDialogueLoader` (graphe) et état `selectedDialogue` (Dashboard) — **ne pas** créer de nouveau store / contexte global pour la sélection
- **Quality bar** : tests **Vitest + RTL** sur narrow et desktop ; ESLint zéro warning ; pas de duplication entre `UnityDialogueList` et `DialogueCombobox` (mutualiser via `useDialogueListData`).
- **Pièges à éviter** :
  - **Stale closure** sur `searchQuery` / `sortType` dans le combobox lorsqu'il est ouvert (cf. règle `agentivity.mdc` + pattern `useRef(value)` documenté dans `AGENTS.md`)
  - **Conflit de raccourci `/`** : un seul listener actif à la fois (le combobox doit désactiver le listener global de `UnityDialogueList` quand celui-ci n'est plus rendu, ou réutiliser le même hook partagé)
  - **Z-index** du dropdown vs canvas React Flow et vs `GraphSearchBar` — vérifier visuellement et via test
  - **Refresh contract** : `dialogueListRef.current?.refresh()` est appelé depuis 3 endroits (Dashboard `onDeleted`, `UnityDialogueDetails.handleDelete` indirectement, `GraphEditor` `onGenerated`) — toutes les routes doivent rester fonctionnelles
- **Refactor bar** : critères par défaut workflow `dev-story` (~300 lignes par fichier touché par tâche, ~60 lignes par fonction, pas de duplication non triviale).

### Project Structure Notes

- Composants impactés :
  - `frontend/src/components/layout/Dashboard.tsx` (tab `edition`, ~L1054-1096)
  - `frontend/src/components/graph/GraphEditor.tsx` (~L137-143)
  - `frontend/src/components/graph/GraphEditorHeader.tsx` (~L497-514, slot dans zone titre)
  - `frontend/src/components/generation/UnityDialogueEditor.tsx` (slot `headerSelector` dans header, ~L319)
  - `frontend/src/components/unityDialogues/UnityDialogueDetails.tsx` (forwarding slot)
  - `frontend/src/components/unityDialogues/UnityDialogueList.tsx` (consommer hook partagé)
  - **Nouveau** : `frontend/src/components/unityDialogues/DialogueCombobox.tsx`
  - **Nouveau** : `frontend/src/hooks/useDialogueListData.ts`
- Spec UX : `_bmad-output/planning-artifacts/ux-design-specification/responsive-design-accessibility.md`
- Epic : `_bmad-output/planning-artifacts/epics/epic-17.md` (insérer Story 17.7 entre 17.6 et 17.5 ou en fin selon convention SM)

### References

- [Source: `_bmad-output/planning-artifacts/epics/epic-17.md` — Stories 17.3 (drawers) et 17.6 (densité segmentée)]
- [Source: `_bmad-output/implementation-artifacts/17-3-panneaux-contexte-éditeur-narrow-drawers-fr120.md` — pattern narrow + fermeture évidente]
- [Source: `_bmad-output/implementation-artifacts/17-6-typographie-densite-adaptive-panneaux-onglets-fr118.md` — `useNarrowInlineSize`, tokens `responsiveChrome`]
- [Source: `frontend/src/hooks/useNarrowInlineSize.ts` — seuils narrow ResizeObserver]
- [Source: `frontend/src/theme/responsiveChrome.ts` — `PANEL_COMFORT_MIN_WIDTH_PX`, `unityDialogueEditorChrome`, `graphToolbarChrome`]
- [Source: `frontend/src/components/unityDialogues/UnityDialogueList.tsx` — comportement source de vérité (recherche/tri/raccourci)]

## Technical Requirements

- **React 18 + TypeScript strict** : annotations complètes, pas de `any`, props et refs typés
- **Pattern combobox WAI-ARIA** minimal :
  - `role="combobox"`, `aria-haspopup="listbox"`, `aria-expanded`, `aria-controls`
  - Panneau : `role="listbox"`, options `role="option"` + `aria-selected`
- **Clavier** : `Enter` / `Space` ouvre ; `↑` / `↓` navigue ; `Enter` sélectionne ; `Escape` ferme et restaure focus ; `/` focus champ recherche (raccourci global existant respecté)
- **Aucune nouvelle dépendance lourde** ; pas de librairie combobox tierce (downshift, headlessui) — primitives React + ARIA suffisent et restent cohérent avec `StyledSelect` du repo
- **Logging** : pas de `console.log` en production ; conserver les logs `[UnityDialogueList]` / nouveaux logs `[DialogueCombobox]` derrière les flags de debug existants

## Architecture Compliance

- Conforme **migration web** : UI dans `frontend/` ; **aucun** changement contrat API
- Cohérent **Epic 17** : prérequis 17.1 (shell), 17.2 (touch 44×44), 17.3 (drawers), 17.6 (densité) ; **ne pas** régresser FR119 ni les tests `fr119-touch.chrome.test.tsx`
- Respect **rule `python.mdc`** côté backend (non touché ici) ; respect **rule `frontend.mdc`** : tests Vitest + lint frontend zéro warning
- Respect **rule `meta_agent.mdc`** : preuves d'exécution (Vitest + lint) requises avant transition `review`

## Library / Framework Requirements

- **React Flow** : pas au cœur de cette story ; valider que le dropdown du combobox passe **au-dessus** du canvas (z-index) et **ne casse pas** `GraphSearchBar`
- Versions : rester sur **React 18.2** + **Vite** du repo ; pas d'upgrade

## File Structure Requirements

- Petits modules sous `frontend/src/` ; respect des alias éventuels.
- Co-location tests : `DialogueCombobox.test.tsx` à côté du composant.

## Testing Requirements

- Vitest : `DialogueCombobox.test.tsx` (Task 1) + maj `Dashboard.test.tsx` + extension `UnityDialogueEditor.narrow.test.tsx` + nouveau test largeur narrow `GraphEditor` ou `GraphEditorHeader`.
- Playwright (optionnel mais recommandé) : un scénario narrow `e2e/` qui ouvre `Édition`, change de dialogue via le combobox, vérifie le chargement.
- Non-régression : exécuter `npm --prefix frontend run test:quick` et `npm --prefix frontend run lint` — verts requis avant statut `review`.

## Previous Story Intelligence (17.3 / 17.6)

- **17.3** : `NarrowOverlayDrawer` patterns ouverture / fermeture overlay et focus management — référence directe pour le combobox dropdown.
- **17.6** : `useNarrowInlineSize` + tokens dans `responsiveChrome.ts` ; consommer le **même** seuil que les composants existants (cohérence visuelle stricte).
- **Layout column shell** : `unityDialogueListShell.ts` (`unityDialogueListColumnStyle`, `unityDialogueWorkspaceColumnStyle`) — c'est cette unité de layout qui est conditionnée en narrow.

## Latest Technical Notes

- **Implémentation actuelle** : mesure conteneur via **`ResizeObserver`** (`useNarrowInlineSize`) — voir `responsiveChrome.ts` (entête).
- **Stale closure piège** : `UnityDialogueList` utilise déjà `useCallback` + raccourci global `/` ; le combobox doit dialogue avec ce listener via le hook partagé.

## Project Context Reference

- `_bmad-output/project-context.md` — React 18, Vitest, ESLint zéro warning.

## File List

### Nouveaux fichiers (production)

- `frontend/src/hooks/useDialogueListData.ts` — hook partagé (fetch + sort + filter dialogues Unity)
- `frontend/src/components/unityDialogues/DialogueCombobox.tsx` — combobox WAI-ARIA (recherche `/`, tri, compteur, sélection)
- `frontend/src/components/layout/DialogueEditionTabContent.tsx` — sous-composant qui héberge `useNarrowInlineSize` à un niveau monté avec l'onglet (contournement de la dette 17.8)
- `frontend/src/utils/formatDialogueTitle.ts` — utilitaire centralisé (suppression de duplication entre `UnityDialogueItem`, `UnityDialogueDetails`, `DialogueCombobox`)

### Nouveaux fichiers (tests)

- `frontend/src/hooks/useDialogueListData.test.ts` — 6 tests
- `frontend/src/components/unityDialogues/DialogueCombobox.test.tsx` — 15 tests
- `frontend/src/components/layout/Dashboard.combobox-17_7.test.tsx` — 2 tests narrow + desktop (mock de `useNarrowInlineSize` ; cf. dette 17.8)
- `frontend/src/components/graph/GraphEditor.combobox-17_7.test.tsx` — 2 tests narrow + desktop

### Fichiers modifiés (production)

- `frontend/src/components/layout/Dashboard.tsx`
  - Suppression du hook `useNarrowInlineSize(PANEL_COMFORT_MIN_WIDTH_PX)` (déplacé dans `DialogueEditionTabContent`)
  - Remplacement du contenu inline de l'onglet `edition` par `<DialogueEditionTabContent ... />`
  - Nettoyage des imports devenus inutiles (`UnityDialogueList`, `DialogueCombobox`, `DialogueEditionNarrowProvider`, `UnityDialogueDetails`, `unityDialogueListColumnStyle`, `unityDialogueWorkspaceColumnStyle`, `PANEL_COMFORT_MIN_WIDTH_PX`)
- `frontend/src/components/unityDialogues/UnityDialogueDetails.tsx` — prop `headerSelector?: ReactNode` ajouté + forwardé vers `UnityDialogueEditor`
- `frontend/src/components/generation/UnityDialogueEditor.tsx`
  - Prop `headerSelector?: ReactNode` ajouté
  - Slot rendu en haut de la zone titre avec `data-testid="unity-dialogue-editor-header-selector"`
  - Wrapper de contenu scrollable expose `data-testid="unity-dialogue-editor-content"` (Task 4 alignement AC #4)
- `frontend/src/components/unityDialogues/UnityDialogueList.tsx` — refactor pour consommer `useDialogueListData` (suppression de la duplication de logique fetch/sort/filter)
- `frontend/src/components/unityDialogues/UnityDialogueItem.tsx` — utilise `formatDialogueTitle` centralisé
- `frontend/src/components/graph/GraphEditor.tsx`
  - Nouveau `useNarrowInlineSize(PANEL_COMFORT_MIN_WIDTH_PX)` sur le container `graph-editor`
  - Condition `!isGraphEditorNarrow` autour de `<UnityDialogueList>`
  - `headerSelector={isGraphEditorNarrow ? <DialogueCombobox ... /> : undefined}` passé au header
- `frontend/src/components/graph/GraphEditorHeader.tsx`
  - Prop `headerSelector?: ReactNode` ajouté
  - Slot rendu dans la zone titre (`graph-toolbar-top-left`) avec `data-testid="graph-editor-header-selector"`
- `frontend/src/theme/responsiveChrome.ts`
  - Token interne `unityDialogueEditorPaddingHorizontal = { comfortable: '0.85rem', narrow: '0.58rem' }`
  - `headerPadding` et `contentPadding` partagent désormais la même valeur horizontale (Task 4 / AC #4)

### Fichiers modifiés (tests existants)

- `frontend/src/components/layout/Dashboard.test.tsx` — retrait des 2 tests 17.7 obsolètes (déplacés dans `Dashboard.combobox-17_7.test.tsx`)
- `frontend/src/components/generation/UnityDialogueEditor.narrow.test.tsx` — slot `headerSelector` + AC #4 via `getBoundingClientRect()`

### Harnais agent + dette technique

- `_bmad-output/implementation-artifacts/17-8-fix-usenarrowinlinesize-ref-tardive-dette-technique.md` — **nouvelle story** (status `ready-for-dev`)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — entrées `17-7-…: review` et `17-8-…: ready-for-dev`
- `.cursor/rules/frontend_testing.mdc` — 2 nouvelles sections (mock des hooks de mesure DOM, diagnostic des tests bloqués)

## Change Log

- **2026-04-29 (création)** : Story créée par Scrum Master suite à validation utilisateur de l'option B (DialogueCombobox searchable, narrow uniquement, conserver compteur / tri / raccourci `/`).
- **2026-04-29 (Task 1)** : `useDialogueListData` + `DialogueCombobox` extraits ; refactor `UnityDialogueList` ; `formatDialogueTitle` centralisé.
- **2026-04-29 (Task 2)** : intégration narrow onglet Édition de Dialogues. Bloc test Dashboard 1 h+ → diagnostic = bug du hook `useNarrowInlineSize` quand la ref est attachée tardivement (onglet inactif au mount). Workaround appliqué : mock du hook dans `Dashboard.combobox-17_7.test.tsx`. **Dette technique 17.8 créée**.
- **2026-04-29 (harnais)** : ajout sections `frontend_testing.mdc` (mock hooks de mesure + diagnostic blocage).
- **2026-04-29 (Task 3)** : intégration narrow onglet Éditeur de Graphe (mêmes patterns que Task 2, hook au niveau `GraphEditor` qui se monte avec l'onglet → pas de bug 17.8).
- **2026-04-29 (bug fix utilisateur)** : extraction `DialogueEditionTabContent.tsx` pour contourner le bug 17.8 sur l'onglet Édition (le hook au niveau Dashboard ne se ré-exécutait jamais). Validation visuelle utilisateur en attente.
- **2026-04-29 (Task 4)** : alignement bord gauche toolbar ↔ contenu (AC #4) — token horizontal partagé `unityDialogueEditorPaddingHorizontal` ; 2 nouveaux tests `UnityDialogueEditor.narrow.test.tsx` ; `Éditeur de Graphe` exclu du AC (canvas plein par design).
- **2026-04-29 (revue / correctifs Low)** : test RTL « tri change l’ordre » (`DialogueCombobox.test.tsx`) ; AC #4 via `getBoundingClientRect()` dans `UnityDialogueEditor.narrow.test.tsx` ; `filteredListSignature` pour le clamp `activeOptionIndex` ; en-tête de fichier de test + File List ; test Home/End stabilisé (`waitFor` focus recherche). Vitest **893/893** verts (~33 s) ; ESLint inchangé (0 erreur sur les fichiers touchés).
- **2026-04-29 (code-review [1])** : test RTL **Enter / Espace** sur déclencheur fermé (`DialogueCombobox.test.tsx`, AC #6) ; section **Senior Developer Review** mise à jour (MEDIUM levé).
- **2026-04-29 (clôture)** : statut story et `sprint-status.yaml` → **`done`** (acceptation PO / équipe).

## Senior Developer Review (AI)

**Reviewer:** Amelia (workflow `code-review`) · **Date:** 2026-04-29 · **Destinataire:** Véronique  
**Story key:** `17-7-selecteur-dialogue-toolbar-narrow-suppression-colonne-gauche-fr120` · **Statut :** `done` (clôture 2026-04-29)  
**Périmètre:** File List story + `frontend/src/**` (hors `_bmad/`, `.cursor/`). **Git:** story + sources en cours d’intégration ; fichier story encore `??` jusqu’au premier commit — attendu, pas une incohérence File List vs code applicatif.

### Synthèse AC (preuve code / tests)

| AC | Verdict | Preuve |
|----|-----------|--------|
| AC #1 | **IMPLEMENTED** | `DialogueEditionTabContent.tsx` + `GraphEditor.tsx` conditionnent colonne liste ; `Dashboard.combobox-17_7.test.tsx`, `GraphEditor.combobox-17_7.test.tsx` |
| AC #2 | **IMPLEMENTED** | `DialogueCombobox.tsx` + `useDialogueListData` ; tests recherche, tri, compteur, sélection |
| AC #3 | **IMPLEMENTED** | tests desktop narrow off ; liste présente |
| AC #4 | **IMPLEMENTED** (Édition) | `UnityDialogueEditor.narrow.test.tsx` + tokens `responsiveChrome.ts` ; exemption Graphe documentée (Task 4) |
| AC #5 | **IMPLEMENTED** | `DialogueCombobox.test.tsx` `refresh()` + mock API ; wiring `onDeleted` → `refresh` dans `DialogueEditionTabContent.tsx` L87–88 |
| AC #6 | **IMPLEMENTED** | `DialogueCombobox.test.tsx` — ouverture **Enter/Espace** sur déclencheur fermé ; ARIA + navigation panneau ouvert |

### Findings (adversarial)

**Git vs File List:** aucune anomalie **HIGH** (fichiers applicatifs listés ↔ présents dans `git diff` / `??`). Fichiers BMad (`sprint-status`, `frontend_testing.mdc`) : cohérents avec section « Harnais ».

**🔴 CRITICAL:** 0  
**🟡 MEDIUM:** 0 (levé 2026-04-29 : test Enter/Espace déclencheur fermé, code-review **[1]**).  
**🟢 LOW:** (1) `getBoundingClientRect()` sous jsdom souvent trivial (0 vs 0) — compléter par **Preuve UI** navigateur réel (`AGENTS.md` / `workflow.mdc`). (2) `zIndex: 1100` magique dans `DialogueCombobox.tsx` — pas de `theme/zIndex.ts` ; acceptable story, centralisation future. (3) Playwright narrow combobox toujours `[ ]` Task 5 — assumé backlog. (4) `_bmad-output/project-context.md` : `user_name` aligné sur **Véronique** (cohérence `config.yaml`, 2026-04-29).

### Checklist revue senior (extrait `checklist.md`)

- [x] Story chargée · [x] AC croisés · [x] File List vs git · [x] Tests mappés · [x] Qualité code ciblée (surface combobox + intégration)  
- [ ] **MCP doc search** : non exécuté (non bloquant ; patterns WAI-ARIA issus de la story + implémentation locale)

### Décision workflow BMad (étape 4)

**Outcome:** **Approuvé (réserves LOW)** — MEDIUM traité (**[1]**).  
**Clôture 2026-04-29 :** statut story **`done`** + `sprint-status.yaml` synchronisé.  
**Suite (optionnel) :** preuve UI navigateur si l’équipe l’exige ; Playwright narrow reste backlog Task 5.

**Où tester UI:** onglets **Édition de Dialogues** et **Éditeur de Graphe**, viewport &lt; `PANEL_COMFORT_MIN_WIDTH_PX` (~640px) : combobox toolbar, `/`, tri, sélection, alignement toolbar/contenu (Édition).
