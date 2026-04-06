# Story 4.2 : Détecter nœuds vides (contenu texte manquant) (FR37)

Status: done

<!-- Note: Validation optionnelle. Exécuter validate-create-story avant dev-story si besoin. -->

## Story

As a **utilisateur créant des dialogues**,
I want **détecter les nœuds vides (contenu texte manquant)**,
so that **je peux identifier et corriger les nœuds incomplets avant export**.

## Acceptance Criteria

1. **Given** un dialogue avec des nœuds, **When** je lance une validation, **Then** les nœuds sont vérifiés pour le contenu texte (`line` ou `choices` exploitables) ; **And** les nœuds vides sont listés.
2. **Given** un nœud dialogue sans `line` ni choix au texte exploitable, **When** validation, **Then** message aligné sur l’épique du type « Nœud [stableID] : contenu vide (ni dialogue ni choix) » ; **And** surlignage **orange** sur le graphe (distinct du rouge FR36 structure) ; **And** clic sur l’erreur → focus / édition du nœud (réutiliser le flux existant du panneau).
3. **Given** un nœud test sans attribut `test`, **When** validation, **Then** message aligné « Nœud test [stableID] : test d’attribut manquant » (ou équivalent court et stable) ; **And** marquage visuel **incomplet** cohérent avec la palette « complétude » (orange, pas rouge structure).
4. **Given** un nœud END vide, **When** validation, **Then** aucun avertissement lié au vide (déjà exclu côté backend pour la structure dialogue — à préserver).
5. **Given** je corrige un nœud vide et je sauvegarde, **When** la persistance se termine, **Then** la validation est relancée automatiquement si ce n’est pas déjà le cas sur tous les chemins de sauvegarde concernés (documenter / combler les trous).
6. **NFR-P3** : pas de régression perf manifeste sur `validate_graph` (une passe O(n) conservée).

## Tasks / Subtasks

