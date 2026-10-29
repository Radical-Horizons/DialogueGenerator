---
title: 'Story 8.6 — Indexer les dialogues pour recherche rapide 1000+ (FR85)'
type: 'feature'
created: '2026-08-04'
status: 'done'
baseline_commit: '7ff39d341869ba43e5b488f7aa429a838b46c40c'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-8-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-8-5-creer-collections-dossiers-dialogues-fr84.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-8-2-rechercher-dialogues-fr81.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** FR85 exige une recherche &lt;200 ms à 1000+ dialogues. Aujourd’hui chaque listing re-parse les JSON et le filtre FR81 reste 100 % client — trop lent et non indexé.

**Approach:** Index SQLite **FTS5** + `DialogueIndexService` (upsert/delete sur write/delete document). `GET` search serveur + front debouncé. Admin : `POST /admin/reindex` (background) + panneau stats. Pas d’Elasticsearch/Whoosh.

## Boundaries & Constraints

**Always:**
- Migration `007_*.sql` : contenu indexable (document_id, title, speakers, search_text, …) + table virtuelle FTS5 liée ; FK/cascade cohérente avec `dialogues_index`.
- Extraire `_extract_speakers_and_text` (+ title/node_count) vers module partagé réutilisé par listing Unity et l’indexeur (même troncature ~2000 car.).
- Hooks dans `DocumentPersistenceService.write_document` / `delete_document` — pas dans chaque router.
- Search API authentifiée, scoped RBAC (mêmes documents visibles que le listing). Query `q` ; réponse ids/filenames + métadonnées légères pour hydrater la liste.
- Front : debounce search (≥250 ms) → API ; si `q` vide, comportement listing actuel (pas de round-trip search).
- Admin only : reindex 202 + job unique (`asyncio.create_task` + `to_thread`, pas de double run) ; stats : count indexés, last_rebuild_at, taille approx, last_search_ms (best-effort).
- Lieu/thème absents du JSON Unity → hors index (comme 8.2).

**Ask First:**
- Elasticsearch / service externe.
- Remplacer entièrement `GET /unity-dialogues` par search-only (garder listing pour browse/filtres date/auteur/collections).

**Never:**
- Pas de Whoosh/ES ; pas de re-parse N fichiers à chaque frappe search.
- Pas de régression filtres FR82 / tri FR83 / collections FR84 quand `q` est vide.
- Pas d’exiger un corpus de 1000 fichiers en CI : tester logique FTS + micro-bench / seuil unitaire, pas un dump prod.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Behavior |
|----------|--------------|-------------------|
| Index write | PUT document nouveau/modifié | upsert FTS ; searchable immédiatement |
| Index delete | DELETE document | retiré FTS ; plus dans search |
| Search hit | `q` match title/speaker/line | résultats &lt;200 ms cible ; casse-insensitive |
| Search empty q | `q` blanc | 400/422 ou front n’appelle pas |
| Search no hit | terme inconnu | `[]` 200 |
| RBAC | writer B cherche doc privé A | absent des résultats |
| Reindex | admin POST | 202 ; rebuild scan disque ; status idle→running→done |
| Reindex concurrent | 2e POST pendant run | 409 |
| Reindex non-admin | writer/guest | 403 |
| Stats | admin GET | count, last_rebuild, size, last_search_ms |
| Legacy files | JSON hors `dialogues_index` | inclus au reindex si lisibles ; sinon skip + log |

</frozen-after-approval>

## Code Map

- `services/repositories/sqlite/migrations/007_dialogues_search_fts.sql` -- FTS5 + meta
- `services/unity_dialogue_search_fields.py` -- extracteur partagé
- `services/repositories/sqlite/dialogues_search_repository.py` -- upsert/delete/search/stats
- `services/dialogue_index_service.py` -- index/remove/search/rebuild/get_stats
- `services/document_persistence_service.py` -- hooks write/delete
- `api/routers/unity_dialogues.py` -- consomme extracteur partagé
- `api/routers/dialogues.py` ou search dédié -- `GET .../search?q=`
- `api/routers/admin.py` -- reindex + search-stats
- `api/container.py` + `dependencies.py` -- wiring
- `frontend/src/api/dialogueSearch.ts` (+ admin client)
- `frontend/src/hooks/useDialogueListData.ts` -- debounce → API si q non vide
- `frontend/src/components/admin/` -- onglet index / stats + bouton réindexer
- Tests : migrations, index service, API search/reindex/stats, Vitest debounce hook + admin panel

## Tasks & Acceptance

**Execution:**
- [x] Migration 007 FTS5 + EXPECTED_MIGRATION_VERSIONS
- [x] Extracteur partagé + repo search + DialogueIndexService
- [x] Hooks DocumentPersistenceService
- [x] GET search + admin reindex/stats + DI
- [x] Front search debouncée + panneau admin stats/reindex
- [x] Tests matrice I/O (pytest) + Vitest ciblés

**Acceptance Criteria:**
- Given un dialogue sauvegardé, when je cherche un mot de sa réplique, then il apparaît via l’API search sans re-parser toute la bibliothèque.
- Given suppression, when je cherche, then il n’apparaît plus.
- Given admin, when je lance réindexer, then job background unique et stats mises à jour à la fin.
- Given `q` vide dans la bibliothèque, when j’utilise filtres/tri/collections, then comportement 8.2–8.5 inchangé.

## Design Notes

FTS5 `unicode61` + colonnes title/speakers/body. Content table miroir pour stats/count. Listing Unity peut continuer à exposer speakers/search_text (compat) mais la frappe search ne doit plus filtrer localement le corpus complet. Perf CI : assert MATCH sur fixture ~N docs + chronométrage soft (warning si &gt;200 ms local, fail seulement si absurde).

## Verification

**Commands:**
- `node scripts/getPythonPath.js -m pytest tests/api/test_dialogue_search.py tests/services/test_dialogue_index_service.py tests/services/repositories/sqlite/test_migrations.py -q` -- pass
- `npm --prefix frontend run test -- --run src/hooks/useDialogueListData.test.ts src/components/admin/` -- pass
- `npm --prefix frontend run lint` -- zéro erreur

## Suggested Review Order

**Index FTS**

- Service d'indexation / search / rebuild
  [`dialogue_index_service.py:42`](../../services/dialogue_index_service.py#L42)

- Migration FTS5 + meta rebuild
  [`007_dialogues_search_fts.sql:1`](../../services/repositories/sqlite/migrations/007_dialogues_search_fts.sql#L1)

- Hooks write/delete document
  [`document_persistence_service.py:486`](../../services/document_persistence_service.py#L486)

**API & admin**

- `GET /unity-dialogues/search`
  [`unity_dialogues.py:357`](../../api/routers/unity_dialogues.py#L357)

- Reindex 202 + stats admin
  [`admin.py:174`](../../api/routers/admin.py#L174)

**Frontend**

- Debounce + FTS aligné sur query
  [`useDialogueListData.ts:141`](../../frontend/src/hooks/useDialogueListData.ts#L141)

- Panneau admin index
  [`SearchIndexPanel.tsx:1`](../../frontend/src/components/admin/SearchIndexPanel.tsx#L1)

**Tests**

- Matrice API search / reindex
  [`test_dialogue_search.py:1`](../../tests/api/test_dialogue_search.py#L1)
