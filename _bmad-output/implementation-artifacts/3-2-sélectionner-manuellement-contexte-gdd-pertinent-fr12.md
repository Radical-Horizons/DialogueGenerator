# Story 3.2: Sélectionner manuellement contexte GDD pertinent (FR12)

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **utilisateur créant des dialogues**,
I want **sélectionner manuellement le contexte GDD pertinent pour la génération et gérer ma sélection depuis un panneau dédié**,
so that **je peux contrôler précisément quelles informations sont injectées dans le prompt LLM, et ajuster ma sélection (retirer une entité, changer son mode) sans quitter le panneau de contexte**.

## Acceptance Criteria

1. **Given** je parcours les entités GDD (Story 3.1) **When** je coche une entité **Then** elle est ajoutée à ma sélection ; le compteur "Sélections actives (N)" est mis à jour immédiatement ; l'entité apparaît dans le panneau "Sélections actives" en mode Complet par défaut.

2. **Given** je sélectionne une entité **When** elle est cochée **Then** je peux choisir son mode d'inclusion : "Complet" (toutes sections GDD) ou "Extrait" (résumé uniquement) ; le mode est persisté dans le store.

3. **Given** j'ai sélectionné plusieurs entités **When** j'ouvre le panneau "Sélections actives" **Then** je vois toutes les entités sélectionnées listées individuellement, groupées par type (Personnages, Lieux, Objets, Espèces, Communautés) **And** chaque entité a un bouton X pour la retirer de la sélection **And** chaque entité a un bouton de basculement de mode (Complet ↔ Extrait) opérationnel depuis ce panneau.

4. **Given** je sélectionne un lieu **When** le lieu est sélectionné **Then** un éventuel mécanisme de suggestion de région associée est planifié en Story 3.4 (hors scope ici) ; aucune régression sur la sélection de lieux.

5. **Given** je lance une génération avec contexte sélectionné **When** la génération commence **Then** le contexte sélectionné (characters_full, characters_excerpt, locations_full, etc.) est inclus dans le payload envoyé au backend — ce comportement est déjà implémenté et doit rester non régressif.

## Tasks / Subtasks

<!-- Each task = one independently testable behavior (SM territory: WHAT, not HOW).
     Dev Notes contains WHERE/HOW context. Implementation details are the dev's job. -->

- [x] Task 1 : Suppression individuelle d'entité depuis le panneau "Sélections actives" (AC: #1, #3)
  - [x] 🔴 Test échoue : dans `SelectedContextSummary` (panneau étendu/expanded) — une entité sélectionnée est affichée individuellement avec un bouton X ; clic sur X → l'entité disparaît de la liste ET du store contextStore (`isElementSelected` retourne false).
  - [x] 🟢 Implémenter l'affichage individuel des entités avec bouton X dans `SelectedContextSummary` pour passer 🔴 (voir Dev Notes)
  - [x] 🔵 Faire le refactor du code développé pour passer le test afin d'obtenir un code KISS, DRY, SOLID. Autres chantiers possibles : extraire la liste des entités par type dans un sous-composant réutilisable, accessibilité (aria-label sur le bouton X).

