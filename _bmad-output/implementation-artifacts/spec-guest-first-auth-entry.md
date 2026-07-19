---
title: 'Guest-first auth entry — fin des bypass DEV'
type: 'feature'
created: '2026-07-20'
status: 'done'
baseline_commit: '0cb069a3858f4939debb6b2ff647879ce861d341'
review_loop_iteration: 0
context:
  - '{project-root}/AGENTS.md'
  - '{project-root}/.cursor/rules/agentivity.mdc'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** En Vite DEV, `ProtectedRoute` saute l’auth et `authStore.initialize` peut injecter un faux admin ; l’utilisateur arrive « Non connecté » sans rôle guest ni JWT. Avec l’accès invité Epic 7, forcer un panneau login à l’entrée n’a plus de sens, et les bypass locaux (`DISABLE_AUTH=true` par défaut + shortcuts frontend) empêchent de valider le flux réel.

**Approach:** Entrée app = session guest automatique (JWT `POST /auth/guest`) si pas de session valide ; bouton **Connexion** → `/login` pour writer/admin ; supprimer les bypass Vite et basculer `DISABLE_AUTH` à `false` par défaut hors pytest.

## Boundaries & Constraints

**Always:**
- Sans token valide au boot → `loginAsGuest()` puis UI guest (banner lecture seule, mutations bloquées).
- Session writer/admin existante (token non expiré) → pas de guest ; Header menu utilisateur.
- Bouton Connexion (Header) → `/login` ; pas de modal.
- Logout (writer/admin ou guest) → clear tokens puis re-guest (rester dans l’app, pas mur login).
- `DISABLE_AUTH` défaut applicatif = `false` (SecurityConfig + `.env.example`) ; production refuse toujours `disable_auth`.
- Pytest conserve `DISABLE_AUTH=true` via `conftest` pour ne pas Bearer-iser toute la suite.
- Mettre à jour `AGENTS.md` / règles qui promettent le frictionless `DISABLE_AUTH` local.

**Ask First:**
- Changer Playwright `webServer.env.DISABLE_AUTH` (aujourd’hui `true`) vers auth réelle + storageState — si trop large, garder `true` pour E2E seulement et documenter l’exception.

**Never:**
- Réintroduire mock admin Vite (`id: '1'`, username admin) ou skip `ProtectedRoute` en `import.meta.env.DEV`.
- Supprimer le flag `DISABLE_AUTH` / le path code (tests + outillage en dépendent).
- Implémenter `/guest/dialogues/:token` (hors scope, deferred Epic 7).
- Casser le seed admin SQLite (`ADMIN_PASSWORD` / `admin`/`admin123` dev).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Boot sans token | localStorage vide | `POST /auth/guest` → user `role=guest`, app accessible | Si guest API échoue → message erreur + bouton Connexion (pas mock admin) |
| Boot token writer valide | access_token OK | `getCurrentUser` → menu utilisateur, pas guest | 401 → clear + auto-guest |
| Boot token expiré | JWT expiré | clear tokens → auto-guest | N/A |
| Clic Connexion (guest) | Header | navigate `/login` | N/A |
| Login succès | credentials valides | writer/admin, redirect `/` | erreur form |
| Logout | session quelconque | clear + re-guest, reste sur page courante (ou `/`) | guest fail → état non auth + Connexion |
| DEV Vite | `npm run dev` | même flux que preview (pas de bypass) | N/A |
| API locale défaut | `DISABLE_AUTH` unset/false | JWT requis ; 401 sans Bearer | seed admin pour login |

</frozen-after-approval>

## Code Map

- `frontend/src/store/authStore.ts` — `initialize` (mock DEV), `logout` ; point central auto-guest
- `frontend/src/App.tsx` — `ProtectedRoute` bypass DEV
- `frontend/src/components/layout/Header.tsx` — « Non connecté » → Connexion
- `frontend/src/components/auth/LoginForm.tsx` — garder login ; « Continuer en invité » secondaire (redondant mais OK)
- `frontend/src/api/auth.ts` — `loginAsGuest` → `POST /api/v1/auth/guest`
- `frontend/src/hooks/useUserSettingsSync.ts` — special-case faux admin DEV à retirer
- `api/config/security_config.py` — `disable_auth` défaut `True` → `False`
- `.env.example` — `DISABLE_AUTH=true` → `false`
- `tests/conftest.py` — conserver `setdefault("DISABLE_AUTH", "true")`
- `tests/api/test_security_config.py` — assertion défaut
- `AGENTS.md` — paragraph local auth
- `playwright.config.ts` — Ask First si on touche `DISABLE_AUTH`

## Tasks & Acceptance

