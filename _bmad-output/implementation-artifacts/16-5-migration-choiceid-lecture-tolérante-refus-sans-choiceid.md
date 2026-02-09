# Story 16.5: Migration choiceId, tolérance minimale, refus sans choiceId

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **système / opérateur**,
I want **un outil one-shot pour ajouter choiceId aux documents existants, une tolérance minimale limitée à la migration, puis refus strict des docs sans choiceId pour schemaVersion >= 1.1.0**,
so that **la migration soit propre et le format courant soit strict (robustesse d’abord)**.

## Acceptance Criteria

1. **Given** un outil one-shot (script ou commande) existe  
   **When** je l’exécute sur des fichiers/fixtures existants  
   **Then** chaque choice sans choiceId reçoit un choiceId stable (ex. UUID ou dérivé déterministe)  
   **And** les documents sont écrits avec schemaVersion 1.1.0  
   **And** l’outil est idempotent : les choiceId déjà présents ne sont pas modifiés

2. **Given** la lecture (load document) en contexte de migration uniquement  
   **When** un document ancien (sans choiceId ou schemaVersion < 1.1.0) est chargé par l’outil one-shot ou par un chemin dédié migration  
   **Then** une tolérance minimale est appliquée (ex. génération choiceId à la volée pour permettre la migration) ; pas de tolérance en production pour les flux normaux

3. **Given** un document avec schemaVersion >= 1.1.0 n’a pas de choiceId  
   **When** il est chargé ou validé (flux normal, hors migration)  
   **Then** le chargement/validation export refuse le document avec erreur structurée (pas de génération à la volée en production)

4. Conformité ADR-008 et objectifs-contraintes : pas de régression sur les scénarios existants (tests API documents, E2E, validation).

## Tasks / Subtasks

- [ ] **Task 1** (AC: 1) – Outil one-shot migration choiceId
  - [ ] 1.1 Créer script (ex. `scripts/migrate_choiceid.py` ou `scripts/migrate-choiceid.js`) : lit des fichiers JSON (glob ou liste), pour chaque document : si choice sans choiceId → attribuer choiceId stable (UUID ou dérivé déterministe type `choice_${nodeId}_${index}`), écrire document avec schemaVersion "1.1.0", idempotent (ne pas modifier les choiceId existants).
  - [ ] 1.2 Documenter usage (README ou docstring) : cible (dossier/fichiers), dry-run option, backup recommandé.
  - [ ] 1.3 Appliquer l’outil sur les fixtures/données de test existantes si des JSON sans choiceId existent ; vérifier non-régression tests.

- [ ] **Task 2** (AC: 2) – Tolérance minimale uniquement dans le chemin migration
  - [ ] 2.1 Dans l’outil one-shot (ou un module dédié « migration ») : lors de la lecture des fichiers à migrer, autoriser documents sans schemaVersion ou sans choiceId ; générer choiceId à la volée pour permettre l’écriture migrée. Ce comportement est limité à l’exécution du script (pas exposé en API ni au frontend).
  - [ ] 2.2 Ne pas ajouter de flag « mode migration » aux endpoints GET/PUT production : la tolérance ne s’applique que dans le script.

- [ ] **Task 3** (AC: 3) – Refus strict en flux normal (backend + frontend)
  - [ ] 3.1 Backend GET /documents/{id} : après lecture du blob, si document a schemaVersion >= 1.1.0 (ou présent et >= "1.1.0") et qu’au moins un choice n’a pas de choiceId → refuser avec 422 (ou 400) et erreur structurée (code ex. `missing_choice_id`, message, path). Ne pas retourner le document.
  - [ ] 3.2 Backend PUT /documents/{id} : la validation (draft et export) utilise déjà `validate_unity_json_structured` ; pour schemaVersion >= 1.1.0 le schéma exige choiceId → les erreurs sont déjà structurées. S’assurer que le refus (4xx + validationReport) est bien renvoyé et non contournable en draft pour « document v1.1.0 sans choiceId » (conformité ADR-008 : refus strict en production).
  - [ ] 3.3 Frontend : si l’API GET document retourne 422/400 pour missing_choice_id, afficher message utilisateur clair (ex. « Ce dialogue doit être migré avec l’outil de migration choiceId ») et ne pas charger le document en édition.

- [ ] **Task 4** (AC: 4) – Non-régression et tests
  - [ ] 4.1 Tests unitaires outil one-shot : idempotence (ré-exécution ne modifie pas choiceId existants), ajout choiceId sur choice sans choiceId, schemaVersion 1.1.0 en sortie.
  - [ ] 4.2 Tests API : GET document avec document v1.1.0 sans choiceId → 422 (ou 400) et corps d’erreur structuré ; PUT document avec payload v1.1.0 sans choiceId → refus avec validationReport.
  - [ ] 4.3 Conserver tous les tests existants (documents, layout, E2E) et vérifier qu’ils passent après les changements.

## Dev Notes

- **Jalon 4 – Migration et durcissement.** Pas de rétrocompatibilité ; tolérance minimale = migration uniquement. Référence : ADR-008 Migration, décision 5.

### Existants à réutiliser / étendre

