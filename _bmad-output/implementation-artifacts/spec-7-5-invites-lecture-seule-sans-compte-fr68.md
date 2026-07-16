---
title: 'Story 7.5 — Accès invité à l’interface (démo hors projet)'
type: 'feature'
created: '2026-07-17'
baseline_commit: '35b8c19f6bd45cc73e691e82a82d70ccefe5c922'
status: 'done'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-7-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-7-4-writers-creent-editent-et-suppriment-dialogues.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** On ne peut pas montrer l’appli à des personnes hors projet sans leur créer un compte writer (risque d’édition / coût LLM) ni désactiver toute l’auth.

**Approach:** Mode **invité applicatif** : entrée depuis le login sans compte, session JWT limitée `role=guest` (hors table `users`), parcours UI complet en **lecture seule** (liste + graphe + export), mutations et génération refusées API + UI. Admin masqué.

## Boundaries & Constraints

**Always:** Bouton « Continuer en invité » sur `/login` → `POST /api/v1/auth/guest` → access token court (**8 h**), **sans** refresh cookie, **sans** ligne `users`. Claim JWT `role=guest` (pas de rôle `viewer` en base). Invité : `can_read` sur la bibliothèque (liste + ouverture documents/graphe) ; `can_edit` / `can_delete` / génération = false. Export Unity **client-only** autorisé. Toute route de mutation (PUT/DELETE/create/generate/admin) → **403**. UI : bannière « Mode invité — lecture seule » ; masquer/disable create, save, generate, delete, admin. `DISABLE_AUTH=true` inchangé (dev local). Tests auth réels avec `DISABLE_AUTH=false`.

**Ask First:** Écrire/ persister en sandbox ; autoriser la génération LLM pour invités ; restreindre la lecture à un sous-ensemble de dialogues ; TTL ≠ 8 h.

**Never:** Liens `share_links` / partage par dialogue (reporté). Co-édition (7.6), panneau permissions (7.7), audit (7.8). Compte `guest` en SQLite. Self-signup writer. Laisser l’UI seule comme garde.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Entrée invité | Clic « Continuer en invité » | Token guest ; UI accessible hors `/login` | N/A |
| Parcourir | Guest liste / ouvre un dialogue | Graphe lecture seule + bannière | N/A |
| Mutation | Guest save / create / delete / generate | Bloqué UI + API | 403 |
| Admin | Guest → `/admin/*` | Refus / redirect | 403 |
| Export | Guest export Unity | Download local sans save auth | N/A |
| Session | Token expiré | Retour login ; pas de refresh guest | 401 → login |
| Writer inchangé | Login classique | CRUD owner/admin comme 7.4 | N/A |

</frozen-after-approval>

## Code Map

- `api/routers/auth.py`, `api/services/auth_service.py`, `api/schemas/auth.py` — `POST /auth/guest` ; JWT `role=guest` ; `/me` expose guest.
- `api/dependencies.py` + `document_persistence_service.py` — `capabilities` : guest → read-only global ; mutations refusées.
- Routers documents / dialogues / graph / generation / admin — garder auth ; 403 si guest sur write ; list/get OK pour guest.
- `frontend/src/components/auth/LoginForm.tsx`, `authStore.ts`, `api/auth.ts` — bouton invité + session.
- `frontend/src/App.tsx` / `ProtectedRoute` — guest = authentifié ; admin réservé.
- `frontend/src/components/graph/` + liste dialogues — `canEditGraph` / actions pilotés par capabilities ; bannière invité ; export ok.
- `docs/api/api-contracts-api.md` — contrat guest.

## Tasks & Acceptance

**Execution:**
- [x] Backend `POST /auth/guest` + schéma role guest (JWT only) — session démo sans compte.
- [x] RBAC read-global / write-deny pour guest sur documents, liste, graphe, génération, admin.
- [x] Frontend login invité + store + ProtectedRoute — entrée hors projet.
- [x] UI readonly + bannière + export client ; masquer admin/CRUD/generate.
- [x] Tests pytest + Vitest + contrat — matrice I/O.

**Acceptance Criteria:**
- Given la page login, when « Continuer en invité », then l’UI principale s’ouvre sans compte SQLite et affiche « Mode invité — lecture seule ».
- Given un invité, when il parcourt liste et graphe, then lecture OK et export Unity possible.
- Given un invité, when il tente save/create/delete/generate ou admin, then UI bloquée et API 403.
- Given un token guest expiré, when il reste sur l’app, then retour login sans refresh silencieux.

## Spec Change Log

## Design Notes

Choix produit (validés par défaut expert) : démo **appli entière** en lecture seule, pas partage par lien. FR68 `share_links` → `deferred-work.md`. Guest ≠ user DB : claim JWT uniquement, cohérent avec « pas de viewer en base ». List/get ouverts à guest pour que la démo ne soit pas une coquille vide ; le contenu exposé = ce qui est sur l’instance.

## Verification

**Commands:**
- `node scripts/getPythonPath.js -m pytest tests/api/test_auth.py tests/api/test_guest_access.py tests/api/test_dialogues_rbac.py -q --tb=short` — pass.
- `cd frontend && npx vitest run` (LoginForm / authStore / guest readonly) `--reporter=dot` — pass.
- `npm --prefix frontend run lint` — zéro erreur.

## Suggested Review Order

**Auth guest (JWT sans compte)**

- Entrée HTTP : émet le JWT 8h sans cookie refresh
  [`auth.py:250`](../../../api/routers/auth.py#L250)

- Factory token + principal synthétique hors SQLite
  [`auth_service.py:311`](../../../api/services/auth_service.py#L311)

- Résolution `get_current_user` pour claim `role=guest`
  [`auth.py:157`](../../../api/routers/auth.py#L157)

**RBAC lecture globale / écriture refusée**

- Capabilities guest read-only + `require_edit`
  [`document_persistence_service.py:120`](../../../services/document_persistence_service.py#L120)

- Garde générique mutations / génération
  [`dependencies.py:146`](../../../api/dependencies.py#L146)

**UI démo invité**

- Bouton « Continuer en invité » sur le login
  [`LoginForm.tsx:122`](../../../frontend/src/components/auth/LoginForm.tsx#L122)

- Bannière mode invité dans le chrome
  [`Header.tsx:109`](../../../frontend/src/components/layout/Header.tsx#L109)

- `canEditGraph` off, Actions/export encore ouverts
  [`GraphEditor.tsx:145`](../../../frontend/src/components/graph/GraphEditor.tsx#L145)

- Canvas : pas de drag/connect en invité
  [`GraphCanvas.tsx:646`](../../../frontend/src/components/graph/GraphCanvas.tsx#L646)

**Périphériques**

- Export Unity client-only pour guest
  [`useUnityExport.ts:84`](../../../frontend/src/hooks/useUnityExport.ts#L84)

- Matrice I/O API
  [`test_guest_access.py:1`](../../../tests/api/test_guest_access.py#L1)
