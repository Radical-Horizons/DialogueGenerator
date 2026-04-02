# Story 16.3: Backend layout – sidecar, même concurrence

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **frontend ou client API**,
I want **que le layout (positions, zoom) soit un artefact distinct persisté côté backend avec les mêmes règles de revision/conflit**,
so that **le layout soit partagé par document et cohérent avec le document**.

## Acceptance Criteria

1. **Given** le layout est un artefact séparé (ex. `*.layout.json` ou équivalent)  
   **When** je sauvegarde ou charge un document  
   **Then** le layout associé est persisté/chargé côté backend (ex. sidecar)  
   **And** le layout est soumis aux mêmes règles de revision et concurrence que le document (GET/PUT layout, 409 sur conflit).

2. Conformité ADR-008 et objectifs-contraintes : pas de régression sur les scénarios existants (tests API documents, E2E, validation).

## Tasks / Subtasks

- [x] **Task 1** (AC: 1) – Endpoint GET /documents/{id}/layout
  - [x] 1.1 Définir schémas : LayoutGetResponse (layout, revision). Layout = objet libre (positions, viewport, etc.) pour React Flow.
  - [x] 1.2 Implémenter GET : lecture `{id}.layout.json` + `{id}.layout.meta` (revision) ; 404 si document ou layout absent.
  - [x] 1.3 Retourner `{ layout, revision }` sans reconstruction.
- [x] **Task 2** (AC: 1) – Endpoint PUT /documents/{id}/layout + revision + 409
  - [x] 2.1 Schémas : PutLayoutRequest (layout, revision), PutLayoutResponse (revision).
  - [x] 2.2 Vérifier que le document existe (sinon 404) ; comparer revision client vs stockée ; si différente → 409 + dernier état (layout, revision).
  - [x] 2.3 En cas de succès : persister layout, incrémenter revision dans .layout.meta, retourner { revision }.
- [x] **Task 3** (AC: 2) – Tests et non-régression
  - [x] 3.1 Tests unitaires/intégration : GET layout 200/404, PUT layout 200, PUT 409 (revision obsolète), layout inexistant.
  - [x] 3.2 Vérifier non-régression : tests existants documents, api/routers, unity_dialogues, graph.

## Dev Notes

- **Jalon 2 – Backend layout.** Référence : ADR-008 Layout partagé. Même mécanisme revision/concurrence que le document (story 16.2).

### Existants à réutiliser / étendre

- **Router documents** : `api/routers/documents.py` — GET/PUT par `document_id`, base_dir = config Unity path, `{id}.json` + `{id}.meta` (revision, updated_at). **Étendre** le même router (ou sous-route) pour layout : `{id}.layout.json` + `{id}.layout.meta` (revision, updated_at). Réutiliser `_safe_document_id`, `get_config_service`, `get_unity_dialogues_path()`, gestion 404/409/ValidationException.
- **Pattern persistance** : `_read_meta` / `_write_meta` lisent/écrivent un .meta JSON avec revision. Dupliquer le pattern pour layout : `_read_layout_meta(base_dir, document_id)`, `_write_layout_meta(base_dir, document_id, revision)` ; `_read_layout_blob`, `_write_layout_blob` pour `{id}.layout.json`. Layout = dict libre (pas de validation schéma Unity ; positions, viewport, nodes position, etc.).
- **Document préalable** : Layout est sidecar au document. GET/PUT layout : le **document** doit exister (fichier `{id}.json` présent), sinon 404. Ainsi on ne crée pas de layout orphelin.
- **Schémas** : `api/schemas/documents.py` — ajouter LayoutGetResponse, PutLayoutRequest, PutLayoutResponse (pas de validationReport pour layout ; pas de validation Unity sur le blob layout).

### GARDE-FOUS (epic 16)

- Vérifier `api/routers/documents.py`, `api/schemas/documents.py`, `docs/architecture/pipeline-unity-backend-front-architecture.md`.
- Pas de couche de contournement : layout = artefact distinct, même concurrence que le document (revision optimiste, 409).
- Chaque livrable fait progresser vers l’état cible ADR-008.

### Architecture & conformité

- **ADR-008** : Layout = artefact séparé (ex. `*.layout.json`), même règles de revision/concurrence que le document. Backend : GET/PUT layout avec revision ; conflit → 409 + dernier état.
- **Pipeline** : `docs/architecture/pipeline-unity-backend-front-architecture.md` — Layout partagé par document, persisté backend, même concurrence.
- **Objectifs / contraintes** : `_bmad-output/planning-artifacts/epics/objectifs-contraintes-implementation-adr-008.md` — Zéro régression.

### Stack & librairies

- **FastAPI** : sous-route du router documents (ex. `@router.get("/{document_id}/layout")`, `@router.put("/{document_id}/layout")`), status 404/409, Pydantic pour request/response. Pas de nouvelle dépendance.

### Structure de fichiers

- **Router** : étendre `api/routers/documents.py` avec GET/PUT `/{document_id}/layout`. Pas de nouveau fichier router.
- **Schémas** : étendre `api/schemas/documents.py` avec LayoutGetResponse, PutLayoutRequest, PutLayoutResponse (layout: Dict[str, Any], revision: int).
- **Persistance** : même base_dir que document ; fichiers `{document_id}.layout.json` et `{document_id}.layout.meta` (revision, updated_at). Nom de fichier meta cohérent : ex. `LAYOUT_META_SUFFIX = ".layout.meta"` pour éviter collision avec `.meta` du document.

