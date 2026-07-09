## Epic 7: Collaboration et contrôle d'accès

Les utilisateurs authentifiés (Admin, Writer) travaillent en équipe avec JWT, RBAC et partage de dialogues. Les **invités sans compte** accèdent en lecture seule via liens dédiés. Une **base SQLite locale** (`data/app.db`) centralise identités, préférences, index dialogues, partages et audit.

**FRs covered:** FR64-71 (auth, RBAC, partage, audit logs)

**NFRs covered:** NFR-S2 (Auth Security JWT), NFR-S3 (Data Protection RBAC), NFR-SC2 (Concurrent Users 3-5 MVP, 10+ V2.0+)

**Valeur utilisateur:** Collaboration équipe narrative (Marc + Mathieu + writers) avec contrôle d'accès ; invités en lecture seule sans friction de compte.

**Dépendances:** Epic 0 (infra auth JWT existante). Epic 8 consomme `dialogues_index` pour listing/recherche — **7.4 pose l'index**, Epic 8 l'enrichit.

---

## Décisions produit (figées)

| Sujet | Décision |
|-------|----------|
| Inscription | **Fermée** — pas de self-service public. Comptes créés par Admin uniquement. |
| Rôles compte | **`admin`** (propriétaire) \| **`writer`** (défaut à la création). Pas de rôle `viewer` en base. |
| Invité sans compte | **Lecture seule** via `share_links` (token URL) — hors table `users`. |
| Bootstrap | Compte seed **`admin`** au 1er démarrage ; mot de passe via **`ADMIN_PASSWORD`** (env, jamais en dur dans le repo). |
| Dev local | Conserver **`DISABLE_AUTH=true`** et bypass frontend dev ; documenter tests auth avec `DISABLE_AUTH=false` + build preview. |

---

## Architecture SQLite — périmètre

**Fichier:** `data/app.db` (créé au boot, `.gitignore`).

**Reste sur disque (inchangé):** graphes JSON Unity (`PUT /documents`, chemins configurés), GDD (`data/GDD_categories/`), presets (`data/presets/*.json`), usage LLM journalier (`data/llm_usage/`), logs applicatifs (`data/logs/`), référentiels versionnés (`config/*.json`).

### Tables et stories

| Table | Contenu | Story |
|-------|---------|-------|
| `schema_migrations` | Version schéma | 7.0 |
| `users` | Comptes, rôles, hash bcrypt | 7.0 → 7.1 |
| `user_settings` | Préférences par user (`namespace`, `key`, JSON) | 7.0 → 7.9 |
| `app_settings` | Config admin globale (clés non-secrets) | 7.0 (structure) → 7.3+ (UI) |
| `dialogues_index` | Métadonnées dialogue (owner, dates, titre, chemin fichier) | 7.4 |
| `dialogue_shares` | Co-édition entre comptes (`permission=writer`) | 7.6 |
| `share_links` | Accès invité lecture seule (token, expiry) | 7.5 |
| `audit_logs` | Journal append-only | 7.8 |

### Stack technique

- **Accès:** `services/repositories/sqlite/` — connexion, migrations, repositories par agrégat.
- **Migrations:** scripts numérotés `services/repositories/sqlite/migrations/00N_*.sql` ; table `schema_migrations`.
- **DI:** enregistrement dans `api/container.py` (`ServiceContainer`) — pas de singleton global pour les repos.
- **Auth:** `AuthService` délègue à `UserRepository` (remplace `_users_db` in-memory).
- **WAL mode** SQLite recommandé pour lectures concurrentes (3-5 users).

### Namespaces `user_settings` (V1.5)

