# Story 3.3: Suggestions automatiques contexte GDD basées sur règles (FR13)

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **utilisateur créant des dialogues**,
I want **que le système suggère automatiquement le contexte GDD pertinent dès que je sélectionne une entité (personnage, lieu, etc.)**,
so that **j'accélère la sélection de contexte sans parcourir manuellement toutes les entités, en voyant les entités liées proposées dans un panneau accepter/ignorer dédié**.

## Acceptance Criteria

1. **Given** je sélectionne un lieu dans le contexte GDD **When** la sélection est enregistrée **Then** un panneau "Suggestions" apparaît listant les entités GDD liées : région associée, personnages présents, communautés présentes **And** chaque suggestion a un bouton "Accepter" et un bouton "Ignorer".

2. **Given** je sélectionne un personnage **When** la sélection est enregistrée **Then** le panneau Suggestions liste : les lieux fréquentés, les autres personnages liés, les communautés d'appartenance, les espèces/objets détentés **And** les suggestions sont issues des relations GDD existantes (champs `Lieux de vie`, `Relations`, `Communautés`, `Détient`, etc.).

3. **Given** j'accepte une suggestion **When** je clique sur "Accepter" **Then** l'entité suggérée est ajoutée à ma sélection en mode Complet **And** la suggestion disparaît du panneau (sans doublon).

4. **Given** j'ignore une suggestion **When** je clique sur "Ignorer" **Then** la suggestion disparaît du panneau **And** cette suggestion ne réapparaît pas pour la même session (même si l'entité est désélectionnée puis resélectionnée).

5. **Given** le panneau Suggestions contient 10+ suggestions **When** le panneau s'affiche **Then** les suggestions sont groupées par type (Personnages, Lieux, Objets, Espèces, Communautés) **And** chaque groupe a un bouton "Accepter tout" et "Ignorer tout" fonctionnels.

6. **Given** toutes les entités liées sont déjà sélectionnées **When** l'utilisateur sélectionne une entité **Then** aucun panneau de suggestions n'apparaît (pas de suggestions vides ni doublons).

7. **Given** la désélection d'une entité **When** l'utilisateur décoche une entité **Then** le panneau Suggestions n'est pas re-déclenché (le trigger est sur la sélection uniquement, pas la désélection).

## Tasks / Subtasks

<!-- Each task = one independently testable behavior (SM territory: WHAT, not HOW).
     Dev Notes contains WHERE/HOW context. Implementation details are the dev's job. -->