### Tests

- GET layout existant (200, layout + revision) ; GET layout inexistant (404) ; GET layout pour document inexistant (404).
- PUT layout nouveau (200, revision 1) ; PUT layout mise à jour revision à jour (200, revision incrémentée) ; PUT layout revision obsolète (409, corps avec dernier layout + revision).
- Non-régression : `tests/api/test_documents.py`, tests existants api/routers, unity_dialogues, graph.

### Previous story (16.2) intelligence

- Story 16.2 a livré GET/PUT document avec `{id}.json` + `{id}.meta` (revision). Réutiliser le même base_dir, même `_safe_document_id`, même gestion config Unity path. Ne pas mélanger revision document et revision layout : deux .meta distincts (document = `{id}.meta`, layout = `{id}.layout.meta`).
- Code review 16.2 : alias ValidationMode dupliqué supprimé, ensure_ascii=False dans _write_meta, TODO validateur mis à jour. Pour layout .meta, utiliser ensure_ascii=False pour cohérence.
- Fichiers modifiés en 16.2 : api/schemas/documents.py, api/routers/documents.py, api/main.py, tests/api/test_documents.py. En 16.3 : étendre documents.py et documents.py (schemas), ajouter tests layout dans test_documents.py ou nouveau test_documents_layout.py.

### Project Structure Notes

- Alignement avec `api/routers/documents.py`, `api/schemas/documents.py`. Layout = sous-ressource du document (REST : /documents/{id}/layout). Pas de service dédié nécessaire si logique reste dans le router comme pour le document.

### References

- [Source: _bmad-output/planning-artifacts/architecture/v10-architectural-decisions-adrs.md – ADR-008 Layout partagé]
- [Source: _bmad-output/planning-artifacts/epics/epic-16.md – Story 16.3, GARDE-FOUS]
- [Source: docs/architecture/pipeline-unity-backend-front-architecture.md]
- [Source: api/routers/documents.py – pattern _read_meta, _write_meta, revision, 409]
- [Source: api/schemas/documents.py – DocumentGetResponse, PutDocumentRequest, PutDocumentResponse]

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

- Task 1: GET /documents/{id}/layout — schémas LayoutGetResponse ; helpers _read_layout_meta, _read_layout_blob ; endpoint GET /{document_id}/layout ; 404 si document ou layout absent.
- Task 2: PUT /documents/{id}/layout — schémas PutLayoutRequest, PutLayoutResponse ; helpers _write_layout_blob, _write_layout_meta, _layout_exists ; endpoint PUT avec revision optimiste, 409 + dernier état si conflit.
- Task 3: Tests TestGetLayout (4), TestPutLayout (5) ; non-régression test_documents (22), unity_dialogues + graph OK.
- Code review 2026-01-30 : test PUT layout 409 (création sans layout, revision != 1) ajouté ; File List clarifiée ; section Senior Developer Review (AI) ajoutée.
- Code review LOW 2026-01-30 : doc limite taille body layout (module + docstring put_layout) ; refactor _resolve_document_base (déduplication validation doc_id/config) ; OpenAPI 409 PUT layout (responses + model LayoutGetResponse).

### File List

- api/schemas/documents.py
- api/routers/documents.py
- tests/api/test_documents.py
- _bmad-output/implementation-artifacts/sprint-status.yaml
- _bmad-output/implementation-artifacts/16-3-backend-layout-sidecar-concurrence.md

*(Changements git hors périmètre 16.3 : data/notion_cache/metadata.json, test_prompt_output.txt — non listés ci-dessus.)*

### Senior Developer Review (AI)

**Date :** 2026-01-30  
**Conclusion :** AC1 et AC2 implémentés. Corrections appliquées suite à la revue.

**Findings traités :**
- **MEDIUM – Test manquant** : Ajout de `test_put_layout_new_with_wrong_revision_returns_409` (PUT layout, document existant sans layout, revision != 1 → 409 + dernier état).
- **MEDIUM – File List vs git** : Note ajoutée sous File List : fichiers modifiés par git mais hors périmètre story (cache, output) non listés.

**Findings LOW traités :**
- Limite taille body layout (DoS) : note en en-tête du module et dans la docstring de put_layout (reverse proxy / middleware en prod).
- Duplication validation : helper _resolve_document_base(document_id, config_service, request_id) → (base_dir, doc_id) ; utilisé par get_document, get_layout, put_layout, put_document.
- OpenAPI 409 PUT layout : paramètre `responses={409: {"description": "...", "model": LayoutGetResponse}}` sur le décorateur put_layout.

### Change Log

- 2026-01-30: Story 16.3 implémentée — GET/PUT /documents/{id}/layout, schémas layout, tests layout + non-régression documents/unity_dialogues/graph.
- 2026-01-30: Code review (AI) — test PUT 409 (création layout), note File List, section Senior Developer Review (AI) ; statut passé à done après corrections.
- 2026-01-30: Code review LOW — doc body size (DoS), refactor _resolve_document_base, OpenAPI 409 PUT layout.