| Namespace | Remplace (aujourd'hui) |
|-----------|-------------------------|
| `context` | `contextConfigStore` (localStorage) — champs, budget tokens, optimisation |
| `generation` | profil auteur, brouillon génération, slop detection |
| `ui` | préférences layout mineures (optionnel V1.5) |

Migration localStorage → serveur : **best-effort au 1er login** (7.9), puis source de vérité = API.

---

## Séquence des stories

```
7.0 SQLite foundation
  ↓
7.1 Comptes (admin-only) + seed admin
  ↓
7.2 Login/logout (brownfield → DB)
  ↓
7.3 Gestion users (admin UI)
  ↓
7.4 Writer CRUD + dialogues_index
  ↓
7.5 Invité lecture seule (share_links)
  ↓
7.6 Partage co-édition entre writers
  ↓
7.7 Visibilité permissions
  ↓
7.8 Audit logs
  ↓
7.9 Préférences utilisateur synchronisées
```

---

## ⚠️ GARDE-FOUS - Vérification de l'Existant (Scrum Master)

**OBLIGATOIRE avant création de chaque story de cet epic :**

### Checklist de Vérification

1. **Fichiers mentionnés dans les stories :**
   - [ ] Vérifier existence avec `glob_file_search` ou `grep`
   - [ ] Vérifier chemins corrects (ex: `services/` vs `api/services/`)
   - [ ] Si existe : **DÉCISION** - Étendre ou remplacer ? (documenter dans story)

2. **Composants/Services similaires :**
   - [ ] Repositories JSON existants (`FileCostBudgetRepository`, `GddNotionSyncConfigStore`) — **ne pas dupliquer** ; SQLite pour données relationnelles / multi-user uniquement
   - [ ] `AuthService` (`api/services/auth_service.py`) — **étendre**, remplacer `_users_db` par repository
   - [ ] Patterns FastAPI + `container.py`

3. **Endpoints API :**
   - [ ] Namespace `/api/v1/auth/*` (login existant), `/api/v1/users/*` (gestion comptes)
   - [ ] Pas de `/auth/register` public

4. **Documentation des décisions :**
   - Documenter dans Dev Notes de chaque story quelles tables SQLite sont touchées

---

### Story 7.0: Fondation SQLite application (`data/app.db`)

As a **développeur / opérateur**,
I want **une base SQLite locale versionnée par migrations**,
So that **auth, préférences et métadonnées multi-utilisateur sont persistants et transactionnels sans serveur DB externe**.

**Acceptance Criteria:**

**Given** l'API démarre sans fichier `data/app.db`
**When** le lifespan FastAPI s'exécute
**Then** le répertoire `data/` est créé si absent
**And** les migrations pending sont appliquées automatiquement
**And** la version courante est enregistrée dans `schema_migrations`

**Given** une migration échoue
**When** le boot continue
**Then** l'API refuse de servir les routes métier dépendantes (fail-fast) avec log explicite
**And** `/health` indique `database: error` (ou équivalent)

**Given** `ServiceContainer` est initialisé
**When** un router demande `UserRepository` ou `DatabaseConnection`
**Then** une instance partagée par processus est injectée (thread-safe)

**Given** les tests pytest s'exécutent
**When** `conftest` configure l'environnement
**Then** une base SQLite temporaire (tmp_path) est utilisée — jamais `data/app.db` de dev

**Technical Requirements:**

- Fichiers : `services/repositories/sqlite/connection.py`, `migrations/runner.py`, `migrations/001_initial.sql`
- Migration 001 : `schema_migrations`, `users`, `user_settings`, `app_settings`
- Constante chemin : `FilePaths.APP_DATABASE` dans `constants.py` → `data/app.db`
- Enregistrement DI : `api/container.py`
- `.gitignore` : `data/app.db`, `data/app.db-wal`, `data/app.db-shm`
- Tests : migration idempotente, rollback sur SQL invalide, isolation tmp_path

**References:** Stories 7.1-7.9, NFR-SC2

---

### Story 7.1: Créer comptes utilisateurs — admin only (FR64)

As an **administrateur**,
I want **créer des comptes writer pour mon équipe**,
So that **chaque collaborateur a ses identifiants sans inscription publique**.

**Acceptance Criteria:**

**Given** je suis authentifié en tant qu'admin
**When** j'appelle `POST /api/v1/users` avec username, email, password
**Then** le compte est créé avec rôle `writer` par défaut
**And** le password est hashé bcrypt en base
**And** la réponse retourne `UserResponse` sans `hashed_password`

**Given** je ne suis pas admin (writer ou non authentifié)
**When** j'appelle `POST /api/v1/users`
**Then** la requête est refusée (403)

**Given** le username existe déjà
**When** je tente de créer le compte
**Then** erreur 409 "Username déjà utilisé"

**Given** password < 8 caractères ou email invalide
**When** je tente de créer le compte
**Then** erreur 422 avec détail par champ

**Given** aucun user en base au premier boot
**When** l'API démarre et `ADMIN_PASSWORD` est défini
**Then** le compte `admin` est seedé avec rôle `admin`
**And** si `ADMIN_PASSWORD` absent en production → log warning + pas de seed (fail sécurisé documenté)

**Given** un writer est créé
**When** la création réussit
**Then** aucun auto-login côté API (l'admin transmet les identifiants hors bande)

**Technical Requirements:**

- Endpoint : `POST /api/v1/users` (admin-only dependency)
- Service : `AuthService.create_user()` → `UserRepository.insert()`
- Table : `users` (id UUID, username UNIQUE, email, hashed_password, role, is_active, timestamps)
- Pas de `RegisterForm` public ; UI admin dans 7.3 (API suffit pour 7.1)
- Remplacer `_users_db` dict in-memory
- Tests : pytest création, unicité, seed admin, refus non-admin

**References:** FR64, Story 7.0, Story 7.2, NFR-S2

---

### Story 7.2: Se connecter et se déconnecter du système (FR65)

As a **utilisateur avec compte**,
I want **me connecter et me déconnecter**,
So that **j'accède à l'application avec ma session JWT**.

**Acceptance Criteria:**

**Given** j'ai un compte en base
**When** je POST `/api/v1/auth/login` avec identifiants valides
**Then** JWT access (15 min) + refresh cookie httpOnly (7 j)
**And** `get_current_user` résout l'user depuis SQLite

**Given** login/logout/refresh existants (brownfield)
**When** cette story est livrée
**Then** ils utilisent `UserRepository` — plus de dict in-memory
**And** les tests `tests/api/test_auth.py` restent verts

**Given** `DISABLE_AUTH=true` en dev
**When** une requête API arrive
**Then** comportement mock inchangé (frictionless local dev)

**Given** je teste auth réelle en dev
**When** `DISABLE_AUTH=false` et build preview frontend
**Then** le flux login → dashboard fonctionne (documenté Dev Notes)

**Technical Requirements:**

- Brownfield : `api/routers/auth.py`, `LoginForm.tsx`, `useAuthStore`, intercepteur refresh (existants)
- Extension : `UserRepository.authenticate()`, token `sub` = username
- Frontend dev bypass : **ne pas supprimer** ; prod utilise vrai login
- Tests : login success/fail, refresh, logout cookie, auth avec DB tmp

**References:** FR65, Story 7.1, NFR-S2

---

### Story 7.3: Administrateurs gèrent les utilisateurs (FR66)

As an **administrateur**,
I want **lister, créer et gérer les comptes writer**,
So that **je contrôle qui accède à l'outil**.

**Acceptance Criteria:**

**Given** je suis admin
**When** j'ouvre "Gestion utilisateurs"
**Then** liste de tous les users (username, email, rôle, actif, créé le)
**And** je peux créer un writer (formulaire → `POST /api/v1/users`)
**And** je peux désactiver un compte (`is_active=false`) sans supprimer l'historique

**Given** je promeus un user en admin
**When** je change le rôle vers `admin`
**Then** confirmation explicite requise
**And** audit préparé pour 7.8

**Given** je suis writer
**When** j'accède à la gestion users
**Then** 403 / UI inaccessible

**Given** je modifie `app_settings` (ex. clé sync Notion non-secrete)
**When** je sauve via API admin
**Then** valeur persistée en table `app_settings` avec `updated_by`

**Technical Requirements:**

- Endpoints : `GET /api/v1/users`, `POST /api/v1/users`, `PATCH /api/v1/users/{id}` (role, is_active)
- Frontend : `UserManagementPanel.tsx` (admin-only route)
- Dependency : `require_admin` sur routers users/settings
- Rôles en base : `admin` | `writer` uniquement
- Tests : RBAC admin, désactivation compte, app_settings CRUD

**References:** FR66, Story 7.1, Story 7.8

---

### Story 7.4: Writers créent, éditent et suppriment dialogues (FR67)

As a **writer (ou admin)**,
I want **CRUD dialogues avec traçabilité propriétaire**,
So that **je produis du contenu narratif en équipe**.

**Acceptance Criteria:**

**Given** je suis writer ou admin
**When** je crée / modifie / supprime un dialogue
**Then** l'action est autorisée
**And** `dialogues_index` est créé/mis à jour (owner_id, last_modified_by, timestamps, storage_path)
**And** le **blob JSON reste sur disque** (comportement documents existant)

**Given** je crée un dialogue
**When** la persistance réussit
**Then** `owner_id` = mon user id

**Given** je suis writer sans partage
**When** j'accède au dialogue d'un autre
**Then** 403

**Given** un invité sans compte
**When** il tente CRUD sans token
**Then** refusé (→ accès lecture via 7.5 uniquement)

**Technical Requirements:**

- Middleware RBAC : `require_writer` sur endpoints mutation documents
- Table : `dialogues_index` (migration 002)
- Hook save document : upsert index après PUT réussi
- Frontend : `useAuthStore.hasPermission('edit')` ; masquer actions si false
- Backfill optionnel : script one-shot index dialogues existants
- Tests : owner isolation, index sync, RBAC mutation

**References:** FR67, Story 7.6, Story 7.8, Epic 8 (consomme index)

---

### Story 7.5: Invités en lecture seule sans compte (FR68)

As a **invité (sans compte)**,
I want **consulter un dialogue partagé via un lien**,
So that **je peux lire le contenu sans risque de modification et sans créer de compte**.

**Acceptance Criteria:**

**Given** je suis writer propriétaire
**When** je génère un "Lien invité lecture seule"
**Then** un token URL est créé dans `share_links`
**And** je peux copier l'URL (ex. `/guest/dialogues/{token}`)

**Given** j'ouvre le lien invité sans être connecté
**When** le token est valide et non expiré/révoqué
**Then** le graphe s'affiche en **lecture seule**
**And** indicateur "Mode invité — lecture seule"
**And** export Unity autorisé (Epic 5)

**Given** j'ouvre le lien invité
**When** je tente d'éditer (drag nœud, save, génération LLM)
**Then** actions bloquées (frontend + API 403)

**Given** le propriétaire révoque le lien
**When** l'invité recharge
**Then** 404 / message "Lien expiré ou révoqué"

**Technical Requirements:**

- Table : `share_links` (migration 003)
- Endpoints : `POST/DELETE /api/v1/dialogues/{id}/guest-link`, `GET /api/v1/guest/dialogues/{token}` (read-only)
- Frontend : route `/guest/dialogues/:token`, GraphEditor mode readonly
- **Pas** de rôle `viewer` en `users` — distinct de partage compte (7.6)
- Tests : token valide/expiré/révoqué, readonly API, pas de mutation

**References:** FR68, Story 7.4, Story 7.7

---

### Story 7.6: Partager dialogues en co-édition entre writers (FR69)

As a **propriétaire de dialogue**,
I want **inviter un autre writer à co-éditer**,
So that **nous collaborons sur le même fichier**.

**Acceptance Criteria:**

**Given** je suis propriétaire ou admin
**When** je partage avec un writer existant
**Then** entrée `dialogue_shares` (permission=`writer`)
**And** le dialogue apparaît dans sa liste (filtrée via index + shares)

**Given** je suis co-éditeur (share writer)
**When** j'édite le dialogue
**Then** modifications autorisées ; `last_modified_by` mis à jour

**Given** je retire le partage
**When** DELETE share
**Then** le co-éditeur perd l'accès (sauf lien invité 7.5 s'il en avait un)

**Given** je partage
**When** je choisis la permission
**Then** seul `writer` (co-édition) — pas de share read-only compte (→ utiliser lien invité 7.5)

**Technical Requirements:**

- Table : `dialogue_shares` (migration 003)
- Endpoints : `POST/DELETE /api/v1/dialogues/{id}/shares`
- Service : `DialogueSharingService`
- Frontend : `DialogueSharingModal.tsx`
- Tests : share/revoke, co-edit, owner-only grant

**References:** FR69, Story 7.4, Story 7.5, Story 7.7

---

### Story 7.7: Voir qui a accès à chaque dialogue (FR70)

As a **gestionnaire de dialogue**,
I want **voir propriétaire, co-éditeurs et liens invités actifs**,
So that **je maîtrise la surface d'exposition du contenu**.

**Acceptance Criteria:**

**Given** j'ai accès au dialogue (owner, co-editor, admin)
**When** j'ouvre "Permissions"
**Then** propriétaire, liste co-éditeurs (writers), liens invités actifs (créés le, expire le)
**And** je peux révoquer partages et liens invités si owner/admin

**Given** je consulte la liste dialogues
**When** je survole un dialogue
**Then** tooltip "Privé" | "Co-édité (N)" | "Lien invité actif"

**Technical Requirements:**

- Endpoint : `GET /api/v1/dialogues/{id}/permissions`
- Join : `dialogues_index` + `dialogue_shares` + `users` + `share_links`
- Frontend : `DialoguePermissionsPanel.tsx`
- Tests : agrégation permissions, filtre par type accès

**References:** FR70, Story 7.5, Story 7.6

---

### Story 7.8: Audit logs actions utilisateurs (FR71, V1.5+)

As an **administrateur**,
I want **consulter un journal des actions**,
So that **je trace activité et incidents**.

**Acceptance Criteria:**

**Given** une mutation (create user, save dialogue, share, revoke link, role change)
**When** elle réussit
**Then** entrée `audit_logs` append-only

**Given** je suis admin
**When** j'ouvre Audit logs
**Then** liste filtrable (user, action, période) + export CSV/JSON

**Given** je suis writer
**When** j'accède audit logs
**Then** 403

**Technical Requirements:**

- Table : `audit_logs` (migration 004)
- Service : `AuditLogService.log_action()` appelé depuis services métier (pas seulement middleware)
- Endpoint : `GET /api/v1/audit-logs` (admin, paginé)
- Frontend : `AuditLogsPanel.tsx`
- Tests : append-only, filtres, admin-only

**References:** FR71, Stories 7.3-7.7

---

### Story 7.9: Préférences utilisateur synchronisées serveur

As a **writer**,
I want **mes réglages (contexte, génération) suivent mon compte**,
So that **j'ai la même expérience sur plusieurs postes**.

**Acceptance Criteria:**

**Given** je me connecte sur un nouveau navigateur
**When** l'app charge mes settings
**Then** `GET /api/v1/users/me/settings` retourne namespaces `context` et `generation`
**And** les stores frontend s'hydratent depuis l'API

**Given** je modifie le budget tokens ou profil auteur
**When** je sauvegarde
**Then** `PUT /api/v1/users/me/settings/{namespace}` persiste en `user_settings`
**And** localStorage devient cache optionnel (fallback offline non requis V1.5)

**Given** j'avais des prefs en localStorage avant migration
**When** je me connecte la première fois
**Then** migration best-effort vers serveur si clés absentes en base
**And** pas d'écrasement si serveur a déjà des valeurs

**Technical Requirements:**

- Table : `user_settings` (déjà en 001)
- Endpoints : `GET/PUT /api/v1/users/me/settings`, `GET .../settings/{namespace}`
- Frontend : adapter `contextConfigStore`, `useAuthorProfile` — sync API post-login
- Tests : round-trip settings, migration localStorage mock, isolation par user

**References:** NFR-SC2, Story 7.2, namespaces documentés ci-dessus

---

## Hors périmètre SQLite (explicitement)

- **Corps des dialogues** (nodes, choices) — JSON fichiers
- **GDD / Notion sync shards** — JSON + pipeline existant
- **Presets** — fichiers `data/presets/` (owner metadata → Epic 6 si besoin)
- **Usage LLM journalier** — fichiers (agrégats dashboard → Epic 13 ; option SQL plus tard)
- **`config/*.json` déployés avec le code** — Git, pas DB

---

## Dépendances inter-epics (mise à jour)

| Epic | Relation |
|------|----------|
| Epic 0 | JWT, rate limit, SecurityConfig — **consommé** |
| Epic 8 | Listing/recherche s'appuie sur `dialogues_index` (7.4) + RBAC |
| Epic 10 | Historique par user — `last_modified_by`, audit 7.8 |
| Epic 6 | Presets partagés équipe — metadata owner possible post-7.3 |
