---
title: 'Story 7.3 — Administrateurs gèrent les utilisateurs'
type: 'feature'
created: '2026-07-15'
baseline_commit: 53115714a9bea270ca71ba01c112836e10611877
status: 'done'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-7-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-7-2-se-connecter-et-se-deconnecter.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Les administrateurs peuvent créer un writer, mais ils ne peuvent ni consulter l’ensemble des comptes ni modifier leur rôle ou leur état. L’application ne dispose pas non plus du CRUD administrateur prévu pour les réglages non secrets.

**Approach:** Livrer un parcours admin cohérent : API de liste et de mise à jour des comptes SQLite, page `/admin/users` pour créer et gérer les utilisateurs, identité frontend enrichie avec le rôle, et API `app_settings` limitée par une liste blanche. Conserver au moins un administrateur actif et journaliser les mutations de façon structurée en préparation de l’audit 7.8.

## Boundaries & Constraints

**Always:** Réserver les routes utilisateurs et réglages aux comptes actifs de rôle `admin`; limiter les rôles persistés à `admin | writer`; désactiver sans supprimer; ne jamais exposer `hashed_password`; refuser atomiquement toute mutation qui laisserait zéro administrateur actif; conserver `DISABLE_AUTH=true`; limiter `app_settings` à `notion_sync_enabled` (booléen non secret) et son `updated_by`; afficher une confirmation avant promotion admin ou désactivation.

**Ask First:** Toute modification de username/email, ajout d’une clé à la liste blanche `app_settings`, ou changement du contrat de verrouillage du dernier admin exige une validation produit.

**Never:** Ne pas ajouter de rôle `viewer`, de hard delete, de reset de mot de passe, d’inscription publique, de partage de dialogues, de lien invité, de révocation persistée des refresh tokens ni de système d’audit 7.8. Ne pas mettre de logique RBAC uniquement dans le frontend.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|---------------|----------------------------|----------------|
| Gestion valide | Admin actif liste, crée ou modifie un compte | Données persistées et UI rafraîchie; mutation loggée avec acteur/cible/action | N/A |
| Accès interdit | Writer, compte inactif ou requête non authentifiée | Aucune donnée ni mutation | 403 conforme au contrat admin |
| Dernier admin | Mutation rendrait nul le nombre d’admins actifs | Transaction annulée, compte inchangé | 409 avec message exploitable |
| Cible ou valeur invalide | ID absent, rôle inconnu, patch vide | Aucun changement | 404 ou 422 selon la cause |
| Réglage autorisé | Admin lit, écrit ou supprime `notion_sync_enabled` | Valeur et `updated_by` persistés, ou clé absente après suppression | 422 pour clé interdite |

</frozen-after-approval>

## Code Map

- `services/repositories/sqlite/user_repository.py` / `app_settings_repository.py` — persistance transactionnelle.
- `api/services/auth_service.py` — opérations admin et invariant du dernier admin.
- `api/routers/users.py` / `api/routers/admin.py` — contrats HTTP admin users et settings.
- `api/schemas/users.py` / `api/schemas/auth.py` — patch utilisateur, réponses et identité `/me` avec rôle.
- `api/container.py` / `api/dependencies.py` — injection et garde admin.
- `frontend/src/store/authStore.ts` / `frontend/src/types/api.ts` / `frontend/src/api/users.ts` — identité et client typés.
- `frontend/src/components/admin/UserManagementPanel.tsx` — gestion des comptes.
- `frontend/src/App.tsx` / `frontend/src/components/layout/Header.tsx` — route et navigation admin.
- `tests/api/test_users.py` — contrats, RBAC et invariants SQLite.

## Tasks & Acceptance

**Execution:**
- [x] `services/repositories/sqlite/user_repository.py` — ajouter `find_by_id`, `list_all` et mise à jour atomique rôle/état, avec comptage des admins actifs — garantir persistance et anti-lockout.
- [x] `services/repositories/sqlite/app_settings_repository.py`, `api/container.py` — injecter un repository settings sans singleton et limiter les clés à `notion_sync_enabled` booléen — préserver l’architecture SQLite.
- [x] `api/services/auth_service.py`, `api/schemas/users.py` — exposer liste/patch administrateur, valider les transitions et produire les logs structurés acteur/cible/action — centraliser les invariants.
- [x] `api/routers/users.py`, `api/routers/admin.py`, `api/schemas/auth.py` — ajouter `GET /users`, `PATCH /users/{id}`, CRUD settings et rôle dans `/auth/me`, tous protégés par DI/RBAC.
- [x] `frontend/src/types/api.ts`, `frontend/src/store/authStore.ts`, `frontend/src/api/users.ts` — aligner les contrats et l’état auth, sans dupliquer les règles métier.
- [x] `frontend/src/components/admin/UserManagementPanel.tsx`, `frontend/src/App.tsx`, `frontend/src/components/layout/Header.tsx` — créer une page admin responsive et accessible avec états loading/empty/error, formulaire writer et confirmations.
- [x] `tests/api/test_users.py` et tests Vitest ciblés admin/auth/navigation — couvrir chaque scénario de la matrice, dont concurrence anti-lockout, rôle, désactivation, settings allowlistés et bypass local.
- [x] `docs/api/api-contracts-api.md` — documenter les nouveaux contrats et codes d’erreur.

