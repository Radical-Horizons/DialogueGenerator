# Story 17.8: Fix `useNarrowInlineSize` — réattacher le `ResizeObserver` quand la ref est montée tardivement (dette technique)

Status: ready-for-dev

## Story

As a **développeur frontend qui consomme `useNarrowInlineSize` sur un nœud DOM monté tardivement (onglet, drawer, modale)**,
I want **que le hook re-mesure et re-attache son `ResizeObserver` lorsque la ref devient effectivement attachée à un élément du DOM**,
so that **`isNarrow` reflète la vraie largeur du nœud cible dès qu'il devient observable, sans dépendre de l'ordre de montage par rapport au render initial du parent — éliminant la classe de bugs où `isNarrow` reste figé à `false`/sa valeur initiale après un changement d'onglet ou l'ouverture d'un drawer**.

## Contexte (issue rencontrée Story 17.7)

Lors de l'implémentation de la Story 17.7 (sélecteur dialogue dans la toolbar narrow), un test RTL a bouclé en attente d'un élément (`dialogue-combobox-trigger`) qui n'était jamais rendu. Le diagnostic a mis en évidence un comportement non documenté du hook :

- `useNarrowInlineSize` est instancié au niveau d'un parent (ex. `Dashboard`) et expose une `ref` attachée à un nœud rendu **conditionnellement** (sous un onglet inactif au mount initial).
- Le `useEffect([measure])` du hook s'exécute **une seule fois** après le 1er render du parent, à un instant où `ref.current === null` (l'onglet hôte n'est pas monté).
- `if (!el) return` court-circuite l'attachement du `ResizeObserver`. Le `useLayoutEffect([measure])` s'exécute aussi avec `ref.current === null`.
- Quand l'onglet hôte devient actif (ex. après `userEvent.click(editionTab)`), la ref s'attache enfin — mais comme `measure` n'a pas changé de référence (mêmes deps `[thresholdPx, measureParent]`), **aucun des deux effects ne se ré-exécute** : `isNarrow` reste figé à `false` (valeur initiale du `useState`).

Conséquence : le rendu conditionnel `!isDialogueEditionNarrow` ne bascule jamais, et tout consommateur qui dépend de cette mesure pour un nœud monté tardivement est **incorrect**. Le bug est silencieux en production sur Chrome (sauf scénario tab switch sans resize ultérieur) mais bloque les tests RTL et peut produire des régressions UI difficiles à reproduire.

Workaround appliqué dans 17.7 : mock de `useNarrowInlineSize` dans le test (`Dashboard.combobox-17_7.test.tsx`) — découple le test du hook mais ne corrige pas la racine.

## Acceptance Criteria

