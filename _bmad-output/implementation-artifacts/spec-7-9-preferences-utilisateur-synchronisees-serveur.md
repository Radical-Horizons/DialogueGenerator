---
title: 'Story 7.9 — Préférences utilisateur synchronisées serveur'
type: 'feature'
created: '2026-07-19'
baseline_commit: 'cb71d8ed'
status: 'done'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-7-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-7-8-audit-logs-actions-utilisateurs-fr71.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Les réglages contexte et génération restent en localStorage : un writer qui change de poste ou de navigateur repart de zéro, alors que `user_settings` existe déjà en SQLite sans API ni sync.

**Approach:** Exposer `GET/PUT /api/v1/users/me/settings` (namespaces `context` + `generation`) comme source de vérité ; hydrater et persister depuis les stores frontend après login compte ; migrer localStorage en best-effort si le serveur est vide.

## Boundaries & Constraints

**Always:** Table `user_settings` (migration **001**, pas de nouvelle migration). Endpoints authentifiés non-guest : `GET /api/v1/users/me/settings`, `GET …/settings/{namespace}`, `PUT …/settings/{namespace}`. Namespaces autorisés : `context` | `generation` uniquement. Payload namespace = map `key → JSON`. Clés attendues : `context` → `config` (blob partialize `contextConfigStore`) ; `generation` → `author_profile` (string), `draft` (objet `generation_draft`), `slop_detection` (objet slop v1). `require_non_guest` + user avec ligne `users` (FK) ; guest → 403. Frontend : hydratation post-login / `fetchCurrentUser` (rôle ≠ guest) ; PUT debounced ou à sauvegarde explicite des réglages ; localStorage reste cache local. Migration 1er login : pousser LS vers serveur **seulement** si les clés serveur absentes — jamais écraser. Isolation par `user_id`. Tests auth réelle (`DISABLE_AUTH=false`) + DB temp. Sous `DISABLE_AUTH`, résoudre le user SQLite seed `admin` par username pour la FK (pas l’id mock `"1"`).

**Ask First:** Namespace `ui` ; sync des clés hors epic (`llm-provider`, `narrative_guides_store`, system prompt / scene instructions standalone) ; mode offline réel.

**Never:** Endpoints settings pour guests. Nouvelle table ou migration 006 pour ce seul besoin. Remplacer les stores par un fetch synchrone bloquant au boot. Écraser des prefs serveur déjà présentes. Panneau admin dédié aux prefs user. Audit de chaque PUT settings (hors scope 7.8 MVP).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Round-trip | Writer PUT namespace puis GET | Valeurs persistées isolées à cet user | 422 namespace/clés invalides |
| Hydrate | Login compte + serveur a des prefs | Stores UI alignés sur API | Erreur GET : garder LS + toast/log |
| Migrate | LS plein, serveur vide | Upsert best-effort des clés absentes | Échec migrate loggé ; app utilisable |
| No overwrite | LS + serveur déjà peuplé | Serveur gagne ; pas de PUT migrate | N/A |
| Guest | JWT guest GET/PUT settings | Refus | 403 |
| Isolation | User A écrit ; User B lit | B ne voit pas A | N/A |
| Empty | Compte neuf sans LS | GET `{}` / namespaces vides ; stores défauts | N/A |

</frozen-after-approval>

## Code Map

