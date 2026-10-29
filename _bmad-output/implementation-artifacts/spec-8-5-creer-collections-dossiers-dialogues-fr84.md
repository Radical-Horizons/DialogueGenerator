---
title: 'Story 8.5 — Créer des collections/dossiers de dialogues (FR84)'
type: 'feature'
created: '2026-08-04'
status: 'done'
baseline_commit: 'fb9168ca904d54ac59e7cab66712d0f06efd0b47'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-8-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-8-4-trier-dialogues-taille-preference-fr83.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** FR84 exige d’organiser les dialogues en collections (N-N) : créer/éditer/supprimer, y ajouter des dialogues, filtrer la bibliothèque, badges cliquables — sans jamais supprimer les dialogues.

**Approach:** SQLite (`collections` + `collection_dialogues`) + API `/api/v1/collections` + sidebar/modal. Réutiliser la sélection batch pour « Ajouter à collection ». Filtre et badges via jointure client sur `document_id`. Privé par `owner_id` ; hors partage et DnD.

## Boundaries & Constraints

**Always:**
- Migration `006_*.sql` ; FK `owner_id→users`, `document_id→dialogues_index` (CASCADE items).
- `CollectionService` + repo (pattern shares) ; scoping `current_user["id"]` ; mutations `require_non_guest`.
- N-N : multi-collections OK ; DELETE collection = liens seulement, jamais les `.json` dialogues.
- UI : sidebar ; modal (nom requis, description + emoji optionnels) ; add via `checkedDocumentIds` ; `activeCollectionId` dans `useDialogueListData` (après search/date/auteur) ; badges sur `UnityDialogueItem`.
- Message delete : compter les memberships retirés.

**Ask First:**
- Partage de collections → hors MVP.
- Enrichir `GET /unity-dialogues` côté serveur → seulement si join client insuffisant.

**Never:**
- Pas de stockage JSON ad-hoc pour membership ; pas de DnD ; pas de cascade fichiers dialogue ; pas de polish toolbar hors besoin.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Behavior |
|----------|--------------|-------------------|
| Créer | POST « Chapitre 1 » + icon | 201 ; sidebar ; vide |
| Ajouter | 2 docs cochés → C | membres 2 ; filtre C = 2 |
| Multi | même doc dans C1+C2 | 2 badges |
| Filtrer / badge | clic sidebar ou badge C | `activeCollectionId=C` |
| Renommer | PUT name | UI à jour ; docs inchangés |
| Supprimer | DELETE C (3 membres) | docs restent ; msg « 3 retirés » |
| Re-add | doc déjà membre | no-op 200 |
| Doc inconnu / non-owner | add bad id / autre user | 404 |
| Guest mutate | POST/PUT/DELETE/add | 403 |

</frozen-after-approval>

## Code Map

- `services/repositories/sqlite/migrations/006_collections.sql` -- tables
- `services/repositories/sqlite/collections_repository.py` -- CRUD + membership
- `services/collection_service.py` -- owner scoping
- `api/schemas/collections.py` + `api/routers/collections.py` -- contrat HTTP
- `api/container.py` + `dependencies.py` + `main.py` -- wiring
- `tests/services/repositories/sqlite/test_migrations.py` + `tests/api/test_collections.py`
- `frontend/src/api/collections.ts` + `types/api.ts`
- `frontend/src/components/unityDialogues/CollectionManager.tsx` -- sidebar + modal
- `UnityDialogueList.tsx` / `UnityDialogueItem.tsx` / `useDialogueListData.ts` -- intégration
- Vitest : manager, item badges, hook filtre

## Tasks & Acceptance

**Execution:**
- [x] Migration 006 + EXPECTED_MIGRATION_VERSIONS
- [x] Repository + CollectionService (CRUD, add/remove, delete count)
- [x] Router/schemas/DI + pytest matrice I/O
- [x] Client API + types
- [x] CollectionManager (sidebar, modal, ConfirmDialog delete)
- [x] Liste : sidebar + « Ajouter à collection » (batch)
- [x] Hook `activeCollectionId` + badges item cliquables
- [x] Vitest ciblés + non-régression liste

**Acceptance Criteria:**
- Given création « Chapitre 1 », when sauvegarde, then sidebar (vide).
- Given docs cochés ajoutés à C, when filtre C, then seuls ces docs.
- Given doc dans 2 collections, when liste, then 2 badges ; clic active le filtre.
- Given delete collection, when confirmé, then liens partis, dialogues intactes, message avec compte.
- Given rename, when sauvé, then libellés à jour sans toucher aux fichiers.

## Design Notes

Clé `document_id` (comme shares). `GET /collections` expose `dialogue_ids[]` ; map client pour badges/filtre. Membres : `POST|DELETE /collections/{id}/dialogues` body `{ document_ids }`.

## Verification

**Commands:**
- `node scripts/getPythonPath.js -m pytest tests/api/test_collections.py tests/services/repositories/sqlite/test_migrations.py -q` -- pass
- `npm --prefix frontend run test -- --run src/hooks/useDialogueListData.test.ts src/api/collections.test.ts src/components/unityDialogues/` -- pass
- `npm --prefix frontend run lint` -- zéro erreur

## Suggested Review Order

**Persistance & API**

- Tables collections + membership N-N avec FK CASCADE
  [`006_collections.sql:1`](../../services/repositories/sqlite/migrations/006_collections.sql#L1)

- Scoping owner + CRUD métier
  [`collection_service.py:62`](../../services/collection_service.py#L62)

- Contrat HTTP `/api/v1/collections`
  [`collections.py:58`](../../api/routers/collections.py#L58)

**UI bibliothèque**

- Sidebar + modal création/édition
  [`CollectionManager.tsx:47`](../../frontend/src/components/unityDialogues/CollectionManager.tsx#L47)

- Intégration liste, sélection batch, filtre
  [`UnityDialogueList.tsx:490`](../../frontend/src/components/unityDialogues/UnityDialogueList.tsx#L490)

- Filtre `activeCollectionId` post search/date/auteur
  [`useDialogueListData.ts:197`](../../frontend/src/hooks/useDialogueListData.ts#L197)

- Badges collections cliquables
  [`UnityDialogueItem.tsx:204`](../../frontend/src/components/unityDialogues/UnityDialogueItem.tsx#L204)

**Tests**

- Matrice API I/O
  [`test_collections.py:74`](../../tests/api/test_collections.py#L74)
