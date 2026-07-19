---
title: 'Story 7.8 — Audit logs actions utilisateurs (FR71)'
type: 'feature'
created: '2026-07-19'
baseline_commit: '2746d335'
status: 'done'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-7-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-7-7-voir-qui-a-acces-a-chaque-dialogue-fr70.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Les mutations sensibles (users, dialogues, shares) ne laissent qu’un `logger.info` éphémère ; un admin ne peut ni consulter ni exporter une piste d’audit durable pour incidents / conformité interne.

**Approach:** Journal SQLite append-only `audit_logs` alimenté par `AuditLogService.log_action()` depuis les services métier après succès ; API admin paginée + filtres + export CSV/JSON ; panneau admin miroir de la gestion users.

## Boundaries & Constraints

**Always:** Migration **`005_audit_logs.sql`** (004 = shares déjà livré — corriger l’epic). Colonnes minimales : `id`, `created_at` (UTC ISO), `actor_user_id` (nullable si système), `actor_username` (snapshot), `action` (string stable), `target_type`, `target_id`, `metadata` (JSON text). Actions couvertes MVP : `user.created`, `user.role_status.updated`, `dialogue.saved`, `dialogue.deleted`, `dialogue.share.granted`, `dialogue.share.revoked`. Appels **uniquement** après mutation réussie dans `AuthService`, `DocumentPersistenceService`, `DialogueSharingService` — pas middleware seul. `GET /api/v1/audit-logs` : `require_admin`, pagination (`page`/`page_size`), filtres optionnels `user_id` | `username`, `action`, `start_date`, `end_date`. Export admin CSV et JSON (même filtres). Writers → 403. UI : `AuditLogsPanel` sous `/admin/audit-logs`, lien Header admin. `DISABLE_AUTH` / guest démo inchangés ; tests auth réelle avec `DISABLE_AUTH=false` ; DB temp jamais `data/app.db`. Aucun UPDATE/DELETE métier sur `audit_logs`.

**Ask First:** Auditer l’émission JWT guest (`auth.guest_issued`) ; colonnes IP/user-agent ; rétention / purge automatique.

**Never:** Table `share_links` / revoke lien invité per-dialogue. Historique de versions document (Epic 10). SIEM externe. Édition/suppression d’entrées d’audit via API. Accès writer/guest au panneau ou aux endpoints. Remplacer les logs applicatifs existants (compléter, ne pas supprimer `logger.info` 7.3).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Persist | Mutation listée réussit | 1 ligne append-only avec action + actor + target | Échec audit loggé ; ne pas rollback la mutation métier (best-effort write) |
| List admin | Admin GET filtres + page | Page d’entrées triées `created_at` DESC | 403 writer/guest ; 422 filtres invalides |
| Export | Admin CSV ou JSON + filtres | Fichier téléchargeable cohérent avec filtres | 403 non-admin |
| Writer | Writer GET/export | Refus | 403 |
| Empty | Aucune ligne / filtres trop étroits | Liste vide `total=0` | N/A |
| Append-only | Tentative UPDATE/DELETE SQL repo | Pas d’API mutante ; repo expose insert + select seulement | N/A |

</frozen-after-approval>

## Code Map

- `services/repositories/sqlite/migrations/005_audit_logs.sql` — DDL + index (`created_at`, `actor_user_id`, `action`).
- `services/repositories/sqlite/audit_logs_repository.py` — `insert`, `list_filtered` (paginé), pas d’update/delete.
- `services/audit_log_service.py` — `log_action(...)` ; DI via `api/container.py`.
- `api/services/auth_service.py` — hooks create/update user (remplacer/compléter les `action:` logger).
- `services/document_persistence_service.py` (ou chemin réel write/delete) — hooks save/delete.
- `services/dialogue_sharing_service.py` — hooks grant/revoke.
- `api/schemas/audit_logs.py` + `api/routers/audit_logs.py` — list + export ; register router.
- `api/utils/pagination.py` + pattern `api/routers/llm_usage.py` — pagination/filtres dates.
- `docs/api/api-contracts-api.md` — contrat endpoints.
- `frontend/src/api/auditLogs.ts` — client list/export.
- `frontend/src/components/admin/AuditLogsPanel.tsx` — table + filtres + export.
- `frontend/src/App.tsx` + `frontend/src/components/layout/Header.tsx` — route `/admin/audit-logs` + nav admin.
- Tests : `tests/api/test_audit_logs.py` (+ hooks services) ; Vitest `AuditLogsPanel.test.tsx`.

