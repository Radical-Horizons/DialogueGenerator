# Story 16.1: Schéma JSON v1.1.0 et choiceId (Fondations)

Status: done

## Story

As a **développeur / système**,
I want **que le schéma Unity Dialogue JSON soit en v1.1.0 avec schemaVersion et choices[].choiceId requis**,
so that **tout le pipeline partage une référence unique et les identités (choiceId) sont stables**.

## Acceptance Criteria

1. **Given** le schéma Unity Dialogue JSON (ex. `docs/resources/dialogue-format.schema.json`)  
   **When** un document est validé pour schemaVersion 1.1.0  
   **Then** `schemaVersion` est requis et fixé à `"1.1.0"`  
   **And** chaque entrée dans `choices[]` a un champ `choiceId` requis (format libre, stable).

2. **Given** un document sans choiceId pour schemaVersion >= 1.1.0  
   **When** on tente une validation export (bloquant)  
   **Then** la validation échoue avec erreur structurée (refus document sans choiceId).

3. **Given** le schéma et la validation  
   **When** on valide un document v1.1.0 avec tous les choiceId présents  
   **Then** la validation réussit ; `node.id` reste SCREAMING_SNAKE_CASE ; pseudo-nœud END documenté si référencé (ADR-008).

4. Conformité ADR-008 et objectifs-contraintes : pas de régression sur les scénarios existants (validation, export, tests).

## Tasks / Subtasks

- [x] **Task 1** (AC: 1, 3) – Mettre à jour le schéma JSON v1.1.0
  - [x] 1.1 Définir structure document : **Décision (tranchée)** — racine = **objet** `{ "schemaVersion": "1.1.0", "nodes": [...] }`. Une seule forme pour fichier, API et validation ; document auto-décrit (schemaVersion dans le blob) ; cohérent avec GET/PUT où `document` = ce blob. Pas de racine tableau (évite une seconde SoT : version dans l’enveloppe vs dans le fichier).
  - [x] 1.2 Ajouter `schemaVersion` requis, valeur `"1.1.0"`.
  - [x] 1.3 Ajouter `choiceId` requis dans chaque entrée de `choices[]` (format libre, string stable).
  - [x] 1.4 Conserver `node.id` en SCREAMING_SNAKE_CASE (pattern existant).
  - [x] 1.5 Documenter le pseudo-nœud `END` si référencé (description dans le schéma).
- [x] **Task 2** (AC: 2) – Règle « refus sans choiceId » pour schemaVersion >= 1.1.0
  - [x] 2.1 Implémenter la règle dans le validateur (schema validator et/ou petit helper) : si schemaVersion >= 1.1.0 et un choice sans `choiceId` → échec avec erreur structurée (ex. `code`, `message`, `path`).
  - [x] 2.2 S’assurer que la validation « export » (bloquant) utilise cette règle lorsque connectée (story 16.1 ne change pas l’API ; préparer l’usage futur).
- [x] **Task 3** (AC: 4) – Document de synthèse architecture (optionnel)
  - [x] 3.1 Si absent : créer `docs/architecture/pipeline-unity-backend-front-architecture.md` (synthèse consultant + 6 décisions ADR-008) et lier depuis l’ADR. Si déjà présent, vérifier alignement et lien.
- [x] **Task 4** (AC: 1–4) – Tests et non-régression
  - [x] 4.1 Tests unitaires pour chargement schéma v1.1.0 et validation (avec/sans choiceId, avec/sans schemaVersion).
  - [x] 4.2 Tests pour « refus sans choiceId » (schemaVersion >= 1.1.0) et format d’erreur structurée.
  - [x] 4.3 Vérifier non-régression : `tests/api/utils/test_unity_schema_validator.py`, `tests/integration/test_frontend_backend_validation.py` (chemin vérifié présent), et tout test utilisant `validate_unity_json` ou le schéma.

## Dev Notes

- **Jalon 0 – Fondations.** Pas de changement API ni store ; uniquement schéma et (optionnel) doc. Référence : ADR-008 Technical Design (Modèle de données), `objectifs-contraintes-implementation-adr-008.md`.

### Existants à réutiliser / étendre

