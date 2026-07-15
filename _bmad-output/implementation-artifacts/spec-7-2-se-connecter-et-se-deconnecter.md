---
title: 'Story 7.2 — Se connecter et se déconnecter du système'
type: 'feature'
created: '2026-07-15'
baseline_commit: 7c869c42a311521a1e390973a684b813d2778d75
status: 'done'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-7-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/7-1-créer-comptes-utilisateurs-admin-only-fr64.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Le parcours JWT existe, mais le login et la résolution de l'utilisateur lisent encore un dictionnaire mémoire distinct du compte SQLite utilisé par 7.1. Les writers créés par un administrateur ne peuvent donc pas se connecter et plusieurs routes utilisent une instance `AuthService` hors du `ServiceContainer`.

**Approach:** Brancher login, refresh, `/me`, logout et les vérifications SSE sur l'`AuthService` injecté, qui consulte les comptes SQLite persistés. Supprimer le stockage utilisateur mémoire et conserver les contrats JWT, cookie refresh et bypass local existants.

## Boundaries & Constraints

**Always:** Utiliser `ServiceContainer`/FastAPI DI comme source unique d'`AuthService`; vérifier les mots de passe avec le hash bcrypt persisté; conserver access JWT de 15 minutes, refresh cookie `httpOnly` de 7 jours, `sub` égal au username canonique, erreurs d'authentification sans révéler si le compte existe, et `DISABLE_AUTH=true` inchangé en développement. Un compte inactif ne peut pas ouvrir de session ni être résolu pour une route protégée.

**Ask First:** Aucun choix produit supplémentaire n'est requis pour ce périmètre; toute modification du contrat frontend ou ajout de révocation persistée des refresh tokens est hors de cette story.

**Never:** Ne pas réintroduire de singleton module-level ou de `_users_db`; ne pas stocker de mot de passe en clair; ne pas supprimer le bypass local; ne pas implémenter l'UI de gestion des utilisateurs, la désactivation de comptes ou l'audit (stories 7.3 et 7.8).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Connexion valide | Compte SQLite actif + identifiants corrects | 200, access token bearer et cookie refresh | N/A |
| Connexion invalide | Username absent, mot de passe faux ou compte inactif | Aucun token exploitable | 401 générique |
| Rafraîchissement | Cookie refresh valide et compte toujours actif | Nouveau access token | 401 si absent, invalide, expiré ou utilisateur introuvable |
| Déconnexion | Cookie présent, absent ou access token expiré | Cookie refresh supprimé, opération idempotente | N'échoue pas à cause d'un access token invalide |

</frozen-after-approval>

## Code Map

- `api/services/auth_service.py` — authentification, résolution utilisateur et création/vérification des JWT.
- `services/repositories/sqlite/user_repository.py` — lecture persistée des comptes et contrat repository.
- `api/routers/auth.py` — endpoints login, refresh, `/me`, logout et dépendance utilisateur courant.
- `api/routers/streaming.py` — authentification des flux SSE, à aligner sur le service injecté.
- `api/utils/sse_job_token.py` — création et validation des jetons SSE avec la configuration du service injecté.
- `api/middleware/billable_user_context.py` — résolution du Bearer pour le contexte de facturation via le container.
- `tests/api/test_auth.py` — tests de contrat login et `/me`; suites auth connexes à préserver.
- `tests/conftest.py` — fixtures de base SQLite isolée et comptes seedés pour les tests réels.

## Tasks & Acceptance

**Execution:**
- [x] `services/repositories/sqlite/user_repository.py` — compléter le contrat de lecture/authentification persistée et préserver la canonicalisation username — éviter tout accès direct SQLite hors repository.
- [x] `api/services/auth_service.py` — faire authentifier et résoudre les utilisateurs depuis le repository injecté, supprimer `_users_db`, préserver le hashing et les durées JWT — rendre 7.1 et 7.2 cohérents.
- [x] `api/routers/auth.py` — remplacer l’instance globale par `Depends(get_auth_service)` pour login, refresh, résolution courante et logout — unifier le chemin d’exécution.
- [x] `api/routers/streaming.py` — utiliser le même service injecté pour Bearer et `sse_token` — éviter une résolution mémoire divergente.
- [x] `tests/api/test_auth.py` et `tests/api/test_health_auth_gaps.py` — couvrir compte SQLite seedé, writer créé par l’API, erreurs, refresh, logout, `/me`, compte inactif et bypass local — empêcher la régression brownfield.
- [x] `tests/conftest.py` — fournir un compte de test SQLite explicite sans modifier `data/app.db` — rendre les tests indépendants de l’ancien mot de passe hardcodé.

