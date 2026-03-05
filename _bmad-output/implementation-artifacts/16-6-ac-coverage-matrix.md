# Story 16.6 – Matrice de couverture AC 16.1–16.5

Chaque AC des stories 16.1 à 16.5 est couvert par au moins un test (unit, API ou E2E).

## 16.1 – Schéma JSON v1.1.0 et choiceId

| AC | Test(s) |
|----|--------|
| schemaVersion requis, choices[].choiceId requis | `tests/api/utils/test_unity_schema_validator.py` – test_schema_v1_1_0_* |
| Document sans choiceId (schemaVersion >= 1.1.0) → validation échoue | `test_unity_schema_validator.py` – test_document_v1_1_0_without_choice_id_* |

## 16.2 – Backend document GET/PUT, revision, 409

| AC | Test(s) |
|----|--------|
| GET → document, schemaVersion, revision | `tests/api/test_documents.py` – TestGetDocument.test_get_document_* |
| PUT valide + revision à jour → 200, revision, validationReport | `test_documents.py` – TestPutDocument.test_put_document_success_* |
| PUT revision obsolète → 409 + dernier état | `test_documents.py` – test_put_document_conflict_409_*, test_put_document_concurrent_* |
| Payload nodes/edges refusé (400) | `test_documents.py` – test_put_document_nodes_edges_payload_rejected_400 |
| Draft vs export (validation) | `test_documents.py` – TestPutDocumentDraftVsExport.* |

## 16.3 – Backend layout, sidecar, concurrence

| AC | Test(s) |
|----|--------|
| GET/PUT layout, revision, 409 | `test_documents.py` – TestGetLayout.*, TestPutLayout.* (test_put_layout_conflict_409_*) |

## 16.4 – Frontend SoT document + layout, projection, IDs stables

| AC | Test(s) |
|----|--------|
| Projection document → nodes/edges, IDs stables (choiceId, edgeId) | `frontend/src/__tests__/documentToGraph.test.ts` – stable IDs, edgeId unchanged on retarget |
| Save envoie document (pas nodes/edges) | `frontend/src/__tests__/graphStore.documents.test.ts` – load/save, updateNode preserves edge id |
| E2E édition / connect / reload layout | `e2e/documents-layout-adr008.spec.ts` – Task 2.1, 2.2, 2.4 |

## 16.5 – Migration choiceId, refus sans choiceId

| AC | Test(s) |
|----|--------|
| Outil one-shot idempotent (choiceId existants non modifiés) | `tests/scripts/test_migrate_choiceid.py` – test_idempotent_does_not_modify_existing_choice_ids |
| GET document v1.1.0 sans choiceId → 422 | `test_documents.py` – test_get_document_v1_1_0_without_choice_id_returns_422 |
| PUT draft/export refuse doc sans choiceId | `test_documents.py` – TestPutDocumentDraftVsExport.* |

## Scénarios couverts par les suites

- **tests/api/test_documents.py** : GET/PUT document, GET/PUT layout, 409, check-migration, GET 422 sans choiceId.
- **tests/api/test_unity_schema_validator.py** : schéma v1.1.0, choiceId requis, erreurs structurées.
- **tests/scripts/test_migrate_choiceid.py** : migration, idempotence, legacy list.
- **frontend/src/__tests__/documentToGraph.test.ts** : projection, edgeId stable, 4/8 choices.
- **frontend/src/__tests__/graphStore.documents.test.ts** : loadDialogueByDocumentId, saveDialogue, updateNode, edge id stable.
- **e2e/documents-layout-adr008.spec.ts** : API seed, édition, connect/disconnect, drag+save, dupliquer (skip si 1.7 non dispo).
- **e2e/perf-document-load.spec.ts** : p95 load (optionnel).