**Execution:**
- [x] `frontend/src/store/authStore.ts` — retirer mock DEV ; `initialize` : token valide → user, sinon `loginAsGuest` ; `logout` → clear + re-guest ; gérer StrictMode / persist
- [x] `frontend/src/App.tsx` — `ProtectedRoute` : toujours `initialize` ; accès si authentifié (y compris guest) ; sinon attendre init / re-guest (pas redirect `/login` forcé à l’entrée)
- [x] `frontend/src/components/layout/Header.tsx` — si guest (ou non auth) : bouton Connexion → `/login` ; writer/admin : menu existant
- [x] `frontend/src/hooks/useUserSettingsSync.ts` — supprimer exception faux admin Vite
- [x] `api/config/security_config.py` + `.env.example` — défaut `disable_auth=false` / `DISABLE_AUTH=false`
- [x] `tests/api/test_security_config.py` + tests bypass documentés — aligner assertions défaut ; garder chemins `DISABLE_AUTH=true` pytest-only
- [x] `AGENTS.md` (+ règle auth locale si présente) — documenter guest-first + login réel ; pytest garde `DISABLE_AUTH`
- [x] Tests FE : `authStore.test.ts`, `Header.admin.test.tsx`, `App.admin-routing.test.tsx`, `LoginForm.test.tsx`, `useUserSettingsSync.test.ts` — couvrir matrice I/O
- [x] Ask First avant de modifier `playwright.config.ts` — laissé `DISABLE_AUTH=true` pour E2E (exception documentée)

**Acceptance Criteria:**
- Given Vite DEV sans token, when l’app charge, then session guest JWT (pas « Non connecté », pas mock admin).
- Given guest, when Connexion, then `/login` ; login OK → rôle writer/admin.
- Given writer, when logout, then re-guest sans mur login obligatoire.
- Given API locale avec défaut config, when requête sans Bearer, then 401 (sauf si env pytest `DISABLE_AUTH=true`).
- Given production, when `disable_auth=true`, then `validate_config` refuse toujours.

## Spec Change Log

## Design Notes

**Connexion = route `/login`** (pas modal) : réutilise `LoginForm`, deep-linkable, moins de state Header.

**ProtectedRoute post-changement :** après init, `isAuthenticated` est vrai pour guest ; redirect `/login` seulement si init/guest a définitivement échoué — l’entrée normale ne passe plus par le mur login.

**DISABLE_AUTH :** ne pas supprimer le code path ; le restreindre (défaut off, pytest on). E2E Playwright : conserver `true` sauf décision Ask First.

**Persist Zustand :** si `auth-storage` dit authenticated mais tokens absents/expirés → clear persist + guest (éviter split-brain).

## Verification

**Commands:**
- `cd frontend && npx vitest run src/store/authStore.test.ts src/test/LoginForm.test.tsx src/components/layout/Header.admin.test.tsx src/test/App.admin-routing.test.tsx src/hooks/useUserSettingsSync.test.ts --reporter=dot` — expected: pass
- `node scripts/getPythonPath.js -m pytest tests/api/test_security_config.py tests/api/test_guest_access.py tests/api/test_auth.py -q --tb=short` — expected: pass
- `npm --prefix frontend run lint` — expected: 0 errors

**Manual checks:**
- `npm run dev` : Header montre guest + Connexion ; login `admin`/`admin123` (DISABLE_AUTH=false) ; logout → guest.

## Suggested Review Order

**Session guest-first**

- Boot : `isLoading` true + auto-guest sans mock Vite
  [`authStore.ts:158`](../../frontend/src/store/authStore.ts#L158)
- `initialize` : token valide ou `loginAsGuest` ; retry si échec
  [`authStore.ts:237`](../../frontend/src/store/authStore.ts#L237)
- Logout clear identity puis re-guest (epoch anti-race)
  [`authStore.ts:195`](../../frontend/src/store/authStore.ts#L195)
- Persist sans token → wipe identité fantôme
  [`authStore.ts:321`](../../frontend/src/store/authStore.ts#L321)

**Routing & UI**

- Plus de bypass DEV ; gate après init
  [`App.tsx:19`](../../frontend/src/App.tsx#L19)
- Guest → bouton Connexion (plus « Non connecté »)
  [`Header.tsx:465`](../../frontend/src/components/layout/Header.tsx#L465)
- `/login` accessible aux guests ; affiche `bootError`
  [`LoginForm.tsx:14`](../../frontend/src/components/auth/LoginForm.tsx#L14)

**Backend & docs**

- Défaut `disable_auth=false` ; pytest garde true
  [`security_config.py:73`](../../api/config/security_config.py#L73)
- `get_current_user` lit le singleton live
  [`auth.py:119`](../../api/routers/auth.py#L119)
- AGENTS guest-first
  [`AGENTS.md`](../../AGENTS.md)

**Tests**

- Matrice guest / retry / logout
  [`authStore.test.ts:1`](../../frontend/src/store/authStore.test.ts#L1)
