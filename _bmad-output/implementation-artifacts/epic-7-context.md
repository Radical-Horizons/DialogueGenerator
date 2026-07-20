# Epic 7 Context: Collaboration et contrôle d'accès

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Permettre à une équipe narrative authentifiée (admin, writers) de collaborer sur des dialogues avec propriété, partage et RBAC explicites, tout en offrant aux visiteurs hors projet une démo lecture seule sans compte. L’epic persiste identités, index, partages et préférences dans SQLite locale (`data/app.db`), conserve les graphes en JSON sur disque, et prépare l’audit des actions sensibles — pour 3 à 5 utilisateurs concurrents au MVP.

**Note produit (stories livrées + rétro 2026-07-20) :** l’accès invité (7.5) est une **session démo app-wide** via JWT `role=guest` — **seule** forme d’invité retenue. Les liens `share_links` par dialogue sont **hors intérêt produit** (ne pas replanifier). Le panneau permissions (7.7) reflète owner + co-éditeurs uniquement.

## Stories

- Story 7.0: Fondation SQLite application
- Story 7.1: Créer comptes utilisateurs — admin only
- Story 7.2: Se connecter et se déconnecter du système
- Story 7.3: Administrateurs gèrent les utilisateurs
- Story 7.4: Writers créent, éditent et suppriment dialogues
- Story 7.5: Invités en lecture seule sans compte (session démo app-wide)
- Story 7.6: Partager dialogues en co-édition entre writers
- Story 7.7: Voir qui a accès à chaque dialogue
- Story 7.8: Audit logs actions utilisateurs
- Story 7.9: Préférences utilisateur synchronisées serveur

## Requirements & Constraints

- Inscription publique fermée : seul un admin crée des comptes. Rôles persistés : `admin` | `writer` uniquement — pas de `viewer` en base.
- Bootstrap : compte seed `admin` au 1er démarrage si `ADMIN_PASSWORD` est défini ; jamais de mot de passe en dur. Mots de passe hashés bcrypt ; JWT access ~15 min + refresh cookie httpOnly 7 j pour les comptes.
- Writers/admins : CRUD dialogues propres ; co-éditeurs (partage `writer`) peuvent lire/éditer mais pas supprimer ni gérer les partages. Isolation owner stricte sans partage.
- Invités (FR68, livré 7.5) : bouton « Continuer en invité » / guest-first → `POST /api/v1/auth/guest` → JWT `role=guest` 8 h, **sans** refresh cookie, **sans** ligne `users`. Lecture globale (liste + graphe) ; mutations, génération LLM et admin → 403 API + UI. Export Unity client-only autorisé. **`share_links` / liens URL par dialogue : hors intérêt produit** (rétro Epic 7, 2026-07-20).
- Partage entre comptes (7.6) : permission `writer` seule ; grant/revoke owner ou admin ; invitation par **username** d’un writer actif existant.
- Visibilité permissions (7.7) : `GET …/permissions` pour users authentifiés non-guest avec `can_read` ; réponse owner + co-éditeurs + `can_manage`. Badges liste : `Privé` | `Co-édité (N)` via `share_count` — pas de badge « Lien invité ».
- Audit (7.8) : journal append-only sur mutations réussies ; consultation admin-only, paginée, export CSV/JSON.
- Préférences (7.9) : namespaces `context` et `generation` ; source de vérité API ; migration localStorage best-effort au 1er login sans écraser le serveur.
- RBAC appliqué côté API (UI en miroir, jamais seule garde). Migration SQLite échouée → routes métier dépendantes refusées, état visible dans `/health`.
- Dev local : guest-first ; `DISABLE_AUTH=false` par défaut (pytest peut forcer `true`). Tests SQLite sur base temporaire, jamais `data/app.db`.

## Technical Decisions

- Base `data/app.db` (WAL recommandé), migrations numérotées dans `services/repositories/sqlite/migrations/`, suivi `schema_migrations`. Tables : `users`, `user_settings`, `app_settings`, `dialogues_index`, `dialogue_shares` (migration **004**), `audit_logs`. **`share_links` non implémentée** (différé).
- Graphes JSON restent sur disque ; `dialogues_index` trace owner, `last_modified_by`, dates, `storage_path`. Upsert index après persistance document réussie.
- **Priorité post-épic (rétro 2026-07-20) :** stabilité de l’éditeur de graphe (bugs test users) **avant** les évolutions Epic 8.
- Repositories sous `services/repositories/sqlite/` ; injection via `ServiceContainer` (`api/container.py`). `AuthService` → `UserRepository` (plus de dict in-memory). Guest résolu depuis claim JWT, hors SQLite.
- Capabilities (`can_read`, `can_edit`, `can_delete`, `can_manage`) centralisées backend ; dépendances `require_admin`, `require_edit`, etc. sur routers concernés.
- Endpoints clés : `/api/v1/auth/*` (login, refresh, logout, **guest**), `/api/v1/users/*` (admin), `/api/v1/dialogues/{id}/shares`, `/api/v1/dialogues/{id}/permissions`, `/api/v1/users/me/settings`. Pas de `/auth/register` public.
- `app_settings` : clés non-secrets uniquement, `updated_by` tracé. Audit émis depuis services métier (pas middleware seul).

## UX & Interaction Patterns

- Admin : gestion utilisateurs, promotion admin avec confirmation, audits (7.8). Writer : pas d’accès admin ni gestion comptes.
- Invité : bannière « Mode invité — lecture seule » ; create/save/generate/delete/admin masqués ou désactivés ; token expiré → retour login sans refresh silencieux.
- Partage : `DialogueSharingModal` pour invite/révocation (owner/admin). `DialoguePermissionsPanel` pour lecture owner + co-éditeurs et révocation si `can_manage`.
- Liste dialogues : badge/tooltip `Privé` si `share_count === 0`, sinon `Co-édité (N)`. Guest : pas de panneau permissions (403).

## Cross-Story Dependencies

- 7.0 → fondation pour 7.1–7.9. 7.1 comptes → 7.2 login → 7.3 UI admin. 7.4 `dialogues_index` → 7.6 partages, 7.7 permissions, Epic 8 listing/recherche.
- 7.5 guest app-wide indépendant des partages ; 7.6 alimente 7.7 ; 7.8 journalise mutations 7.3–7.7 ; 7.9 dépend login 7.2.
- Epic 0 : JWT, rate limit, SecurityConfig. Epic 10 : `last_modified_by`, audit. Co-édition temps réel hors périmètre.