**Acceptance Criteria:**
- Given un admin actif, when il ouvre `/admin/users`, then il voit tous les comptes sans donnée sensible et peut créer un writer.
- Given un admin modifie rôle ou état, when l’API accepte le patch, then SQLite et l’UI reflètent la mutation et un log structuré identifie acteur, cible et action.
- Given une mutation concurrente ou séquentielle retirerait le dernier admin actif, when elle est tentée, then une seule transaction peut réussir et au moins un admin actif subsiste.
- Given un writer authentifié, when il utilise la navigation ou appelle directement une route admin, then l’entrée UI est absente et l’API refuse l’accès.
- Given un admin utilise `app_settings`, when la clé est allowlistée, then le CRUD persiste valeur et auteur; une clé secrète ou inconnue est refusée.
- Given `DISABLE_AUTH=true` en développement, when le parcours admin est utilisé, then le bypass existant reste fonctionnel.

## Spec Change Log

- 2026-07-15 : implémentation complète du parcours administrateur utilisateurs et réglages applicatifs, prête pour revue.

## Verification

**Commands:**
- `node scripts/getPythonPath.js -m pytest tests/api/test_users.py tests/api/test_auth.py -v --tb=short` — expected: contrats users/auth et anti-lockout verts sur SQLite temporaire.
- `cd frontend && npx vitest run src/components/admin/UserManagementPanel.test.tsx src/test/App.admin-routing.test.tsx src/components/layout/Header.admin.test.tsx src/store/authStore.test.ts --reporter=dot` — expected: parcours admin, garde et confirmations verts.
- `npm --prefix frontend run lint` — expected: zéro erreur ou warning.
- `npm run test:backend:fast` — expected: suite backend rapide sans régression.

**Manual checks (if no CLI):**
- Avec `DISABLE_AUTH=false`, vérifier en navigateur les parcours admin et writer à largeur desktop puis 320 px, navigation clavier comprise.

## Dev Agent Record

### Completion Notes

- Ajout du listing et du patch administrateur des comptes SQLite, avec verrou transactionnel empêchant toute suppression séquentielle ou concurrente du dernier admin actif.
- Ajout du CRUD injecté `app_settings`, limité à `notion_sync_enabled` booléen, avec auteur de mise à jour et RBAC backend.
- Ajout de la page `/admin/users`, de la navigation conditionnée au rôle, des confirmations de promotion/désactivation et de la migration de l’identité frontend enrichie.
- Correctifs de revue appliqués : initialisation auth avant garde admin active, synchronisation immédiate des auto-mutations, sérialisation UI, fusion triée des listes, erreurs de champs, no-op PATCH et réponse issue de la transaction.
- Vérifications backend, frontend, build, lint et rendu navigateur desktop/320 px exécutées avec succès.

### File List

- `_bmad-output/implementation-artifacts/spec-7-3-administrateurs-gerent-les-utilisateurs.md`
- `api/container.py`
- `api/dependencies.py`
- `api/main.py`
- `api/routers/admin.py`
- `api/routers/auth.py`
- `api/routers/users.py`
- `api/schemas/auth.py`
- `api/schemas/users.py`
- `api/services/auth_service.py`
- `docs/api/api-contracts-api.md`
- `frontend/src/App.tsx`
- `frontend/src/api/users.ts`
- `frontend/src/components/admin/UserManagementPanel.test.tsx`
- `frontend/src/components/admin/UserManagementPanel.tsx`
- `frontend/src/components/layout/Header.admin.test.tsx`
- `frontend/src/components/layout/Header.tsx`
- `frontend/src/store/authStore.test.ts`
- `frontend/src/store/authStore.ts`
- `frontend/src/test/App.admin-routing.test.tsx`
- `frontend/src/types/api.ts`
- `services/repositories/sqlite/__init__.py`
- `services/repositories/sqlite/app_settings_repository.py`
- `services/repositories/sqlite/user_repository.py`
- `tests/api/test_users.py`

## Suggested Review Order

**Gestion transactionnelle des comptes**

- L’entrée API applique RBAC, validation et codes d’erreur du parcours administrateur.
  [`users.py:55`](../../api/routers/users.py#L55)

- Le service centralise l’invariant anti-lockout et les logs structurés.
  [`auth_service.py:96`](../../api/services/auth_service.py#L96)

- La transaction SQLite sérialise les mutations et retourne exactement la ligne modifiée.
  [`user_repository.py:219`](../../services/repositories/sqlite/user_repository.py#L219)

**Réglages applicatifs**

- Le routeur expose le CRUD administrateur de la clé autorisée.
  [`admin.py:43`](../../api/routers/admin.py#L43)

- Le repository impose l’allowlist et le type booléen.
  [`app_settings_repository.py:27`](../../services/repositories/sqlite/app_settings_repository.py#L27)

**Garde et expérience frontend**

- La route hydrate l’identité avant d’autoriser uniquement un admin actif.
  [`App.tsx:74`](../../frontend/src/App.tsx#L74)

- Le panneau sérialise les mutations et synchronise les auto-modifications de session.
  [`UserManagementPanel.tsx:152`](../../frontend/src/components/admin/UserManagementPanel.tsx#L152)

- Le menu ne révèle l’administration qu’aux administrateurs actifs.
  [`Header.tsx:372`](../../frontend/src/components/layout/Header.tsx#L372)

**Preuves de non-régression**

- Les tests SQLite couvrent la concurrence et la conservation du dernier admin.
  [`test_users.py:686`](../../tests/api/test_users.py#L686)

- Les tests de route couvrent hydratation tardive et compte admin inactif.
  [`App.admin-routing.test.tsx:96`](../../frontend/src/test/App.admin-routing.test.tsx#L96)

- Les tests UI couvrent annulation, sérialisation et erreurs de validation.
  [`UserManagementPanel.test.tsx:116`](../../frontend/src/components/admin/UserManagementPanel.test.tsx#L116)
