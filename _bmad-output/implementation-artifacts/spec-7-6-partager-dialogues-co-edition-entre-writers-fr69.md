---
title: 'Story 7.6 — Partager dialogues en co-édition entre writers (FR69)'
type: 'feature'
created: '2026-07-17'
baseline_commit: 'f6ebb646'
status: 'done'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-7-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-7-5-invites-lecture-seule-sans-compte-fr68.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Un dialogue appartient à un seul writer : un collègue ne peut ni le voir ni l’éditer sans passer par un admin ou copier le fichier. La collaboration sur le même JSON est impossible.

**Approach:** Partages compte-à-compte `permission=writer` dans SQLite ; le propriétaire (ou admin) invite/révoque ; le co-éditeur voit et édite via les mêmes capabilities API ; suppression et gestion des partages restent owner/admin.

## Boundaries & Constraints

**Always:** Table `dialogue_shares` (migration **004**, pas 003 — déjà prise). Seule permission `writer`. Grant/revoke : owner ou admin. Cible = compte `writer` actif existant (invitation par **username**). Co-éditeur : `can_read` + `can_edit` = true, `can_delete` = false, `is_owner` = false. Liste bibliothèque : dialogue partagé visible via `can_list` / `capabilities` (pas besoin d’Epic 8). `last_modified_by` mis à jour sur écriture co-éditeur. Guest JWT 7.5 inchangé. `DISABLE_AUTH` inchangé. Tests auth réelle avec `DISABLE_AUTH=false`.

**Ask First:** Autoriser `can_delete` au co-éditeur ; partage read-only compte ; directory complet des users pour writers (au lieu d’invite par username) ; multi-permission au-delà de `writer` ; notifications hors app.

**Never:** `share_links` / liens URL (toujours différé). Panneau permissions agrégé (7.7). Audit logs (7.8). Co-édition temps réel / présence. Rôle `viewer` en base. Changer le SoT document/révisions. Laisser l’UI seule comme garde.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Grant | Owner partage vers writer B (username) | Ligne `dialogue_shares` ; B voit + édite | 404 user inconnu ; 409 déjà partagé ; 403 non-owner |
| Co-edit | B PUT document partagé | Écriture OK ; `last_modified_by` = B | 403 si share révoqué |
| Revoke | Owner DELETE share | B disparaît de la liste ; GET/PUT → 403 | 404 share absent |
| Delete | B tente DELETE dialogue | Refusé | 403 |
| Guest | Guest sur dialogue partagé | Lecture globale guest inchangée ; pas de share UI | Mutations 403 |
| Admin | Admin grant/revoke/edit | Comme owner | N/A |
| Self-share | Owner s’invite lui-même | Refusé | 400/422 |

</frozen-after-approval>

## Code Map

- `services/repositories/sqlite/migrations/004_dialogue_shares.sql` + `dialogue_shares_repository.py` — table `(document_id, user_id, permission, created_at)` UNIQUE + FKs.
- `services/dialogue_sharing_service.py` — grant/revoke/list ; validation username → user_id.
- `services/document_persistence_service.py` — `capabilities` : owner \| admin \| shared writer (edit sans delete) ; `require_delete`.
- `api/routers/dialogue_shares.py` — `GET/POST/DELETE …/dialogues/{id}/shares`.
- `api/schemas/dialogue_shares.py` + `docs/api/api-contracts-api.md` — contrat shares.
- `api/container.py`, `api/dependencies.py` — injection repo/service.
- `frontend/src/api/dialogueShares.ts` — client shares.
- `frontend/src/components/unityDialogues/DialogueSharingModal.tsx` — invite username, liste, revoke.
- `frontend/src/components/unityDialogues/UnityDialogueDetails.tsx` — bouton Partager owner/admin.
- Tests : `tests/api/test_dialogue_shares.py` ; `DialogueSharingModal.test.tsx`.

## Tasks & Acceptance

**Execution:**
- [x] `services/repositories/sqlite/migrations/004_dialogue_shares.sql` + repository — persister les partages writer.
- [x] `services/dialogue_sharing_service.py` + container — grant/revoke/list par username, owner/admin only.
- [x] `document_persistence_service.py` — étendre `capabilities` / `can_list` pour shared writer (edit, pas delete).
- [x] Routers + schemas + `api-contracts-api.md` — `GET/POST/DELETE /api/v1/dialogues/{id}/shares`.
- [x] `DialogueSharingModal.tsx` + API client + point d’entrée UI owner/admin — collaboration utilisable.
- [x] Tests pytest matrice I/O + Vitest modal + lint — non-régression 7.4/7.5.

**Acceptance Criteria:**
- Given owner ou admin, when partage avec un writer existant, then le dialogue apparaît dans la liste du co-éditeur et l’édition (PUT) est autorisée.
- Given co-éditeur, when il sauvegarde, then `last_modified_by` reflète son id et delete reste 403.
- Given owner, when il révoque le share, then le co-éditeur perd lecture/écriture (403).
- Given non-owner writer, when il tente un grant, then 403 ; guest ne gère pas les shares.

## Spec Change Log

## Design Notes

Epic cite migration `003` pour shares — **stale** : utiliser `004`. Invite par **username** évite d’ouvrir `GET /users` (admin-only) aux writers. Le panneau 7.7 pourra agréger shares ; 7.6 livre le CRUD shares + modal minimal. Guest app-wide (7.5) ≠ lien par dialogue : l’AC epic « sauf lien invité » ne s’applique pas tant que `share_links` est différé.

## Verification

**Commands:**
- `node scripts/getPythonPath.js -m pytest tests/api/test_dialogue_shares.py tests/api/test_dialogues_rbac.py tests/services/test_document_persistence_service.py -q --tb=short` — pass.
- `cd frontend && npx vitest run` (DialogueSharingModal / list permissions) `--reporter=dot` — pass.
- `npm --prefix frontend run lint` — zéro erreur.

## Suggested Review Order

**Persistance & RBAC**

- Table shares + FK CASCADE ; gate actif writer au lookup
  [`004_dialogue_shares.sql:1`](../../../services/repositories/sqlite/migrations/004_dialogue_shares.sql#L1)
  [`dialogue_shares_repository.py:43`](../../../services/repositories/sqlite/dialogue_shares_repository.py#L43)

- Co-éditeur : edit oui, delete non ; `require_delete` séparé
  [`document_persistence_service.py:155`](../../../services/document_persistence_service.py#L155)
  [`document_persistence_service.py:203`](../../../services/document_persistence_service.py#L203)

**Service & API**

- Grant/revoke par username, owner/admin only
  [`dialogue_sharing_service.py:116`](../../../services/dialogue_sharing_service.py#L116)

- Routes GET/POST/DELETE shares + mapping erreurs
  [`dialogue_shares.py:82`](../../../api/routers/dialogue_shares.py#L82)

**UI**

- Modal invite/révoque
  [`DialogueSharingModal.tsx:17`](../../../frontend/src/components/unityDialogues/DialogueSharingModal.tsx#L17)

- Bouton Partager owner/admin
  [`UnityDialogueDetails.tsx:178`](../../../frontend/src/components/unityDialogues/UnityDialogueDetails.tsx#L178)

**Périphériques**

- Matrice I/O API
  [`test_dialogue_shares.py:74`](../../../tests/api/test_dialogue_shares.py#L74)