- **Schéma** : `docs/resources/dialogue-format.schema.json` — v1.1.0, `choices[].choiceId` requis. Le validateur `api/utils/unity_schema_validator.py` utilise ce schéma ; `validate_unity_json_structured` retourne déjà des erreurs structurées (code `missing_choice_id` pour choiceId manquant). Pas de changement schéma nécessaire pour le refus (déjà en place côté validation PUT).
- **Backend GET** : `api/routers/documents.py` — `get_document` lit le blob et retourne tel quel. **À modifier** : après `_read_document_blob`, si `schemaVersion >= "1.1.0"` (ou équivalent) et au moins un choice sans `choiceId` → lever une exception (ex. ValidationException) avec corps structuré (code, message, path) et status 422 (Unprocessable Entity) ou 400 ; ne pas retourner le document.
- **Backend PUT** : Déjà validation via `validate_unity_json_structured` ; refus en cas d’erreur (draft et export). Vérifier que pour un document v1.1.0 sans choiceId le PUT est bien refusé (pas d’exception « draft autorise » pour missing_choice_id).
- **Frontend** : `frontend/src/api/documents.ts` — `getDocument` ; en cas de 422/400, le store ou l’appelant doit afficher un message utilisateur et ne pas charger le document. Vérifier `frontend/src/store/graphStore.ts` (loadDialogueByDocumentId) pour gérer l’erreur et afficher un message clair.
- **Aucun script de migration choiceId existant** : `scripts/` ne contient pas encore de `migrate_choiceid` ; à créer (Python ou Node selon préférence projet ; le backend et le schéma sont en Python, un script Python réutilisant le schéma/validateur est cohérent).

### GARDE-FOUS (epic 16)

- Vérifier `docs/resources/dialogue-format.schema.json`, `api/routers/documents.py`, `api/utils/unity_schema_validator.py`.
- Pas de couche de contournement : ne pas ajouter de « mode tolérant » permanent en API ; la tolérance est limitée au script one-shot.
- Chaque livrable fait progresser vers l’état cible ADR-008 (refus strict v1.1.0 sans choiceId en production).

### Architecture & conformité

- **ADR-008** : Migration one-shot pour choiceId ; tolérance minimale uniquement dans le chemin migration ; refus document sans choiceId pour schemaVersion >= 1.1.0 en flux normal (décision 5).
- **Objectifs / contraintes** : `_bmad-output/planning-artifacts/epics/objectifs-contraintes-implementation-adr-008.md` — Zéro régression ; volume données à migrer = 0 (codebase + fixtures).

### Stack & librairies

- **Backend** : Python, FastAPI ; réutiliser `api/utils/unity_schema_validator.py` (load_unity_schema, validation) dans le script de migration si le script est en Python ; sinon le script peut parser JSON et ajouter choiceId sans appeler l’API.
- **Frontend** : React, Zustand ; gérer les réponses 422/400 de GET document (message utilisateur, pas de chargement).

### Structure de fichiers

- **Nouveau** : `scripts/migrate_choiceid.py` (recommandé) ou équivalent Node — lecture/écriture fichiers JSON, logique « pour chaque choice sans choiceId → choiceId stable », écriture schemaVersion 1.1.0, idempotence.
- **Modifié** : `api/routers/documents.py` — dans `get_document`, après lecture du document, vérifier schemaVersion et présence choiceId ; si v1.1.0 et choice(s) sans choiceId → ValidationException (422) avec erreur structurée.
- **Modifié** : `frontend/src/store/graphStore.ts` et/ou composant qui appelle loadDialogueByDocumentId — gérer erreur API (422/400) et afficher message « dialogue à migrer » au lieu de charger.

### Tests

- **Script migration** : unit (idempotence, ajout choiceId, schemaVersion 1.1.0 en sortie) ; optionnellement test d’intégration sur un fichier fixture.
- **API** : GET document avec doc v1.1.0 sans choiceId → 422 (ou 400), corps avec code `missing_choice_id` (ou équivalent) ; PUT document v1.1.0 sans choiceId → refus avec validationReport. Tests existants `tests/api/test_documents.py` à étendre.
- **Non-régression** : pytest tests API documents, E2E existants ; pas de régression sur 16.1–16.4.

### Previous story (16.4) intelligence

- Story 16.4 a livré le frontend SoT document + layout, projection avec IDs stables (choiceId, node.id), save envoyant document + layout. Le frontend utilise `documentToGraph` qui a un fallback `__idx_${index}` quand choiceId est absent ; en production après cette story, les documents servis par GET auront tous choiceId (ou seront refusés). Donc le fallback reste pour la rétrocompatibilité côté projection uniquement si un ancien doc était encore en mémoire ; le chargement depuis l’API refusera les docs v1.1.0 sans choiceId.
- Fichiers modifiés en 16.4 : `frontend/src/api/documents.ts`, `frontend/src/store/graphStore.ts`, `frontend/src/utils/documentToGraph.ts`, etc. Pour 16.5 : pas de changement à la projection ni au save côté frontend, sauf gestion d’erreur GET (422/400).
- Code review 16.4 : saveDialogue envoie state.document et state.layout ; addNode/connectNodes/disconnectNodes synchronisent document en mode SoT. Pour 16.5 : s’assurer que les documents créés par le frontend ont bien choiceId (déjà le cas si graphToDocument génère choiceId pour chaque choice) ; le refus GET concerne les documents déjà persistés sans choiceId (migration à faire par l’outil).

### Project Structure Notes

- Alignement avec `docs/architecture/pipeline-unity-backend-front-architecture.md`. Migration = outil hors bande (script) ; flux normal = GET/PUT document avec refus strict v1.1.0 sans choiceId.

### References

- [Source: _bmad-output/planning-artifacts/architecture/v10-architectural-decisions-adrs.md – ADR-008, décision 5 Migration / refus sans choiceId]
- [Source: _bmad-output/planning-artifacts/epics/epic-16.md – Story 16.5, GARDE-FOUS]
- [Source: _bmad-output/planning-artifacts/epics/objectifs-contraintes-implementation-adr-008.md]
- [Source: docs/resources/dialogue-format.schema.json – schemaVersion 1.1.0, choices[].choiceId requis]
- [Source: api/utils/unity_schema_validator.py – validate_unity_json_structured, _error_to_structured]
- [Source: api/routers/documents.py – get_document, put_document]

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### File List