**Acceptance Criteria:**
- Given un compte actif existe en SQLite, when il envoie ses identifiants à `POST /api/v1/auth/login`, then l'API retourne 200 avec un access token bearer et un refresh cookie conforme.
- Given un writer est créé par `POST /api/v1/users`, when il se connecte avec son mot de passe, then il obtient un token et `GET /api/v1/auth/me` retourne son identité depuis SQLite.
- Given des identifiants invalides, un compte absent ou inactif, when le login est appelé, then l'API retourne 401 sans distinguer la cause ni émettre de session.
- Given un refresh valide et un compte actif, when `/api/v1/auth/refresh` est appelé, then un nouvel access token est retourné; sinon l'API retourne 401.
- Given une déconnexion avec cookie présent, absent ou access token expiré, when `/api/v1/auth/logout` est appelée, then le refresh cookie est supprimé et la réponse reste idempotente.
- Given `DISABLE_AUTH=true` en développement, when une route protégée est appelée, then le bypass mock existant reste fonctionnel sans dépendre d'un JWT.
- Given une route auth ou SSE résout un utilisateur, when elle s'exécute, then elle utilise l'`AuthService` du container et aucun stockage mémoire parallèle n'existe.

## Design Notes

Le router auth est importé par plusieurs routes; la dépendance doit donc rester compatible avec `Depends(get_current_user)`. Le service injecté doit être résolu au moment de la requête afin que les overrides de test pointent vers la base SQLite temporaire. Le refresh ne nécessite pas de nouvelle table ou de révocation persistée dans cette story.

## Verification

**Commands:**
- `node scripts/getPythonPath.js -m pytest tests/api/test_auth.py tests/api/test_health_auth_gaps.py tests/api/test_users.py -v --tb=short` — expected: all targeted auth and account tests pass.
- `npm run test:backend:fast` — expected: backend fast suite passes without regressions.
- `node scripts/getPythonPath.js -m compileall -q api services tests` — expected: exit code 0.

## Dev Agent Record

### Completion Notes

- Authentification, résolution `/me`, refresh et logout utilisent désormais l’`AuthService` injecté par le `ServiceContainer`.
- Le stockage mémoire `_users_db` a été supprimé ; les comptes actifs sont lus depuis `UserRepository`, y compris pour les flux SSE Bearer et `sse_token`.
- Les tests auth utilisent une base SQLite temporaire et couvrent le writer créé par l’API, les comptes inactifs, le refresh, le logout et le bypass local.

### File List

- `api/routers/auth.py`
- `api/routers/streaming.py`
- `api/utils/sse_job_token.py`
- `api/middleware/billable_user_context.py`
- `api/services/auth_service.py`
- `tests/api/test_auth.py`
- `tests/api/test_health_auth_gaps.py`
- `tests/api/test_streaming_router.py`
- `tests/api/test_users.py`
- `tests/conftest.py`

## Change Log

- 2026-07-15 : migration du flux de connexion/déconnexion vers l’`AuthService` SQLite injecté et ajout des tests comportementaux isolés.

## Suggested Review Order

**Source de vérité et authentification persistée**

- Le service unique authentifie uniquement les comptes SQLite actifs.
  [`auth_service.py:177`](../../api/services/auth_service.py#L177)

- Les tokens signés exigent désormais un type et une expiration valides.
  [`auth_service.py:246`](../../api/services/auth_service.py#L246)

**Contrat API et injection FastAPI**

- La dépendance injectée unifie login, résolution `/me` et erreurs génériques.
  [`auth.py:95`](../../api/routers/auth.py#L95)

- Le refresh privilégie le cookie httpOnly et gère les requêtes sans body.
  [`auth.py:247`](../../api/routers/auth.py#L247)

**Flux SSE et facturation**

- Les jetons SSE et Bearer utilisent le même service configuré par requête.
  [`streaming.py:94`](../../api/routers/streaming.py#L94)

- La facturation vérifie les Bearer via le container, sans singleton parallèle.
  [`billable_user_context.py:59`](../../api/middleware/billable_user_context.py#L59)

**Preuves comportementales**

- Les tests couvrent comptes SQLite, inactifs, refresh cookie-only, logout et claims malformés.
  [`test_auth.py:8`](../../tests/api/test_auth.py#L8)

- Les tests SSE confirment la compatibilité du flux après migration DI.
  [`test_streaming_router.py:1`](../../tests/api/test_streaming_router.py#L1)