1. **Réattachement du `ResizeObserver` à l'attachement effectif de la ref**
   - **Given** un consommateur qui passe la `ref` retournée par `useNarrowInlineSize` à un nœud rendu **conditionnellement** (initialement non monté)
   - **When** le nœud devient monté plus tard (ex. switch d'onglet, ouverture de drawer)
   - **Then** le hook **re-mesure** et **attache** son `ResizeObserver` au nouveau nœud sans nécessiter une intervention externe (resize fenêtre, force update parent)
   - **And** `isNarrow` reflète la largeur effective du nœud sous **2 frames** (animation frame x 2) après l'attachement.

2. **Détachement propre quand le nœud disparaît**
   - **Given** un nœud précédemment observé par le hook
   - **When** le nœud est démonté (ex. switch d'onglet inverse) puis qu'un nouveau nœud est attaché à la même ref plus tard
   - **Then** l'observer précédent est **disconnected** et un nouveau observer est attaché — pas de fuite mémoire ni d'observer fantôme persistant.

3. **API publique du hook inchangée pour les consommateurs existants**
   - **Given** les 8+ consommateurs actuels du hook (`Dashboard`, `GraphEditor`, `GraphEditorHeader`, `UnityDialogueEditor`, etc.)
   - **When** le hook est mis à jour
   - **Then** la signature `useNarrowInlineSize(thresholdPx, options?) => { ref, isNarrow }` reste **strictement identique** ; aucun consommateur n'a besoin d'être modifié pour bénéficier du fix.

4. **Tests unitaires de régression dans `useNarrowInlineSize.test.ts`**
   - **Given** une suite Vitest dédiée au hook
   - **When** on simule le scénario "ref attachée tardivement" (1er render avec ref non attachée → 2nd render avec ref attachée)
   - **Then** un test atteste que `isNarrow` passe correctement de la valeur initiale à la valeur attendue **sans** intervention extérieure (pas de `window.dispatchEvent('resize')`).
   - **And** un test couvre le scénario "ref ré-attachée sur un autre nœud" (démontage + remontage avec une nouvelle largeur).

5. **Non-régression `Dashboard.test.tsx` + `GraphEditor`**
   - **Given** la suite Vitest existante (`Dashboard.test.tsx`, `Dashboard.combobox-17_7.test.tsx`, `GraphEditor*.test.tsx`)
   - **When** la nouvelle implémentation est en place
   - **Then** **toutes** les suites passent, y compris les tests qui dépendent réellement de la mesure (`FR118 17.6 : titre panneau GDD plus compact quand la colonne centrale est étroite (desktop)`, `FR118 17.6 AC2 : onglets segmentés centraux`).
   - **And** **après** le fix, le mock de `useNarrowInlineSize` dans `Dashboard.combobox-17_7.test.tsx` peut être **supprimé** (le test passe avec le vrai hook + un wrapper de largeur narrow). Cette suppression est **incluse** dans cette story.

6. **Documentation harnais agent**
   - **Given** la règle `.cursor/rules/frontend_testing.mdc`
   - **When** la story est mergée
   - **Then** la note ajoutée par 17.7 sur "préférer mocker `useNarrowInlineSize`" est **mise à jour** pour refléter le fix : le hook est désormais sûr pour ce pattern, le mock n'est plus nécessaire (sauf optimisation explicite de temps de test).

**References:** dette identifiée Story 17.7 ; pattern callback ref / ResizeObserver ; React 18 docs sur `useImperativeHandle` et callback refs.

## Tasks / Subtasks

- [ ] **Task 1 : Tests RED — scénario ref tardive**
  - [ ] 🔴 Créer `frontend/src/hooks/useNarrowInlineSize.test.ts` (s'il n'existe pas déjà) avec les cas suivants :
    - Cas A : nœud monté immédiatement, largeur > seuil → `isNarrow === false`
    - Cas B : nœud monté immédiatement, largeur < seuil → `isNarrow === true`
    - Cas C : nœud monté **après** le 1er render (rerender avec un toggle qui rend le nœud conditionnellement) → `isNarrow` reflète la mesure
    - Cas D : ré-attachement sur un nouveau nœud après démontage → ancien observer disconnected, nouveau attaché
  - [ ] Valider que les cas A et B passent avec l'implémentation actuelle, **C et D échouent**.

- [ ] **Task 2 : GREEN — passer de `useRef` à un callback ref**
  - [ ] 🟢 Refactor `frontend/src/hooks/useNarrowInlineSize.ts` :
    - Remplacer `const ref = useRef<HTMLDivElement | null>(null)` par un **callback ref** `useCallback((node) => { ... })` qui :
      - Disconnect l'observer précédent (si existant)
      - Stocke le nœud dans une `useRef` interne
      - Re-mesure immédiatement
      - Attache un nouveau `ResizeObserver` si le nœud est non-null
    - Conserver la signature publique `{ ref, isNarrow }` — le `ref` retourné devient le **callback ref** (compatible `<div ref={ref}>` côté React).
    - **Cleanup** dans un `useEffect(() => () => observerRef.current?.disconnect(), [])` au démontage du hook.
  - [ ] 🟢 Vérifier que tous les tests Task 1 passent (4/4).

- [ ] **Task 3 : Refactor (REFACTOR)**
  - [ ] 🔵 Extraire `readLayoutWidthPx` dans le même fichier (déjà le cas) — pas de duplication ailleurs ; sinon centraliser dans `frontend/src/utils/measure.ts`.
  - [ ] 🔵 Documenter le pattern callback ref dans le **JSDoc du hook** (mention explicite du cas "nœud monté tardivement").

- [ ] **Task 4 : Suppression du workaround Story 17.7**
  - [ ] Supprimer le `vi.mock('../../hooks/useNarrowInlineSize')` dans `frontend/src/components/layout/Dashboard.combobox-17_7.test.tsx`
  - [ ] Remettre les tests sur la mesure réelle via wrapper `<div style={{ width: 480 }}>` (narrow) et `<div style={{ width: 1440 }}>` (desktop)
  - [ ] Vérifier que les 2 tests du fichier passent **sans** mock.

- [ ] **Task 5 : Mise à jour règle agent**
  - [ ] Éditer `.cursor/rules/frontend_testing.mdc` : la note sur "mocker `useNarrowInlineSize`" devient "préférer mock pour économiser du temps de test, mais le hook est maintenant sûr pour ref tardive (Story 17.8)".

- [ ] **Task 6 : Non-régression complète**
  - [ ] `npx vitest run src/hooks/useNarrowInlineSize.test.ts --reporter=dot` → vert
  - [ ] `npx vitest run src/components/layout --reporter=dot` → vert
  - [ ] `npx vitest run src/components/graph --reporter=dot` → vert
  - [ ] `npm --prefix frontend run lint` → zéro warning
  - [ ] Test manuel UI (`npm run dev`) : tab switch dans Dashboard, ouverture drawer narrow — `isNarrow` correctement réactif à la dimension réelle.

## Dev Notes

- **Pattern callback ref** : la solution canonique pour observer un nœud DOM dont la disponibilité est conditionnelle. Voir [React docs : Manipulating the DOM with Refs § Callback ref](https://react.dev/learn/manipulating-the-dom-with-refs).
- **Pourquoi pas un simple `useEffect([ref.current])`** : React ne re-déclenche pas un effect quand `.current` change (objet ref muté hors render). Seul un callback ref garantit l'invocation au moment où React attache/détache le nœud.
- **Compatibilité TypeScript** : la callback ref retournée doit être typée `(node: HTMLDivElement | null) => void`. Les consommateurs attendent un `RefObject<HTMLDivElement>` dans certains endroits (cf. `Dashboard.tsx` cast `as unknown as RefObject<HTMLDivElement>`) — vérifier et adapter si besoin (le cast peut disparaître).
- **`as unknown as RefObject<HTMLDivElement>`** dans Dashboard.tsx (~ligne 1074) : cast actuel résultant d'un mismatch typage. Ce cast doit être **supprimé** post-fix.
- **Risque de cycle de mesure** : `setIsNarrow` re-rend → potentiellement re-callback ref si la ref est passée dans une expression nouvelle à chaque render. **Mitigation** : `useCallback` avec deps stables `[thresholdPx, measureParent]` (mêmes deps que `measure` aujourd'hui).

### Project Structure Notes

- Composants impactés (consommateurs uniquement vérifiés, pas modifiés sauf cast à supprimer) :
  - `frontend/src/components/layout/Dashboard.tsx` (cast `as unknown as RefObject<HTMLDivElement>` à supprimer si callback ref typée correctement)
  - `frontend/src/components/graph/GraphEditor.tsx`
  - `frontend/src/components/graph/GraphEditorHeader.tsx`
  - `frontend/src/components/generation/UnityDialogueEditor.tsx`
- Fichiers principaux modifiés :
  - `frontend/src/hooks/useNarrowInlineSize.ts` (refactor callback ref)
  - `frontend/src/hooks/useNarrowInlineSize.test.ts` (nouveau)
  - `frontend/src/components/layout/Dashboard.combobox-17_7.test.tsx` (suppression mock)
  - `.cursor/rules/frontend_testing.mdc` (mise à jour note)

### References

- [Source: `frontend/src/hooks/useNarrowInlineSize.ts` — implémentation actuelle, `useRef` + `useEffect`]
- [Source: `_bmad-output/implementation-artifacts/17-7-selecteur-dialogue-toolbar-narrow-suppression-colonne-gauche-fr120.md` — story où la dette a été identifiée]
- [Source: `frontend/src/components/layout/Dashboard.combobox-17_7.test.tsx` — workaround actuel à retirer]
- React docs : [Manipulating the DOM with Refs § Callback ref](https://react.dev/learn/manipulating-the-dom-with-refs)

## Technical Requirements

- **TypeScript strict** : signature publique `{ ref: (node: HTMLDivElement | null) => void; isNarrow: boolean }` (le type de `ref` change de `RefObject` à `RefCallback`, **mais** reste assignable directement à un `ref={...}` JSX). Cf. type natif `Ref<T> = RefCallback<T> | RefObject<T> | null`.
- **Pas de nouvelle dépendance**.
- **`ResizeObserver`** : conserver le polyfill / mock de tests existants (`setupFiles`).

## Architecture Compliance

- Conforme **rule `frontend.mdc`** : tests Vitest + lint zéro warning.
- Conforme **rule `meta_agent.mdc`** : la dette est tracée comme story dédiée (pas de fix opportuniste dans 17.7).
- Conforme **rule `agentivity.mdc`** : auto-correction du harnais — le règle `frontend_testing.mdc` est mise à jour quand la dette est résolue.

## Library / Framework Requirements

- React 18.2 ; pas d'upgrade.

## File Structure Requirements

- Co-location test : `useNarrowInlineSize.test.ts` à côté du hook.

## Testing Requirements

- Vitest unitaire dédié au hook (Task 1).
- Non-régression : Dashboard + Graph + Generation (`test:quick` ou suites ciblées).
- Test manuel UI : tab switch + drawer ouverture sans `window.resize`.

## Risk / Rollback

- **Risque faible** : le fix est local (1 fichier hook), API inchangée pour les consommateurs.
- **Rollback** : `git revert` du commit unique. Le mock dans 17.7 redevient nécessaire.

## Review follow-up (code review Story 17.7 — 2026-04-29)

À traiter **pendant l’implémentation de la 17.8** (ou avant merge si le PO priorise la traçabilité planning) :

- [ ] [AI-Review][LOW — traçabilité epic] **M4** : Mettre à jour `_bmad-output/planning-artifacts/epics/epic-17.md` — y insérer la **Story 17.7** (référence + lien vers l’artifact `17-7-selecteur-dialogue-toolbar-narrow-suppression-colonne-gauche-fr120.md`) et la **Story 17.8** si absentes ; aligner le tableau « Synthèse dépendances stories » pour refléter 17.7 / 17.8.

## Change Log

- **2026-04-29** : Story créée par Scrum Master suite à diagnostic blocage test 17.7 (44 min de waitFor sur un combobox jamais rendu à cause de `useNarrowInlineSize` avec `ref.current === null` au mount initial du parent).
- **2026-04-29** : Ajout section « Review follow-up » — action item **M4** (aligner `epic-17.md` avec les stories 17.7 et 17.8) à traiter lors de l’implémentation 17.8.