- **Schéma** : `docs/resources/dialogue-format.schema.json` — actuellement v1.0.0, racine = tableau de nœuds, pas de `schemaVersion` ni `choiceId`. **À étendre** vers v1.1.0 (ne pas dupliquer ; un seul schéma canonique).
- **Validateur schéma** : `api/utils/unity_schema_validator.py` — charge le schéma, `validate_unity_json(json_data)`. Utilise `jsonschema` (Draft-07). **À étendre** pour v1.1.0 et règle « refus sans choiceId » (ou helper dédié appelable par le validateur).
- **Config validation** : `api/config/validation_config.py` — `enable_unity_schema_validation`, `should_validate_unity_schema`. Pas de changement requis en 16.1.
- **UnityJsonRenderer** : `services/json_renderer/unity_json_renderer.py` — `validate_nodes` (règles métier : ids, refs, END). **Ne pas modifier** en 16.1 ; il reste distinct du validateur schéma. La validation export future pourra combiner les deux.

### GARDE-FOUS (epic 16)

- Vérifier `docs/resources/dialogue-format.schema.json`, `api/utils/unity_schema_validator.py`, `api/config/validation_config.py`.
- Pas de couche de contournement (ex. garder nodes/edges comme SoT).
- Chaque livrable fait progresser vers l’état cible ADR-008.

### Risques et garde-fous (implémentation ADR-008)

À chaque commit, poser la question : **« Est-ce que j’introduis une seconde source de vérité ? »** Si oui → revert.

| Principe | Risque sur 16.1 / suite | Mitigation |
|----------|-------------------------|------------|
| **Save = { document, revision } uniquement** (pas nodes/edges) | 16.1 ne touche pas au save ; 16.2+ : tout chemin qui accepte nodes/edges = alerte rouge. | Story 16.1 : aucun endpoint modifié. À partir de 16.2 : refuser explicitement tout payload autre que document (+ layout si concerné). |
| **IDs d’abord, logique ensuite** ; edge/handle sans choiceId = erreur de conception | Si le schéma ou le validateur n’imposent pas choiceId, les stories suivantes peuvent réintroduire des identités par index. | 16.1 : choiceId requis dans le schéma et refus structuré si manquant (schemaVersion >= 1.1.0). Aucune story ne doit toucher edges/handles sans s’appuyer sur choiceId. |
| **Migration one-shot avant toute feature** ; tous les fichiers en 1.1.0 avant le reste | Faire 16.4 (frontend SoT) avant migration = état mixte, bugs. | Ordre : 16.1 (schéma) → 16.5 (migration) ou au moins outil prêt → puis 16.2, 16.3, 16.4. Ne pas livrer de feature « document canonique » tant que fixtures/codebase ne sont pas en 1.1.0. |
| **Bugs : stabilité IDs, projection déterministe, pas de rebuild complet à la frappe** | 16.1 ne touche pas au frontend ; en 16.4+, toute projection non déterministe ou rebuild complet à la frappe = source de bugs. | En debug : vérifier d’abord stabilité des IDs, projection déterministe, absence de rebuild complet. 80 % des bugs viendront de là. |
| **Trancher : simplicité, suppression d’état, refus explicite** | Tolérance magique (génération choiceId à la volée en prod), double forme (array + object). | Racine document = objet unique (décision 1.1). Validation : refus explicite si schemaVersion >= 1.1.0 et choice absent ; pas de génération à la volée hors chemin migration one-shot. |

### Architecture & conformité

- **ADR-008** : `_bmad-output/planning-artifacts/architecture/v10-architectural-decisions-adrs.md` — modèle de données (schemaVersion, choiceId, node.id SCREAMING_SNAKE_CASE, END).
- **Objectifs / contraintes** : `_bmad-output/planning-artifacts/epics/objectifs-contraintes-implementation-adr-008.md`.
- **Validation et mise en place** : `docs/architecture/validation-et-mise-en-place-decisions.md` — aligner le schéma avec l’ADR, déposer doc de synthèse dans `docs/architecture/` si manquant.

### Stack & librairies

- **jsonschema** : `jsonschema>=4.0.0` (`requirements.txt`). Rester en Draft-07 pour rester compatible avec le schéma actuel.
- Pas de nouvelle dépendance pour 16.1.