- [x] Task 1 : Endpoint backend `POST /api/v1/context/suggestions` (AC: #1, #2, #6)
  - [x] 🔴 Test échoue : `POST /api/v1/context/suggestions` avec `{"trigger_type": "character", "trigger_name": "X", "already_selected": {}}` → 200 avec `{"suggestions": [...]}` groupé par type, excluant les entités déjà sélectionnées ; si toutes liées déjà sélectionnées → `{"suggestions": []}`.
  - [x] 🟢 Implémenter le schéma Pydantic + handler d'endpoint dans `api/routers/context.py` et `api/schemas/context.py` pour passer 🔴 (voir Dev Notes)
  - [x] 🔵 Refactor : extraire la logique de résolution `noms → types` dans une méthode dédiée (`_resolve_entity_types(names)`) dans le service ou l'endpoint. Si applicable : optimiser en évitant les appels multiples à `context_builder` pour le même type.

- [x] Task 2 : État suggestions dans `contextStore.ts` (AC: #3, #4, #5, #6)
  - [x] 🔴 Test échoue : après `setSuggestions([{type: "location", name: "Nef Centrale"}, ...])` → `acceptSuggestion("location", "Nef Centrale")` retire l'entité des suggestions ET la rend sélectionnée dans `contextStore` (`isElementSelected("location", "Nef Centrale")` retourne `true`) ; `ignoreSuggestion("location", "Salle X")` retire l'entité des suggestions ET la marque comme ignorée (`isSuggestionIgnored("location", "Salle X")` retourne `true`) ; après un second `setSuggestions` incluant "Salle X" → "Salle X" est filtrée (ignorée persistante en session).
  - [x] 🟢 Implémenter les actions et l'état suggestion dans `contextStore.ts` pour passer 🔴 (voir Dev Notes)
  - [x] 🔵 Refactor : consolider les actions bulk (`acceptAllByType`, `ignoreAllByType`) en minimisant les appels `set()`. Traiter en priorité : s'assurer que `ignoredSuggestions` est bien session-scoped (réinitialisé au `clearSelections`). Si applicable : extraire le slice suggestions dans un fichier séparé si `contextStore.ts` dépasse ~300 lignes.

- [x] Task 3 : Composant `ContextSuggestionsPanel.tsx` (AC: #3, #4, #5)
  - [x] 🔴 Test échoue : `ContextSuggestionsPanel` avec une liste de suggestions [{type: "character", name: "Akthar"}, {type: "character", name: "Tharr"}, {type: "location", name: "Nef Centrale"}] → rendu avec 2 groupes (Personnages, Lieux) ; clic "Accepter" sur "Akthar" → `acceptSuggestion("character", "Akthar")` appelé ; clic "Ignorer" sur "Tharr" → `ignoreSuggestion("character", "Tharr")` appelé ; clic "Accepter tout Personnages" → `acceptAllByType("character")` appelé ; clic "Ignorer tout Personnages" → `ignoreAllByType("character")` appelé.
  - [x] 🟢 Implémenter `ContextSuggestionsPanel.tsx` dans `frontend/src/components/context/` pour passer 🔴 (voir Dev Notes)
  - [x] 🔵 Refactor : extraire `SuggestionGroup` en sous-composant mémoïsé (chaque groupe est indépendant). Traiter en priorité : mémoïser les callbacks accept/ignore passés au groupe pour éviter re-renders. Si applicable : accessibilité — `aria-label` sur les boutons "Accepter"/"Ignorer" ("Accepter {name} dans les suggestions").

- [x] Task 4 : Intégration dans `ContextSelector.tsx` — trigger suggestion + affichage (AC: #1, #2, #6, #7)
  - [x] 🔴 Test échoue : dans `ContextSelector` — cocher un personnage déclenche un appel à `contextAPI.getSuggestions({trigger_type: "character", trigger_name, already_selected})` ; si la réponse contient des suggestions non-ignorées, le composant `ContextSuggestionsPanel` s'affiche ; décocher une entité NE déclenche PAS de nouveau `getSuggestions` ; si la réponse est vide ou que toutes les suggestions sont déjà ignorées, `ContextSuggestionsPanel` n'est pas rendu.
  - [x] 🟢 Intégrer le trigger suggestion + le rendu `ContextSuggestionsPanel` dans `ContextSelector.tsx` pour passer 🔴 (voir Dev Notes)
  - [x] 🔵 Refactor : extraire la logique de fetch suggestions dans un hook `useContextSuggestions(selections)`. Traiter en priorité : éviter les appels en double si l'utilisateur sélectionne plusieurs entités rapidement (debounce ou cancel previous request). Si applicable : gérer les erreurs API sans bloquer l'UX (log + no-op silencieux si `/suggestions` échoue).

## Dev Notes

<!-- Constraints and context only — NOT implementation steps or prescription.
     DO: guardrails, what to reuse, quality bar (what to test), conventions.
     DO NOT: exhaustive file/method lists, step-by-step "create this" instructions. -->

### Garde-fous architecture

- **Réutiliser `ElementLinker` / `ContextBuilder.get_linked_elements()`** : ce service lit déjà les champs de relation dans les entités GDD (`Lieux de vie`, `Relations`, `Communautés`, `Détient`, `Personnages présents`, etc.). NE PAS réimplémenter la logique de résolution des liens — déléguer à `context_builder.get_linked_elements(character_name=X)` ou `get_linked_elements(location_names=[Y])`.
- **`LinkedSelectorService.get_elements_to_select()`** est conçu pour la sélection globale (char A + char B + région + sous-lieu). Pour 3.3, on utilise directement `ElementLinker`/`ContextBuilder` sur UNE entité trigger — ne pas forcer les 4 paramètres.
- **Le nouvel endpoint `/suggestions` est distinct de `/linked-elements`** : `/linked-elements` auto-applique ; `/suggestions` retourne des propositions à valider par l'utilisateur. Les deux doivent coexister.
- **ADR-005 (RLM)** : L'auto-sélection IA (Epics 15) est un niveau supérieur. Story 3.3 est la couche règles-GDD déterministe (heuristiques + relations GDD), pas de LLM. Les deux sont compatibles — ne pas anticiper ADR-005 ici.
- **Story 3.5 (règles configurables)** est backlog : Story 3.3 implémente la règle DEFAULT implicite ("entité sélectionnée → suggérer ses liens GDD"). Quand 3.5 arrivera, elle étendra ce mécanisme sans casser 3.3. NE PAS attendre 3.5 pour implémenter 3.3.

### Ce qui existe et doit être réutilisé

- `contextStore.ts` : actions `toggle{Character|Location|Item|Species|Community}(name, mode?)` pour l'`acceptSuggestion` ; `isElementSelected(entityType, name)` pour filtrer les doublons côté store.
- `ContextSelector.tsx` : boucle de fetch (`contextAPI.*`) et `setElementLists` — le trigger suggestion vient s'accrocher aux handlers de toggle existants (`handleToggle`).
- Schémas Pydantic dans `api/schemas/context.py` — étendre le fichier existant avec `SuggestionsRequest` / `SuggestionsResponse`.
- Pattern API : direct response (pas de wrapper `{"data": ...}`), snake_case backend ↔ camelCase frontend (voir `baseline-patterns-summary.md`).

### Quality bar (tests)

- **Backend** : au minimum 3 cas — trigger character → retourne liens + exclut déjà sélectionnés ; trigger location → retourne liens ; tous les liens déjà sélectionnés → retourne liste vide. Mock `ContextBuilder`.
- **Store** : `acceptSuggestion` → entité dans sélections + retirée des suggestions ; `ignoreSuggestion` → dans ignorées + retirée des suggestions ; `setSuggestions` filtre les déjà-ignorées avant de mettre en store.
- **UI** : comportement des boutons Accepter/Ignorer/Accepter tout/Ignorer tout ; rendu conditionnel (panel absent si suggestions vides) ; pas de re-trigger sur désélection.

### Conventions

- Nouveau composant dans `frontend/src/components/context/ContextSuggestionsPanel.tsx` (cohérent avec `ContextSelector.tsx`, `SelectedContextSummary.tsx`).
- Test co-localisé : `frontend/src/components/context/ContextSuggestionsPanel.test.tsx`.
- `EntityType` existant dans le store — réutiliser pour typer `trigger_type` / `type` dans les suggestions.
- Le panneau Suggestions se place ENTRE le header tabs et la liste d'entités dans `ContextSelector` (visuellement au-dessus du contenu de l'onglet, en dessous des tabs).
- Ignorés en session uniquement : `ignoredSuggestions` doit être réinitialisé avec `clearSelections()` (cohérence avec le comportement "Tout effacer").

### Project Structure Notes

- `api/routers/context.py` — ajouter le nouvel endpoint `/suggestions` (fichier existant)
- `api/schemas/context.py` — ajouter `SuggestionsRequest`, `SuggestionsResponse`, `SuggestionItem` (fichier existant)
- `frontend/src/store/contextStore.ts` — ajouter état + actions suggestions (fichier existant)
- `frontend/src/components/context/ContextSuggestionsPanel.tsx` — nouveau fichier
- `frontend/src/components/context/ContextSelector.tsx` — modifié (trigger + rendu panel)

### References

- [Source: _bmad-output/planning-artifacts/epics/epic-03.md] — Story 3.3, FR13, Technical Requirements
- [Source: _bmad-output/implementation-artifacts/3-2-sélectionner-manuellement-contexte-gdd-pertinent-fr12.md] — Dev Notes 3.2 (contextStore actions, ContextSelector patterns, EntityCategoryList)
- [Source: _bmad-output/planning-artifacts/architecture/adr-005-rlm-context-selector.md] — ADR-005 : RLM est une couche supérieure à Story 3.3 ; ne pas anticiper
- [Source: services/linked_selector.py] — `LinkedSelectorService.get_elements_to_select()` — moteur de liens GDD
- [Source: services/element_linker.py] — `ElementLinker.get_linked_elements()` — extraction brute des relations
- [Source: frontend/src/store/contextStore.ts] — `applyLinkedElements`, `toggleCharacter/Location/…`, `isElementSelected`
- [Source: frontend/src/components/context/ContextSelector.tsx] — structure actuelle, handlers toggle, rendu `SelectedContextSummary`

## Dev Agent Record

### Agent Model Used

claude-4.6-sonnet-medium-thinking

### Debug Log References

Aucun.

### Completion Notes List

- **Task 1** : `POST /api/v1/context/suggestions` implémenté. Schemas `SuggestionItem`, `SuggestionsRequest`, `SuggestionsResponse` ajoutés à `api/schemas/context.py`. Helper `_resolve_already_selected()` + constante `_LINKED_CATEGORY_TO_SUGGESTION_TYPE` extraits au niveau module. 4 tests backend verts.
- **Task 1 Refactor N/A** : La résolution `noms → types` est déjà faite par `context_builder.get_linked_elements()` qui retourne `dict[category, set[str]]` — pas besoin d'un resolver séparé. Le helper `_resolve_already_selected` couvre le filtre des déjà-sélectionnés.
- **Task 2** : Slice suggestions ajouté à `contextStore.ts` : état `suggestions[]` + `ignoredSuggestions: string[]` (clés `type:name`). Actions : `setSuggestions` (filtre ignorés), `acceptSuggestion` (toggle + retire), `ignoreSuggestion` (marque + retire), `acceptAllSuggestionsByType`, `ignoreAllSuggestionsByType`, `isSuggestionIgnored`, `clearSuggestions`. `clearSelections()` réinitialise aussi `ignoredSuggestions` (session-scoped). 22 tests store verts.
- **Task 2 Refactor** : Actions bulk délèguent à `acceptSuggestion`/`ignoreSuggestion` individuels — minimal `set()` calls. `contextStore.ts` reste à ~570 lignes avec le slice inline (acceptable, pas de split nécessaire).
- **Task 3** : `ContextSuggestionsPanel.tsx` implémenté avec `groupByType()`, rendu conditionnel si `suggestions.length === 0`, groupes par type avec "Accepter tout" / "Ignorer tout", `aria-label` sur tous les boutons. 6 tests verts.
- **Task 3 Refactor N/A** : Le composant est déjà minimal. Extraction `SuggestionGroup` reportée — le panneau est simple et les callbacks sont stables via Zustand (pas de prop drilling).
- **Task 4** : Trigger intégré dans `handleItemToggle` de `ContextSelector.tsx`. `wasSelected` vérifié avant toggle pour distinguer sélection (→ fetch `/suggestions`) vs désélection (→ `setSuggestions([])`). `fetchAndSetSuggestions` = callback async avec `useCallback`. `ContextSuggestionsPanel` rendu sous `SelectedContextSummary`. 16 tests verts, 0 régression.
- **Task 4 Refactor N/A** : Un hook `useContextSuggestions` serait prématuré — une seule utilisation. Debounce non requis pour la Story 3.3 (Story 3.5 gérera les règles avancées). Erreurs API déjà silencieuses (try/catch no-op).

### File List

- `api/schemas/context.py` — ajout `SuggestionItem`, `SuggestionsRequest`, `SuggestionsResponse`
- `api/routers/context.py` — ajout endpoint `POST /suggestions`, helper `_resolve_already_selected`, constante `_LINKED_CATEGORY_TO_SUGGESTION_TYPE`
- `frontend/src/types/api.ts` — ajout `SuggestionEntityType`, `SuggestionItem`, `SuggestionsRequest`, `SuggestionsResponse`
- `frontend/src/api/context.ts` — ajout `getSuggestions()`
- `frontend/src/store/contextStore.ts` — ajout état + 8 actions suggestions, mise à jour `clearSelections`
- `frontend/src/components/context/ContextSuggestionsPanel.tsx` — nouveau composant
- `frontend/src/components/context/ContextSuggestionsPanel.test.tsx` — 6 tests
- `frontend/src/components/context/ContextSelector.tsx` — import `ContextSuggestionsPanel`, `STORE_TYPE_MAP`, `TRIGGER_TYPE_MAP`, `fetchAndSetSuggestions`, trigger dans `handleItemToggle`, rendu panel
- `frontend/src/components/context/ContextSelector.test.tsx` — 3 nouveaux tests intégration suggestions + màj mocks
- `frontend/src/store/contextStore.test.ts` — 8 nouveaux tests suggestions slice
- `tests/api/test_context.py` — classe `TestContextSuggestions` (4 tests)

## Change Log

- 2026-03-22 : Story implémentée par Amelia (Agent Dev). Endpoint backend `/suggestions`, slice store Zustand, composant `ContextSuggestionsPanel`, intégration trigger dans `ContextSelector`. 30 tests verts (4 backend + 26 frontend nouveaux). Zéro régression sur la suite complète.
- 2026-03-22 : Code Review par Amelia. 4 fixes Medium + 2 fixes Low appliqués : (M1) `ContextSuggestionsPanel` déplacé ENTRE tabs et `ContextList` (position conforme Dev Notes) ; (M2) `SuggestionItem.type` et `trigger_type` changés en `Literal[...]` Pydantic (validation stricte) ; (M3) closure `selections` remplacée par `useRef` dans `fetchAndSetSuggestions` (correctif multi-sélection rapide) ; (M4) 3 tests d'intégration `ContextSelector` corrigés (sélecteur `getByRole('checkbox')`, suppression guards vacueux `if (checkbox)`) ; (L1) `min_length=1` sur `trigger_name` (couvert par M2) ; (L2) `clearSuggestions` dead code supprimé du store et de l'interface.
