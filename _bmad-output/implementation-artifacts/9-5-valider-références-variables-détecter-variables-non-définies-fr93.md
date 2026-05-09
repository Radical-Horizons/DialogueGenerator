# Story 9.5: Valider références variables (détecter variables non définies)

Status: done



## Story

As a **concepteur de dialogues**,
I want **valider que toutes les références de variables (flags catalogue) utilisées dans les conditions et les effets sont bien déclarées pour ce dialogue**,
So that **je corrige les oublis avant export/runtime et j’évite des états impossibles à simuler**.

## Acceptance Criteria

1. **Couverture** — Étant donné un document dialogue avec `dialogueFlags` (liaisons FR89), `visibilityConditions` (FR90) et `choiceEffects` (FR91), lorsque la validation références est exécutée, alors tout `flagId` présent dans un atome flag (conditions ou effets) est comparé à l’ensemble des `flagId` déclarés dans `dialogueFlags` à la racine du document, et toute référence absente produit une erreur structurée (chemin du nœud/choix, `stableId` ou identifiant affiché éditeur, libellé lisible).
2. **Erreurs UX** — Étant donné au moins une erreur, lorsque l’utilisateur consulte le rapport, alors chaque entrée permet d’identifier le nœud ou le choix concerné et le type de problème (« flag référencé mais non déclaré dans ce dialogue »), avec possibilité de naviguer vers l’élément dans le graphe (pattern aligné sur surlignage validation existant : `highlightedNodeIds` / erreurs attachées aux nœuds si le modèle le supporte déjà).
3. **Warnings non bloquants** — Étant donné un `flagId` présent dans `dialogueFlags` mais jamais référencé dans aucune condition ni effet, alors un avertissement non bloquant est émis (liste séparée des erreurs), sans empêcher sauvegarde/export.
4. **Suggestions typo** — Étant donné un `flagId` inconnu dans les déclarations mais proche (distance d’édition) d’un id déclaré ou d’un id catalogue, alors la sortie inclut une suggestion optionnelle ; une action « appliquer la correction » peut être proposée au niveau choix/atome (sans magie globale destructive).
5. **Succès & perf** — Étant donné toutes les références flag résolues dans `dialogueFlags`, alors un résumé du type « 0 erreur, N flags utilisés » est disponible ; le coût côté serveur pour un graphe typique reste compatible NFR-P3 (ordre de grandeur **<200 ms** pour documents modestes ; pas de parcours exponentiel).
6. **Cohérence avec l’existant** — La validation catalogue (types, bornes, IDs connus) reste assurée par les chemins existants (`visibility_condition_validation`, `choice_effect_validation`, PUT document). Cette story **ajoute** la couche « déclaration dialogue » — pas de duplication des règles catalogue.

## Tasks / Subtasks