### Structure de fichiers

- Schéma : `docs/resources/dialogue-format.schema.json`.
- Validateur : `api/utils/unity_schema_validator.py`.
- Doc optionnelle : `docs/architecture/pipeline-unity-backend-front-architecture.md`.
- Tests : `tests/api/utils/test_unity_schema_validator.py` et tests d’intégration concernés.

### Tests

- Unitaires : schéma v1.1.0 (chargement, validation succès/échec), règle « refus sans choiceId », format d’erreur structurée.
- Non-régression : tous les tests existants qui utilisent le schéma ou `validate_unity_json` doivent rester verts.

### Project Structure Notes

- Respect de l’arborescence existante : `docs/resources/` pour le schéma, `api/utils/` pour le validateur, `docs/architecture/` pour la doc.

### References

- [Source: _bmad-output/planning-artifacts/architecture/v10-architectural-decisions-adrs.md – ADR-008]
- [Source: _bmad-output/planning-artifacts/epics/objectifs-contraintes-implementation-adr-008.md]
- [Source: _bmad-output/planning-artifacts/epics/epic-16.md – Story 16.1, GARDE-FOUS]
- [Source: docs/architecture/validation-et-mise-en-place-decisions.md]
- [Source: docs/resources/dialogue-format.schema.json]
- [Source: api/utils/unity_schema_validator.py]

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

- Schéma v1.1.0 : racine objet, `schemaVersion` "1.1.0", `nodes[]`, `choices[].choiceId` requis, `node.id` SCREAMING_SNAKE_CASE, pseudo-nœud END documenté.
- Validateur : `validate_unity_json` accepte document (dict) ou liste (legacy normalisée). **Code review fix:** suppression rétrocompat schéma v1.0 (ADR-008 : pas de rétrocompat). `validate_unity_json_structured()` retourne erreurs (code, message, path) ; code `missing_choice_id` pour choice sans choiceId.
- Doc : `docs/architecture/pipeline-unity-backend-front-architecture.md` créée (synthèse ADR-008 + 6 décisions). **Code review fix:** `validation-et-mise-en-place-decisions.md` créé (checklist validation ADR-008).
- Tests : TestUnitySchemaV1_1_0 (structure, document valide, sans schemaVersion, choice sans choiceId, erreur structurée, **nouveau:** cas valide `validate_unity_json_structured`). Non-régression : test_unity_schema_validator (13 tests), test_frontend_backend_validation (9 tests), test_unity_json_renderer.
- **Code review fixes (9 issues):**
  - #2 [HIGH]: Suppression rétrocompat schéma v1.0 du validateur (conformité ADR-008)
  - #3 [HIGH]: Tests intégration frontend-backend vérifiés et passent (9/9)
  - #4 [MEDIUM]: `test_prompt_output.txt` ajouté au .gitignore
  - #5 [MEDIUM]: Note TODO Story 16.2 pour connexion export dans docstring
  - #6 [MEDIUM]: `_normalize_to_document()` lève ValueError si input malformé (dict sans 'nodes')
  - #7 [MEDIUM]: Test `validate_unity_json_structured()` cas valide ajouté
  - #8 [LOW]: Commentaire obsolète "Schéma v1.0" supprimé
  - #9 [LOW]: Fichier `validation-et-mise-en-place-decisions.md` créé (lien corrigé)

### File List

- docs/resources/dialogue-format.schema.json (v1.1.0)
- api/utils/unity_schema_validator.py (code review fixes: rétrocompat v1.0 supprimée, validation stricte, TODO Story 16.2)
- docs/architecture/pipeline-unity-backend-front-architecture.md
- docs/architecture/validation-et-mise-en-place-decisions.md (code review fix: créé)
- tests/api/utils/test_unity_schema_validator.py (code review fix: test cas valide ajouté)
- .gitignore (code review fix: test_prompt_output.txt ajouté)
- _bmad-output/implementation-artifacts/sprint-status.yaml
- _bmad-output/implementation-artifacts/16-1-schéma-json-v1-1-0-et-choiceid-fondations.md