- `services/repositories/sqlite/migrations/001_initial.sql` — DDL `user_settings` déjà présent.
- `services/repositories/sqlite/app_settings_repository.py` — pattern JSON + upsert à miroiter.
- `services/repositories/sqlite/user_settings_repository.py` — **à créer** : get_all / get_namespace / upsert_namespace.
- `api/container.py` + `api/dependencies.py` — DI `get_user_settings_repository`.
- `api/schemas/users.py` (ou `user_settings.py`) + `api/routers/users.py` (ou `user_settings.py`) — GET/PUT me/settings.
- `api/dependencies.py` — `require_non_guest`, `get_current_user`.
- `docs/api/api-contracts-api.md` — contrat endpoints.
- `frontend/src/store/contextConfigStore.ts` — LS `context_config_store` → clé API `config`.
- `frontend/src/hooks/useAuthorProfile.ts` — LS `dialogue_generator_saved_author_profile`.
- `frontend/src/hooks/useGenerationDraft.ts` — LS `generation_draft`.
- `frontend/src/utils/slopDetectionSettings.ts` — LS `dialogueGenerator.aiSlopDetection.v1`.
- `frontend/src/store/authStore.ts` — hooks post-`login` / `fetchCurrentUser` (pas guest).
- `frontend/src/api/userSettings.ts` — **à créer** client GET/PUT.
- Tests : `tests/api/test_user_settings.py` ; Vitest hydrate/migrate (store ou helper).

## Tasks & Acceptance

**Execution:**
- [x] `user_settings_repository.py` + DI container/dependencies — lecture/upsert namespace + isolation user.
- [x] Router/schemas + `api-contracts-api.md` — GET all / GET namespace / PUT namespace, 403 guest, 422 namespace.
- [x] `userSettings.ts` + sync hook post-auth — hydrate API → stores ; migrate LS si serveur vide ; PUT sur changement.
- [x] Adapter `contextConfigStore` + author/draft/slop — source de vérité API pour comptes, LS cache.
- [x] Tests pytest matrice I/O + Vitest migrate/hydrate + lint.

**Acceptance Criteria:**
- Given writer authentifié, when GET/PUT namespaces `context`/`generation`, then valeurs persistées en `user_settings` et rechargées après nouvel hydratage.
- Given prefs LS et serveur vide au 1er login, when migrate, then serveur peuplé sans écraser un serveur déjà non vide.
- Given guest ou writer B, when accès aux prefs de A / endpoints guest, then 403 ou isolation (B ne voit pas A).

## Spec Change Log

## Design Notes

PUT remplace/merge les clés fournies du namespace (upsert par clé, pas drop aveugle des clés omises — documenter dans le contrat). Race Zustand persist vs hydrate API : attendre rehydrate LS puis appliquer serveur (serveur gagne sauf migrate initial). DEV Vite bypass auth : ne pas appeler migrate/hydrate sans user compte réel ; chemin `DISABLE_AUTH` backend mappe username `admin`.

## Verification

**Commands:**
- `node scripts/getPythonPath.js -m pytest tests/api/test_user_settings.py -q --tb=short` — pass.
- `cd frontend && npx vitest run src/api/userSettings.test.ts src/hooks/useUserSettingsSync.test.ts --reporter=dot` — pass (ajuster chemins aux fichiers créés).
- `npm --prefix frontend run lint` — zéro erreur.

## Suggested Review Order

**Persistence + API**

- Upsert JSON isolé par user/namespace sans drop des clés omises
  [`user_settings_repository.py:81`](../../services/repositories/sqlite/user_settings_repository.py#L81)

- Endpoints me/settings + résolution admin DISABLE_AUTH (FK réelle)
  [`user_settings.py:56`](../../api/routers/user_settings.py#L56)

**Sync frontend**

- Hydrate / migrate / garde cross-account / échec GET
  [`useUserSettingsSync.ts:185`](../../frontend/src/hooks/useUserSettingsSync.ts#L185)

- Owner LS pour bloquer la migrate d’un autre compte
  [`useUserSettingsSync.ts:21`](../../frontend/src/hooks/useUserSettingsSync.ts#L21)

- Timeout pour ne pas bloquer login sur sync hung
  [`authStore.ts:86`](../../frontend/src/store/authStore.ts#L86)

**Client + tests**

- Client GET/PUT namespaces
  [`userSettings.ts:10`](../../frontend/src/api/userSettings.ts#L10)

- Matrice hydrate / migrate / isolation
  [`useUserSettingsSync.test.ts:28`](../../frontend/src/hooks/useUserSettingsSync.test.ts#L28)
