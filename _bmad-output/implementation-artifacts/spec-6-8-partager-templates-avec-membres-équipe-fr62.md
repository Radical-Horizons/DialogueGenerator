---
title: 'Story 6.8 — Partager templates avec membres équipe (FR62)'
type: 'feature'
created: '2026-08-16'
status: 'done'
baseline_commit: '8523137116fae600a0f460006dfc159146dca824'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-6-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Les templates custom sont un pool disque global : on ne peut pas donner un template à un writer précis, ni le retirer, ni distinguer « à moi » / « partagé par X ».

**Approach:** ACL live comme les dialogues 7.6 : `owner_id` sur le JSON, table SQLite `template_shares`, modal username, section « Templates partagés », copie locale pour garder un snapshot après révocation.

## Boundaries & Constraints

**Always:**
- Live : GET = JSON owner ; PUT/DELETE = owner/admin. Destinataire : appliquer (6.3) + copier. Révoquer retire l’accès, pas une copie déjà faite.
- Liste/GET : sans `owner_id` → legacy public ; sinon owner ou `template_shares`. Create : `owner_id` = `current_user.id` (`"guest"` inclus).
- Shares : owner/admin. Legacy et pré-built non partageables (pré-built → 400). Cible = writer actif `users` (username 7.6). Pas d’auto-partage. Guest **peut** share ses templates (pas de `require_non_guest`) mais **pas** être cible.
- Routes avant `/{id}` : `GET/POST /{id}/shares`, `DELETE /{id}/shares/{user_id}`, `POST /{id}/copy`. POST `{username}` → 201/204. UI : **Partager** sur carte owned ; gabarit `DialogueSharingModal` (username, pas `GET /users`) ; section **Templates partagés** + « Partagé par [username] » ; toast au prochain list si `modified` a changé (mémoire session). Narrow. Client API sans `use`.
- Migration **009** `template_shares` : PK `(template_id, user_id)`, FK user → `users` CASCADE, pas de FK fichier. `delete_template` cascade shares. Tests sans LLM.

**Ask First:**
- Permissions lecture vs édition distinctes sur un partagé. Partager un template dont je ne suis pas owner. Destinataire guest / admin. Scoping marketplace 6.6 par user. WebSocket / inbox.

**Never:**
- 6.9, WebSocket, inbox notifications, `GET /users` writers, `TemplateSelector.tsx`, casser 6.1–6.7 / presets / overlay 6.5 / marketplace. Copie silencieuse au share (3B). ACL stricte qui rattache le legacy à admin (1B). `require_non_guest` sur share (2A).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Partager | Owner + username writer | 201 ; destinataire : section Partagés + badge | 404 user ; 400 self ; 409 ; 403 non-owner |
| Guest owner | Guest → writer | 201, pas 403 | 404 si cible guest |
| Appliquer / copy | Destinataire GET ou POST copy | 6.3 ; copy = nouveau `owner_id` + ` (copie)` | 404 hors visibilité / révoqué |
| Màj / révoquer | Owner PUT ou DELETE share | live + toast list ; révocation retire (copie intacte) | 404 share |
| Legacy / pré-built | sans owner / slug | public, pas Partager ; pré-built 400 | N/A |

</frozen-after-approval>

## Code Map

- `services/template_sharing_service.py` + `009_template_shares.sql` -- ACL live, username 7.6
- `services/template_service.py` + `api/schemas/template.py` + `api/routers/templates.py` -- owner_id, shares/copy avant `/{id}`
- `api/container.py` / `api/dependencies.py` -- injection
- `frontend/src/api/templates.ts` + `TemplateSharingModal.tsx` + `PresetSelector.tsx` -- client/UI (gabarit `DialogueSharingModal`)
- Tests : `tests/api/test_templates_share.py`, Vitest, `e2e/templates-share.spec.ts`

## Tasks & Acceptance

**Execution:**
- [x] `009_template_shares.sql` + `template_sharing_service.py` -- table + ACL live
- [x] `template_service.py` + schemas + router -- owner_id, list filtrée, shares, copy
- [x] `templates.ts` + types + `TemplateSharingModal.tsx` + `PresetSelector.tsx` -- UI
- [x] pytest / Vitest / E2E matrice I/O ; lint + typecheck

**Acceptance Criteria:**
- Given owner share un writer : section Partagés, badge, apply 6.3.
- Given PUT owner : destinataire voit le live + toast au reload liste.
- Given révocation : disparu sauf copie ; guest owner → 201 pas 403, guest jamais cible.

## Design Notes

Tous les guests partagent `id="guest"` : leurs customs owned sont un pool guest. Destinataires = FK `users` uniquement. Toast : comparer `metadata.modified` des items `visibility=shared` à une map en mémoire (pas localStorage).

## Verification

**Commands:**
- `node scripts/getPythonPath.js -m pytest tests/api/test_templates_share.py tests/api/test_templates_crud.py --tb short` -- expected: passed
- `npx vitest run src/components/generation/TemplateSharingModal.test.tsx src/__tests__/PresetSelector.test.tsx --reporter=dot` -- expected: passed
- `npx playwright test e2e/templates-share.spec.ts --grep "@smoke"` -- expected: passed
- `npm --prefix frontend run lint` + `npm --prefix frontend run typecheck` -- expected: 0 erreur

## Suggested Review Order

**ACL live (owner JSON + shares SQLite)**

- Point d’entrée : visibilité owned / shared / legacy, grant par username writer.
  [`template_sharing_service.py:59`](../../services/template_sharing_service.py#L59)

- Liste filtrée (pas de dump admin) ; invite owner/admin uniquement.
  [`template_sharing_service.py:172`](../../services/template_sharing_service.py#L172)

- Table `template_shares` : PK composite, FK user CASCADE, pas de FK fichier.
  [`009_template_shares.sql:1`](../../services/repositories/sqlite/migrations/009_template_shares.sql#L1)

**Persistance JSON et HTTP**

- `ownerId` stampé à la création ; champs calculés exclus du disque.
  [`template_service.py:69`](../../services/template_service.py#L69)

- Routes `shares` / `copy` avant `/{id}` ; liste/GET/PUT/DELETE ACL.
  [`templates.py:101`](../../api/routers/templates.py#L101)

- Invite username → 201 ; copy snapshot ` (copie)` owned par l’acteur.
  [`templates.py:664`](../../api/routers/templates.py#L664)

- Publier marketplace : writable only ; `use` reprend `owner_id` de l’acteur.
  [`templates.py:277`](../../api/routers/templates.py#L277)

**UI PresetSelector**

- Bouton Partager si `visibility=owned` (guest inclus) ; section partagés + copie.
  [`PresetSelector.tsx:75`](../../frontend/src/components/generation/PresetSelector.tsx#L75)

- Toast session si `metadata.modified` d’un partagé a changé au reload liste.
  [`PresetSelector.tsx:206`](../../frontend/src/components/generation/PresetSelector.tsx#L206)

- Modal username (gabarit 7.6), pas de `GET /users`.
  [`TemplateSharingModal.tsx:22`](../../frontend/src/components/generation/TemplateSharingModal.tsx#L22)

- GET liste : le serveur gagne ; un partagé révoqué disparaît (create in-flight conservé).
  [`templateStore.ts:59`](../../frontend/src/store/templateStore.ts#L59)

**Tests**

- Matrice I/O API : grant, guest, copy, live PUT, révocation, legacy/pré-built.
  [`test_templates_share.py:120`](../../tests/api/test_templates_share.py#L120)