## Tasks & Acceptance

**Execution:**
- [x] `005_audit_logs.sql` + `audit_logs_repository.py` — fondation append-only + requêtes filtrées.
- [x] `audit_log_service.py` + wire container + hooks Auth / Document / Sharing — persistance après succès.
- [x] Router/schemas + `api-contracts-api.md` — list paginée + export CSV/JSON admin-only.
- [x] `AuditLogsPanel.tsx` + client + App/Header — surface admin FR71.
- [x] Tests pytest matrice I/O + Vitest panel + lint — 403 writer, filtres, append-only.

**Acceptance Criteria:**
- Given mutation MVP réussie, when consultation admin, then une entrée correspondante existe (action + actor + target).
- Given admin, when filtres user/action/période + export CSV/JSON, then résultats cohérents avec les filtres.
- Given writer ou guest, when GET ou export audit, then 403.
- Given repository, when usage normal, then aucune API ne permet UPDATE/DELETE d’une entrée d’audit.

## Spec Change Log

## Design Notes

Epic dit « migration 004 » pour audit — **périmé** (004 = `dialogue_shares`). Guest revoke / `share_links` hors scope (7.5 = JWT démo). Échec d’écriture audit : best-effort (log + continue) pour ne pas casser save/share ; documenter dans Design Notes d’implémentation. Taxonomy d’actions alignée sur les `action:` déjà loggées en 7.3 (`user.created`, `user.role_status.updated`).

## Verification

**Commands:**
- `node scripts/getPythonPath.js -m pytest tests/api/test_audit_logs.py -q --tb=short` — pass.
- `cd frontend && npx vitest run src/components/admin/AuditLogsPanel.test.tsx --reporter=dot` — pass.
- `npm --prefix frontend run lint` — zéro erreur.

## Suggested Review Order

**Persistence append-only**

- DDL + indexes for the durable audit trail
  [`005_audit_logs.sql:1`](../../services/repositories/sqlite/migrations/005_audit_logs.sql#L1)

- Best-effort `log_action` after successful mutations only
  [`audit_log_service.py:27`](../../services/audit_log_service.py#L27)

- Filtered page + export result including truncation totals
  [`audit_logs_repository.py:99`](../../services/repositories/sqlite/audit_logs_repository.py#L99)

**Service hooks**

- Wire audit into Auth / Document / Sharing via container
  [`container.py:171`](../../api/container.py#L171)

- User create + role/status mutations
  [`auth_service.py:100`](../../api/services/auth_service.py#L100)

- Dialogue save/delete after file+index success
  [`document_persistence_service.py:446`](../../services/document_persistence_service.py#L446)

- Share grant/revoke
  [`dialogue_sharing_service.py:236`](../../services/dialogue_sharing_service.py#L236)

**Admin API**

- Admin-only list with date-range validation
  [`audit_logs.py:73`](../../api/routers/audit_logs.py#L73)

- CSV formula neutralization + truncation headers on export
  [`audit_logs.py:60`](../../api/routers/audit_logs.py#L60)

**Admin UI**

- Panel filters, pagination clamp, export download
  [`AuditLogsPanel.tsx:75`](../../frontend/src/components/admin/AuditLogsPanel.tsx#L75)

- Route + Header entry for admins
  [`App.tsx:218`](../../frontend/src/App.tsx#L218)

**Tests**

- Matrice I/O API (persist, filters, 403, export, CSV safety)
  [`test_audit_logs.py:84`](../../tests/api/test_audit_logs.py#L84)