- [x] Task 2 : Basculement mode Complet/Extrait par entité depuis le panneau "Sélections actives" (AC: #2, #3)
  - [x] 🔴 Test échoue : dans le panneau "Sélections actives" — une entité sélectionnée affiche son mode courant (Complet ou Extrait) ; clic sur le bouton de mode → le mode bascule dans le store (`getElementMode` retourne le nouveau mode) ; l'indicateur visuel reflète le changement.
  - [x] 🟢 Implémenter le toggle de mode par entité dans `SelectedContextSummary` pour passer 🔴 (voir Dev Notes)
  - [x] 🔵 Faire le refactor du code développé pour passer le test afin d'obtenir un code KISS, DRY, SOLID. Autres chantiers possibles : cohérence visuelle avec le toggle mode dans `ContextList`, réutilisation éventuelle d'un composant commun.

## Dev Notes

<!-- Constraints and context only — NOT implementation steps or prescription.
     DO: guardrails, what to reuse, quality bar (what to test), conventions.
     DO NOT: exhaustive file/method lists, step-by-step "create this" instructions. -->

- **Infrastructure déjà en place (Story 3.1) :** `contextStore.ts` gère l'intégralité de l'état de sélection. Les actions `toggleCharacter`, `toggleLocation`, `toggleItem`, `toggleSpecies`, `toggleCommunity` font déjà office de add/remove (toggle : si sélectionné → retire, sinon → ajoute). `setElementMode` / `getElementMode` gèrent le mode full/excerpt par entité. `clearSelections` vide tout. NE PAS créer de nouvelles actions pour "removeEntity" — utiliser les toggles existants.

- **Ce qui manque (scope de cette story) :** `SelectedContextSummary.tsx` affichait les entités sélectionnées en texte comma-séparé par catégorie sans action par entité. La story 3.2 consiste à passer à un affichage individuel (une ligne par entité) avec bouton X (suppression) et bouton mode (Complet/Extrait) dans ce panneau. **Décision : ÉTENDU `SelectedContextSummary`** — les props, le comportement "Tout effacer" et "Lier Éléments Connexes" restent intacts.

- **Intégration génération → non régressive :** Le contexte est déjà passé via `context_selections: selections` dans tous les appels `generateFromNode` (NodeEditorPanel, AIGenerationPanel, GraphCanvas). Aucune modification backend requise pour cette story.

- **AC4 (suggestion région) :** Explicitement déféré à Story 3.4 par l'epic.

- **Quality bar :** Comportements couverts par les tests unitaires : (a) bouton X retire l'entité du store ; (b) toggle mode met à jour le store ; (c) le compteur "Sélections actives (N)" reflète l'état après suppression ; (d) le panneau étendu liste chaque entité individuellement avec son mode.

- **Conventions :** Patterns React du projet : composants dans `frontend/src/components/context/`, props typées, pas de logique métier dans les composants (déléguer au store). Nommage cohérent avec l'existant (`SelectedContextSummary`, `ContextList`). Le mode "Complet/Extrait" doit garder le même wording que dans `ContextList.tsx` pour la cohérence UX.

### Project Structure Notes

- `frontend/src/components/context/SelectedContextSummary.tsx` — composant étendu
- `frontend/src/components/context/SelectedContextSummary.test.tsx` — tests augmentés (14 tests)
- `frontend/src/components/context/ContextSelector.tsx` — callbacks `onRemoveEntity` et `onModeChange` ajoutés
- `frontend/src/store/contextStore.ts` — non modifié (actions existantes réutilisées)

### References

- [Source: _bmad-output/planning-artifacts/epics/epic-03.md] — Story 3.2, FR12, Technical Requirements
- [Source: _bmad-output/implementation-artifacts/3-1-parcourir-entités-gdd-disponibles-personnages-lieux-régions-thèmes-fr11.md] — Dev Notes 3.1
- [Source: frontend/src/components/context/SelectedContextSummary.tsx] — composant étendu
- [Source: frontend/src/store/contextStore.ts] — actions toggle, setElementMode, getElementMode

## Dev Agent Record

### Agent Model Used

claude-4.6-sonnet-medium-thinking

### Debug Log References

### Completion Notes List

- **Task 1 (Bouton X)** : Ajout des props optionnelles `onRemoveEntity` et `onModeChange` sur `SelectedContextSummary`. Quand `onRemoveEntity` est fourni, chaque entité dans le panneau étendu affiche un bouton `×` avec `aria-label="Retirer {name} de la sélection"`. `ContextSelector` passe `handleRemoveEntity` (délègue aux toggles existants du store).
- **Task 2 (Toggle mode)** : Quand `onModeChange` est fourni, chaque entité affiche un badge mode (📄 Complet / ✂️ Extrait) cliquable. Visuellement aligné avec `ContextList.tsx` (mêmes icônes, mêmes couleurs warning). `ContextSelector` passe `handleSelectionPanelModeChange` (délègue à `setElementMode` du store).
- **Refactor Task 1** : `renderEntityCategory` (inline function) extrait en composant React `EntityCategoryList` (mémoïsé). Accessibilité : `aria-label` sur les boutons X.
- **Code review fixes** : M1 — `handleRemoveEntity` et `handleSelectionPanelModeChange` wrappés dans `useCallback` (stable refs pour `memo(SelectedContextSummary)`). M2 — accès `theme.state.warning` aligné avec `ContextList` (retrait `?.`). L2 — `minWidth: '60px'` + `justifyContent: 'center'` ajoutés au bouton mode dans `EntityCategoryList`. L1 — 2 tests d'intégration ajoutés dans `ContextSelector.test.tsx` (13 tests total, 42 tests context/ passent).

### File List

- frontend/src/components/context/SelectedContextSummary.tsx (modified)
- frontend/src/components/context/SelectedContextSummary.test.tsx (modified — 6 tests ajoutés)
- frontend/src/components/context/ContextSelector.tsx (modified — callbacks `onRemoveEntity`, `onModeChange` en `useCallback`, import `EntityType`)
- frontend/src/components/context/ContextSelector.test.tsx (modified — 2 tests d'intégration ajoutés)