- Task 1 : Agrégation des références flags et règle « doit être dans dialogueFlags » (AC: #1, #6)
  - [x] 🔴 Test échoue : document fixture avec `dialogueFlags` ne listant pas un `flagId` pourtant utilisé dans `visibilityConditions` ou `choiceEffects` → le validateur retourne au moins une erreur avec chemin stable (nœud/choix/atome).
  - [x] 🟢 Implémenter la collecte des `flagId` depuis les blocs structurés déjà parsés (même source que PUT/validation existante) et comparer à l’ensemble dérivé de `dialogueFlags` ; messages localisés FR (voir Dev Notes).
  - [x] 🔵 Refactor : isoler la logique pure dans un module dédié (ex. `services/` + fonctions testables sans I/O) pour garder router ≤ ~30 lignes si nouvel endpoint, ou intégration minimale dans le flux document existant sans gonfler les fichiers >500 ligners.
- Task 2 : Warnings « déclarés mais inutilisés » (AC: #3)
  - [x] 🔴 Test échoue : `dialogueFlags` contient un flag jamais cité dans conditions/effets → au moins un warning avec id flag.
  - [x] 🟢 Produire une liste warnings séparée des erreurs ; ne pas bloquer sauvegarde ; exposition dans la même réponse API ou le même agrégat que les erreurs.
  - [x] 🔵 Refactor : factoriser l’extraction « ids déclarés » vs « ids référencés » pour éviter double parcours coûteux sur gros graphes (un passage + sets).
- Task 3 : Suggestions de correction (Levenshtein / voisinage) (AC: #4)
  - [x] 🔴 Test échoue : flag référencé avec typo vs un id déclaré → suggestion attendue dans la charge utile ; cas sans suggestion si distance trop grande.
  - [x] 🟢 Algorithme déterministe (ex. distance d’édition bornée sur candidats déclarés + optionnellement ids catalogue) ; pas de dépendance LLM.
  - [x] 🔵 Refactor : utilitaires suggestion dans un petit module testé (performance prévisible, pas de O(n²) catalogue complet sans garde).
- Task 4 : Surface API — endpoint dédié ou extension contrat documents (AC: #5, #6)
  - [x] 🔴 Test échoue : pytest appel service ou route → réponse JSON stable (erreurs/warnings/suggestions) ; pas de régression PUT (comportement catalogue inchangé).
  - [x] 🟢 Exposer la validation références (POST dédié sous `/api/v1/documents/...` ou hook propre dans le service déjà invoqué) ; schémas Pydantic dans `api/schemas/` ; injection `ServiceContainer`.
  - [x] 🔵 Refactor : documenter dans OpenAPI/README_API si nouveau chemin ; garder `api/routers/documents.py` sous contrainte taille (délégation).
- Task 5 : Rapport dans l’éditeur graphe (AC: #2)
  - [x] 🔴 Test échoue : RTL ou test store — déclenchement validation → erreurs attachées aux bons ids nœuds/choix ou ouverture panneau avec liste cliquable (selon pattern retenu, aligné `GraphValidationPanel` / erreurs nœuds).
  - [x] 🟢 Panneau ou section liste (nouveau composant ou extension maison) + navigation ; réutiliser conventions surlignage (`highlightedNodeIds`, types d’erreur) existantes pour le graphe.
  - [x] 🔵 Refactor : éviter d’ajouter >300 lignes dans `NodeEditorPanel.tsx` — panneau enfant ou hook dédié (fichiers chauds).

## Dev Notes

- **Garde-fous architecture** : document canonique `GET/PUT /api/v1/documents/{id}` ; logique métier dans `services/` ; injection via `api/container.py`. Aligner les chemins API sur `project-context.md` (pas réinventer `/dialogues/{id}` si le projet utilise `documents`).
- **Réutiliser** : `visibility_condition_validation.py`, `choice_effect_validation.py`, schémas `api/schemas/visibility_conditions.py`, `api/schemas/choice_effects.py`, parseurs déjà utilisés au PUT ; côté frontend, motifs `validationErrors` / `GraphValidationPanel`, patterns epic 4 validation.
- **Périmètre flag vs réputation** : les atomes **flag** (`flag_bool`, `compteur`, `enum`) portent un `flagId` soumis à la règle « déclaré dans dialogueFlags ». Les conditions **réputation** structurées ne passent pas par les liaisons FR89 ; les traiter comme aujourd’hui (validation structure/catalogue) sauf décision produit explicite d’élargir — ne pas bloquer la story sur un faux besoin « réputation dans dialogueFlags ».
- **Qualité bar** : pytest sur agrégateur pur + route/service ; Vitest sur wiring UI ; jeux de données génériques (pas de flags GDD réels en dur).
- **Refactor bar** : défaut dev-story (~300 lignes/fichier touché, fonctions ~60 lignes) sauf exception nommée ici.
- **Fichiers chauds** :
  - `frontend/src/components/graph/NodeEditorPanel.tsx` (**1227 L**) — ne pas concentrer la feature : extraire panneau/hook dédié.
  - `api/routers/documents.py` (**718 L**) — nouvelles routes = minces, délégation service.
  - `services/graph_validation_service.py` (**789 L**) — si intégration validation globale, ajouter pont sans gonfler au-delà du seuil : préférer service dédié références flags.

### Project Structure Notes

- Emplacement probable : `services/` (agrégation + suggestions), `api/schemas/` (réponses), `frontend/src/components/graph/` ou sous-dossier `validation/` pour le panneau liste — cohérent avec preview (`components/graph/preview/`).

### References

- [Source: `_bmad-output/planning-artifacts/epics/epic-09.md` — Story 9.5, FR93, NFR-P3]
- [Source: `_bmad-output/implementation-artifacts/9-4-preview-scénarios-avec-différents-états-de-variables-fr92.md` — preview, pas de persistance, patterns store]
- [Source: `services/visibility_condition_validation.py`, `services/choice_effect_validation.py` — validation catalogue existante]
- [Source: `services/dialogue_flag_validation.py` — normalisation `dialogueFlags`]
- [Source: `_bmad-output/project-context.md` — documents, injection, tests]

## Technical Requirements

- Backend : service dédié « références flags vs déclarations dialogue » + exposition API ; réponses typées (erreurs, warnings, suggestions).
- Frontend : rapport exploitable dans l’éditeur (liste, navigation, distinction erreur/warning).
- Perf : ensemble des règles combinées reste utilisable interactivement sur graphes usuels.

## Architecture Compliance

- FastAPI + `ServiceContainer` ; pas de singletons ; UTF-8 ; schéma document Unity inchangé sauf extension explicitement demandée.

## Library / Framework Requirements

- Stack existante ; Levenshtein peut être implémenté en pur Python ou utilitaire léger déjà présent — éviter nouvelle dépendance lourde sans justification.

## File Structure Requirements

- Nouveau code préféré dans petits modules ; routers minces ; tests miroir sous `tests/services/`, `tests/api/`, `frontend/src/**/*.test.ts(x)`.

## Testing Requirements

- Pytest : cas erreur, warning, suggestion, absence de faux positifs sur document minimal valide.
- Vitest : intégration UI ou store selon pattern retenu pour la navigation vers nœuds.

## Previous Story Intelligence

- **9.4** a livré preview sans persistance, `collectPreviewKeys`, agrégats accessibles/masqués — la validation références doit **composer** avec l’état document réel (`dialogueFlags`), pas uniquement l’état simulé.
- **9.2 / 9.3** ont structuré conditions et effets ; PUT valide déjà catalogue — **ne pas dupliquer** ces contrôles ; ajouter uniquement la couche « déclaré pour ce dialogue ».

## Git Intelligence Summary

- Travaux récents epic 9 : `dialogue_preview_service`, effets/conditions, `documents` router — commits à prolonger avec fichiers distincts pour review lisible ; éviter diff massif sur `graphViewStore` sans besoin.

## Latest Tech Information

- Pas de mise à niveau framework requise pour une distance d’édition locale ; vérifier que toute dépendance ajoutée est approuvée dans `requirements.txt`.

## Project Context Reference

- `_bmad-output/project-context.md` — règles critiques (documents canoniques, injection, pas de données GDD réelles dans les tests).

## Story Completion Status

- **done** — Code-review adversariale passée ; corrections mineures doc/logging/badge ; sprint synchronisé.

## Dev Agent Record

### Agent Model Used

Composer (session agent Cursor)

### Debug Log References

- Pytest `tests/services/test_dialogue_flag_reference_validation.py` : erreur / warning / suggestion / résumé OK.
- Pytest API : `tests/api/test_documents_validate_flag_references.py`, `tests/api/test_graph_validate.py::TestValidateGraphMergedFlagReferences`.
- Vitest : `validateGraph.documentPayload.test.ts`, `graphStructuralValidation.test.ts`.

### Completion Notes List

- **Code review (2026-04-18)** : findings MEDIUM corrigés — `README_API.md` (endpoint `validate-flag-references` + lien `graph/validate` + `document`) ; journalisation `debug` sur parse PyDantic ignoré (traçabilité sans bruit INFO) ; badge survol nœud `dialogue_flag_undeclared` → 🏁. Restent des **LOW** optionnels : bouton « appliquer suggestion » (AC4 *peut*), test perf NFR-P3, focus choix précis depuis le panneau.
- Logique pure `services/dialogue_flag_reference_validation.py` + distance bornée `services/edit_distance.py` ; service injectable `DialogueFlagReferenceValidationService` + conversion `analysis_to_validation_api_payload`.
- API : `POST /api/v1/documents/{id}/validate-flag-references` ; extension `ValidateGraphRequest.document` → merge erreurs FR93 dans `POST .../graph/validate` ; champs `referenced_flag_id` / `suggested_flag_id` sur `ValidationErrorDetail`.
- Frontend : `validateGraph` envoie `document` du store ; libellés/icônes `dialogue_flag_*` ; surlignage structural via `dialogue_flag_undeclared`.
- Injection alignée epic 9 existant : `Depends(get_dialogue_flag_reference_validation_service)` (même motif que visibility/effects), pas d’extension `ServiceContainer` requise pour cette story.
- 🔵 Refactor Task 3 : extraction Levenshtein → `services/edit_distance.py` ; suggestions filtrées par longueur avant distance.
- 🔵 Refactor Task 4 : route documents délègue au service (~45 lignes) ; pas de logique métier dans le handler.
- 🔵 Refactor Task 5 : pas de changement `NodeEditorPanel` — réutilisation `GraphValidationPanel` + types existants.

### File List

- `services/dialogue_flag_reference_validation.py`
- `services/edit_distance.py`
- `services/dialogue_flag_reference_validation_service.py`
- `api/schemas/graph.py`
- `api/schemas/documents.py`
- `api/dependencies.py`
- `api/routers/graph_validation.py`
- `api/routers/documents.py`
- `tests/services/test_dialogue_flag_reference_validation.py`
- `tests/api/test_documents_validate_flag_references.py`
- `tests/api/test_graph_validate.py`
- `frontend/src/types/graph.ts`
- `frontend/src/store/slices/uiSlice.ts`
- `frontend/src/utils/graphStructuralValidation.ts`
- `frontend/src/components/graph/validationPanelLabels.ts`
- `frontend/src/__tests__/validateGraph.documentPayload.test.ts`
- `frontend/src/__tests__/graphStructuralValidation.test.ts`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
- `README_API.md`

### Change Log

- 2026-04-18 — Code-review : doc API FR93, logging parse FR93, icône badge DialogueNode.
- 2026-04-18 — Story 9.5 FR93 : validation références flags vs `dialogueFlags`, endpoint dédié, merge dans validation graphe, UI panneau + suggestions typo.