- [x] **Task 1** : Messages + contrat backend FR37 (AC: #1, #2, #3, #4, #6)  
  - [x] 🔴 Test échoue : pour un graphe avec nœud dialogue sans texte exploitable, la réponse validate expose un `type` stable (ex. `missing_dialogue_text` existant ou `empty_dialogue_content` si vous scindez) et un **message** conforme à l’AC #2 ; pour `testNode` sans `test`, message conforme AC #3 ; END inchangé (AC #4).  
  - [x] 🟢 Ajuster `GraphValidationService` (`services/graph_validation_service.py`) — zone `_validate_unity_dialogue_structure` / `_validate_test_node_content` — et sérialisation API inchangée sauf textes/types si besoin ; mettre à jour `tests/services/test_graph_validation_service.py` et tests API (`tests/api/test_graph_validate.py` ou `test_graph_crud.py`) en cohérence avec `POST` canonique **`/api/v1/unity-dialogues/graph/validate`**.  
  - [x] 🔵 Refactor : si la logique « texte exploitable » diverge entre tests et prod, centraliser sur les helpers existants (`_choices_have_exploitable_text`, etc.) et clarifier en docstring la frontière **FR36 (structure)** vs **FR37 (complétude contenu)** pour les futurs devs.

- [x] **Task 2** : Surlignage graphe orange « complétude » vs rouge « structure » (AC: #2, #3)  
  - [x] 🔴 Test échoue : étant donné des erreurs `missing_dialogue_text` / `missing_test` **sans** erreur structurelle FR36 sur le même nœud, le nœud reçoit une bordure **orange** (comportement distinct du rouge `isStructuralValidationErrorType`) ; si erreur structurelle présente, le rouge reste prioritaire.  
  - [x] 🟢 Étendre la dérivation des styles dans `GraphCanvas` (et tout sélecteur mutualisé si extrait) + ajuster `graphStructuralValidation.ts` / constantes pour que `missing_dialogue_text` ne soit plus traité comme erreur structurelle **visuelle** ; harmoniser les composants nœud qui appliquent déjà des styles selon `validationErrors` (`DialogueNode`, `TestNode`, `EndNode`).  
  - [x] 🔵 Refactor : extraire un petit helper du type `getValidationHighlightKind(errors)` si la matrice priorité rouge > orange > cycle devient verbeuse ; garder un seul endroit pour la règle de priorité.

- [x] **Task 3** : Panneau validation — libellés, navigation, action « Éditer » (AC: #2, #3)  
  - [x] 🔴 Test échoue : `GraphValidationPanel` / listes (`validationPanelLabels`, `GraphValidationPanelLists`) affichent des libellés FR37 identifiables ; clic sur une entrée avec `node_id` déclenche `focusNode` / sélection comme aujourd’hui ; présence d’une action ou libellé « Éditer le nœud » lorsque pertinent (réutiliser le flux existant, pas de nouvelle page).  
  - [x] 🟢 Mettre à jour `frontend/src/components/graph/validationPanelLabels.ts` et tests Vitest associés (`GraphValidationPanel.test.tsx`).  
  - [x] 🔵 Refactor : si les libellés par type grossissent, regrouper les chaînes FR37 dans un module de labels dédié ou constantes typées pour éviter duplication FR/EN future.

- [x] **Task 4** : Auto-validation après correction (AC: #5)  
  - [x] 🔴 Test échoue : sur le chemin de sauvegarde après édition nœud (ex. `useDialogueLoader` / `confirmFlush` / sauvegarde document), `validateGraph` est invoqué au moins une fois quand les données du graphe ont été persistées — test ciblé sur le hook ou le store avec mocks.  
  - [x] 🟢 Vérifier tous les chemins réels (autosave, sauvegarde manuelle, batch si applicable) et combler les lacunes sans double-appel inutile (éviter tempêtes réseau).  
  - [x] 🔵 Refactor : si plusieurs call sites dupliquent « save puis validate », factoriser en une action store ou helper documenté.

### Review Follow-ups (AI)

- [x] [AI-Review][MEDIUM] Tests API FR37 dans `tests/api/test_graph_crud.py` (`test_validate_graph_fr37_*`) — 2026-04-06.
- [x] [AI-Review][MEDIUM] `EndNode.tsx` : `getValidationHighlightKind` + fonds alignés `DialogueNode` / `TestNode` — 2026-04-06.
- [x] [AI-Review][MEDIUM] `graphStructuralValidation.ts` : `broken_reference` → kind `structural` pour le canvas (documenté, hors `isStructuralValidationErrorType`) — 2026-04-06.
- [ ] [AI-Review][LOW] `tests/services/test_graph_validation_service.py` — `test_valid_dialogue_node_no_structural_errors` : retirer `missing_dialogue_text` du set nommé `structural` (sémantique FR37 vs FR36).
- [ ] [AI-Review][LOW] `tests/api/test_graph_validate.py` — docstring module obsolète (`/api/v1/graph/validate` vs chemin canonique unity-dialogues).
- [ ] [AI-Review][LOW] `frontend/src/__tests__/useDialogueLoader.test.ts` — warning `act(...)` sur un test (qualité RTL).

## Dev Notes

- **Garde-fous architecture** : logique métier dans `services/` ; router mince ; injection `ServiceContainer` ; frontend = présentation + état graphe. Ne pas dupliquer les règles de contenu côté client pour prétendre valider sans API.
- **Réutiliser** : `GraphValidationService`, endpoint **`POST /api/v1/unity-dialogues/graph/validate`** (chemin canonique — l’épique mentionne parfois `/api/v1/graph/validate`, le code client utilise `frontend/src/api/graph.ts`). UI : **`GraphValidationPanel.tsx`**, sous-parties `GraphValidationPanelLists.tsx`, `validationPanelLabels.ts`. Store : `validateGraph` dans `uiSlice.ts`.
- **Frontière 4.1 / 4.2** : la story **4.1** a traité DisplayName, stableID et absence de texte comme **erreurs structurelles** avec surlignage **rouge** et type `missing_dialogue_text`. La story **4.2** affine l’**expérience FR37** : messages utilisateur, catégorie visuelle **orange** pour « complétude de contenu », et rappel test/END — **sans casser** la validité du graphe (`valid` côté API) sauf décision produit explicite documentée.
- **Qualité / tests** : pytest miroir `tests/services/`, `tests/api/` ; Vitest pour UI ; pas d’entités GDD réelles dans les tests.
- **Barre refactor (défaut dev-story)** : ~300 lignes par fichier touché, ~60 lignes par fonction, pas de duplication non triviale.

### Project Structure Notes

- Backend : `services/graph_validation_service.py`, routers sous `api/routers/` (unity-dialogues / graph).  
- Frontend : `frontend/src/components/graph/GraphCanvas.tsx`, `frontend/src/utils/graphStructuralValidation.ts`, nœuds sous `frontend/src/components/graph/nodes/`, `frontend/src/hooks/useDialogueLoader.ts`.

### References

- [Source: `_bmad-output/planning-artifacts/epics/epic-04.md` — Story 4.2, FR37]  
- [Source: `_bmad-output/implementation-artifacts/4-1-valider-structure-nœuds-champs-requis-displayname-stableid-text-fr36.md` — implémentation FR36 et fichiers touchés]  
- [Source: `_bmad-output/project-context.md` — documents vs graphe, tests, chemins API]

## Dev Agent Record

### Agent Model Used

Composer (agent Dev / Amelia — dev-story workflow)

### Debug Log References

_(aucun incident bloquant)_

### Completion Notes List

- AC#2–#4 : messages backend FR37 ; type `missing_dialogue_text` conservé ; `missing_test` message court stable.
- Surlignage : `getValidationHighlightKind` + `CONTENT_COMPLETENESS_ERROR_TYPES` ; priorité rouge structure > orange complétude > surbrillance cycle.
- Panneau : libellés FR37 + bouton « Éditer le nœud » par entrée avec `node_id` (en plus du clic ligne et de « Générer stableID » si applicable).
- Persistance : `runValidationAfterPersist()` dans `saveDialogue` (chemins document+layout et legacy) ; `handleSave` lit seulement `validationErrors` post-save (plus d’appel `validateGraph` dupliqué).
- **🔵 Refactor Task 1** : docstrings `_validate_unity_dialogue_structure` / `_choices_have_exploitable_text` — frontière FR36 vs FR37 documentée.
- **🔵 Refactor Task 2** : `getValidationHighlightKind` dans `graphStructuralValidation.ts` — `before` : `isStructuralValidationErrorType` incluait `missing_dialogue_text` → `after` : ensemble structure réduit à `missing_display_name` + `missing_stable_id` ; complétude via `getValidationHighlightKind`.
- **🔵 Refactor Task 3** : JSDoc fichier `validationPanelLabels.ts` regroupant FR36/FR37 (pas de second module pour éviter sur-fichierage).
- **🔵 Refactor Task 4** : `runValidationAfterPersist` local à `saveDialogue` — `before` : validate après save manuel seulement dans `handleSave` ; autosave sans revalidation — `after` : un seul point après PUT document/layout et après `saveGraphAndWrite`.
- **Revue AI (MEDIUM)** : `test_graph_crud.py` (`test_validate_graph_fr37_*`), `EndNode` + `getValidationHighlightKind`, `broken_reference` → kind structurel canvas dans `graphStructuralValidation.ts`.

### File List

- `_bmad-output/implementation-artifacts/sprint-status.yaml`
- `_bmad-output/implementation-artifacts/4-2-détecter-nœuds-vides-contenu-texte-manquant-fr37.md`
- `services/graph_validation_service.py`
- `tests/services/test_graph_validation_service.py`
- `tests/api/test_graph_crud.py`
- `frontend/src/utils/graphStructuralValidation.ts`
- `frontend/src/components/graph/GraphCanvas.tsx`
- `frontend/src/components/graph/nodes/DialogueNode.tsx`
- `frontend/src/components/graph/nodes/TestNode.tsx`
- `frontend/src/components/graph/nodes/EndNode.tsx`
- `frontend/src/components/graph/validationPanelLabels.ts`
- `frontend/src/components/graph/GraphValidationPanelLists.tsx`
- `frontend/src/store/slices/persistenceSlice.ts`
- `frontend/src/hooks/useDialogueLoader.ts`
- `frontend/src/__tests__/graphStructuralValidation.test.ts`
- `frontend/src/__tests__/GraphCanvas.structuralValidation.test.tsx`
- `frontend/src/__tests__/GraphValidationPanel.test.tsx`
- `frontend/src/__tests__/useGraphStore.test.ts`
- `frontend/src/__tests__/useDialogueLoader.test.ts`

## Change Log

- 2026-04-06 : Implémentation FR37 (messages, orange complétude, panneau, validation post-save) — story passée en `review`.
- 2026-04-06 : Code review (workflow BMAD) — **Changes Requested**, statut `in-progress`, section « Senior Developer Review (AI) » + « Review Follow-ups (AI) ».
- 2026-04-06 : Suivi revue — correctifs **MEDIUM** (tests API FR37, `EndNode` + `getValidationHighlightKind`, `broken_reference` → surlignage structurel canvas) ; story repassée en **`review`**.
- 2026-04-06 : Statut **done** (sprint + story) — confirmation Marc.

---

## Developer context (garde-fous)

### Exigences techniques

- Types d’erreur stables exposés au frontend ; messages en français cohérents avec l’épique.  
- `node_id` renseigné quand disponible pour navigation.

### Conformité architecture

- Respect des couches `api` → `services` ; alignement types TS `frontend/src/types/graph.ts` / API.

### Bibliothèques / frameworks

- Stack existante (FastAPI, Pydantic v2, React 18, React Flow 11, Zustand) — pas de nouvelle dépendance sans justification.

### Structure fichiers

- Pas de second service de validation parallèle ; extensions dans `GraphValidationService` et UI graphe existante.

### Exigences de test

- Unit backend : cas dialogue vide, choix sans texte, testNode sans test, END exempt.  
- Intégration : POST validate.  
- Frontend : tests composant / hook pour surlignage orange vs rouge et libellés.

## Previous story intelligence

- **4.1** a livré `missing_display_name`, `missing_stable_id`, `missing_dialogue_text`, extraction `validationPanelLabels` / `GraphValidationPanelLists`, `graphStructuralValidation.ts`, tests `GraphCanvas.structuralValidation.test.tsx`, et NFR-P3 avec tests perf marqués `slow`.  
- Réutiliser les patterns de **focus** (`useGraphViewStore.focusNode`) et éviter toute régression **mergeNodeFormIntoStoreData** lors des flux d’édition (voir `.cursor/rules/graph_editor.mdc`).

## Git intelligence summary

- Dernier commit pertinent : `feat(validation): FR36 structure graphe, panneau, tests et harnais T0-T3` — la story 4.2 s’appuie directement sur ce socle ; attention aux conflits dans `graph_validation_service.py`, `GraphCanvas.tsx`, `validationPanelLabels.ts`.

## Latest technical information

- Pas d’upgrade framework requis pour FR37 ; vérifier la doc React Flow 11 si l’on touche aux `style` des nœuds contrôlés.

## Project context reference

- Lire `_bmad-output/project-context.md` avant implémentation (chemins API unity-dialogues, interdiction tests sur entités GDD réelles, règles imports Python).

## Senior Developer Review (AI)

**Revue:** agent Dev (Amelia), commande code-review — pour **Marc** — 2026-04-06  
**Outcome:** Changes Requested → follow-ups **MEDIUM** traités (2026-04-06).  
**Git vs File List:** `tests/api/test_graph_crud.py` et `EndNode.tsx` ajoutés au File List après correctifs.

**Preuves exécutées (revue initiale):**

- `pytest tests/services/test_graph_validation_service.py tests/api/test_graph_crud.py::TestGraphValidate` → 21 passed  
- Vitest : `graphStructuralValidation`, `GraphCanvas.structuralValidation`, `GraphValidationPanel`, `useDialogueLoader` → 15 passed  

**Preuves post-correctifs MEDIUM:** `pytest tests/api/test_graph_crud.py::TestGraphValidate::test_validate_graph_fr37_* tests/services/test_graph_validation_service.py` ; `vitest graphStructuralValidation.test.ts` ; `npm --prefix frontend run lint`.

**Synthèse AC:** #1–#6 inchangée côté intention ; écarts MEDIUM revue = résolus (API FR37, EndNode, `broken_reference` sur canvas).

**Revue conjointe (même branche, 2026-04-06) :** pas de nouveau HIGH sur 4.2 ; suivis **LOW** ouverts dans « Review Follow-ups » inchangés (`test_graph_validation_service.py`, `test_graph_validate.py`, `useDialogueLoader.test.ts`).

---

## Story completion status

- **Statut** : `done` (LOW restants optionnels dans « Review Follow-ups »)  
- **Note** : Marqué done (sprint + story) sur confirmation produit — 2026-04-06.
