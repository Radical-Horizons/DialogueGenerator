# Story 7.1: Créer comptes utilisateurs — admin only (FR64)

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As an **administrateur**,
I want **créer des comptes writer pour mon équipe**,
so that **chaque collaborateur a ses identifiants sans inscription publique**.

## Acceptance Criteria

1. **Given** je suis authentifié en tant qu'admin  
   **When** j'appelle `POST /api/v1/users` avec username, email, password  
   **Then** le compte est créé avec rôle `writer` par défaut  
   **And** le password est hashé bcrypt en base  
   **And** la réponse retourne `UserResponse` sans `hashed_password`

2. **Given** je ne suis pas admin (writer ou non authentifié)  
   **When** j'appelle `POST /api/v1/users`  
   **Then** la requête est refusée (403)

3. **Given** le username existe déjà  
   **When** je tente de créer le compte  
   **Then** erreur 409 "Username déjà utilisé"

4. **Given** password < 8 caractères ou email invalide  
   **When** je tente de créer le compte  
   **Then** erreur 422 avec détail par champ

5. **Given** aucun user en base au premier boot  
   **When** l'API démarre et `ADMIN_PASSWORD` est défini  
   **Then** le compte `admin` est seedé avec rôle `admin`  
   **And** si `ADMIN_PASSWORD` absent en production → log warning + pas de seed (fail sécurisé documenté)

6. **Given** un writer est créé  
   **When** la création réussit  
   **Then** aucun auto-login côté API (l'admin transmet les identifiants hors bande)

## Tasks / Subtasks

- [ ] Task 1 : Endpoint `POST /api/v1/users` crée un compte writer (AC: #1, #2, #3, #4)
  - [ ] 🔴 Test échoue : admin authentifié POST /api/v1/users → 201, UserResponse sans hashed_password, rôle `writer` ; writer POST → 403 ; username dupliqué → 409 ; password < 8 chars → 422
  - [ ] 🟢 Créer `api/routers/users.py` avec router `/api/v1/users` + `require_admin` dependency ; créer `api/schemas/users.py` (UserCreate, UserResponse) ; ajouter `create_user()` dans `AuthService` qui délègue à `UserRepository.insert()` ; enregistrer le router dans `api/main.py`
  - [ ] 🔵 Refactor : si `api/routers/users.py` dépasse 80 lignes, séparer la logique métier dans `AuthService` (pas dans le router)

- [ ] Task 2 : Seed admin au premier boot depuis `ADMIN_PASSWORD` (AC: #5)
  - [ ] 🔴 Test échoue : avec env `ADMIN_PASSWORD=test123` et base vide → `UserRepository.find_by_username('admin')` retourne un user role `admin` après boot ; sans `ADMIN_PASSWORD` en production → warning loggé, aucun user seedé
  - [ ] 🟢 Dans lifespan `api/main.py`, après `run_migrations()`, appeler `seed_admin_if_needed()` dans `AuthService` ; lire `ADMIN_PASSWORD` via `os.environ.get()` ; ne pas seeder si user `admin` existe déjà (idempotent)
  - [ ] 🔵 Refactor : si seed logic > 20 lignes, extraire dans `AuthService.seed_admin()` plutôt que dans lifespan

- [ ] Task 3 : `require_admin` dependency FastAPI (AC: #2)
  - [ ] 🔴 Test échoue : requête avec token writer → 403 ; requête avec token admin → passe ; `DISABLE_AUTH=true` → bypass (comportement dev inchangé)
  - [ ] 🟢 Ajouter `require_admin` dans `api/dependencies.py` qui vérifie `current_user.role == "admin"` ; lever `HTTPException(403)` sinon ; brancher sur le mécanisme `DISABLE_AUTH` existant (voir `get_current_user` pattern dans auth router)
  - [ ] 🔵 Refactor : si la vérification de rôle est dupliquée avec `get_current_user`, factoriser un helper `check_role(user, required_role)`

- [ ] Task 4 : `UserRepository.insert()` + `UserRepository.find_by_username()` (AC: #1, #3)
  - [ ] 🔴 Test échoue : insert user → trouvable par find_by_username ; insert username dupliqué → `IntegrityError` converti en 409 ; find user inexistant → None
  - [ ] 🟢 Étendre `services/repositories/sqlite/user_repository.py` (créé en 7.0) avec `insert(user_data) -> UserRecord` et `find_by_username(username) -> Optional[UserRecord]` ; gérer `sqlite3.IntegrityError` sur UNIQUE constraint
  - [ ] 🔵 Refactor : si `UserRecord` TypedDict existe en 7.0, ne pas recréer ; réutiliser le type existant

- [ ] Task 5 : Tests isolation + DISABLE_AUTH (AC: #1, #2, #5, #6)
  - [ ] 🔴 Test échoue : l'ensemble des tests API users passe avec base temporaire `tmp_path` (fixture `isolated_app_database` de 7.0) ; `DISABLE_AUTH=true` → create user bypass auth mais log warning
  - [ ] 🟢 Tous les tests `tests/api/test_users.py` utilisent fixture `isolated_app_database` ; aucun test ne lit/écrit `data/app.db`
  - [ ] 🔵 Refactor : si des helpers de test sont partagés avec epic 7 (ex. `create_admin_token()`), les placer dans `tests/helpers/auth_helpers.py`

## Dev Notes

### Dépendance critique : Story 7.0 doit être terminée avant 7.1

Les éléments suivants doivent exister avant d'implémenter cette story :
- `services/repositories/sqlite/connection.py` — `DatabaseConnection` avec WAL mode
- `services/repositories/sqlite/migrations/runner.py` — `run_migrations()`
- `services/repositories/sqlite/user_repository.py` — stub `UserRepository` (au moins `__init__`)
- `services/repositories/sqlite/migrations/001_initial.sql` — table `users` avec colonnes : `id TEXT PRIMARY KEY, username TEXT UNIQUE, email TEXT, hashed_password TEXT, role TEXT DEFAULT 'writer', is_active INTEGER DEFAULT 1, created_at TEXT, updated_at TEXT`
- `constants.py::FilePaths.APP_DATABASE` — chemin `data/app.db`
- `api/container.py` — getters `get_database_connection()`, `get_user_repository()`
- `tests/conftest.py` — fixture `isolated_app_database` avec override `APP_DATABASE` via env

**Si ces éléments n'existent pas, implémenter Story 7.0 en premier.**

### Code existant critique à comprendre avant de modifier

**`api/services/auth_service.py` (état actuel)**
- `_users_db` : dict in-memory avec admin hardcodé — **NE PAS SUPPRIMER pour l'instant** (login story 7.2)
- `hash_password()` / `verify_password()` — utilise `bcrypt` stdlib, à réutiliser tel quel
- `authenticate_user()` — lit encore `_users_db` jusqu'à story 7.2 (ne pas toucher ici)
- `get_user_by_username()` — lit `_users_db` jusqu'à story 7.2 (ne pas toucher ici)
- **AJOUTER** : `create_user(username, email, password, role='writer')` → délègue à `UserRepository.insert()`
- **AJOUTER** : `seed_admin_if_needed(admin_password)` → check if admin exists in SQLite, insert if not

**`api/routers/auth.py` (état actuel)**  
- `auth_service = AuthService()` — singleton module-level → **ne pas toucher** (risque régression login)
- Dans 7.1, `users.py` router créera son propre accès à `AuthService` via `ServiceContainer`
- **Attention** : NE PAS déplacer l'instance auth_service d'`auth.py` dans cette story (7.2 fait ça proprement)

**`api/container.py` (état après 7.0)**  
- Ajouter getter `get_auth_service()` si pas encore présent — instancie `AuthService` en lui passant `user_repository`
- Pattern lazy getter : copier le style des getters existants (ex. `get_config_service`)

### Nouvelles entités Pydantic à créer

**`api/schemas/users.py`** :
```python
class UserCreate(BaseModel):
    username: str = Field(min_length=3, max_length=50)
    email: EmailStr
    password: str = Field(min_length=8)

class UserResponse(BaseModel):
    id: str
    username: str
    email: str
    role: str  # 'admin' | 'writer'
    is_active: bool
    created_at: str
    # JAMAIS hashed_password dans la réponse
```

### `require_admin` dependency

```python
async def require_admin(current_user = Depends(get_current_user)) -> dict:
    # get_current_user retourne None si DISABLE_AUTH=true → mock admin
    if current_user is None:
        return {"username": "admin", "role": "admin"}  # dev bypass
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin role required")
    return current_user
```

**Important** : Conserver le comportement `DISABLE_AUTH=true` — voir `AGENTS.md` § "Local dev auth (owner intent)". Ne pas le supprimer ou le durcir.

### Seed admin

```python
# Dans AuthService
def seed_admin_if_needed(self, admin_password: str | None) -> None:
    if self._user_repository is None:
        return  # 7.0 non initialisé, skip silencieux
    existing = self._user_repository.find_by_username("admin")
    if existing:
        return  # idempotent
    if not admin_password:
        logger.warning("ADMIN_PASSWORD non défini — compte admin non seedé. Définir ADMIN_PASSWORD avant redémarrage.")
        return
    hashed = self.hash_password(admin_password)
    self._user_repository.insert({
        "id": str(uuid.uuid4()),
        "username": "admin",
        "email": "admin@example.com",
        "hashed_password": hashed,
        "role": "admin",
    })
    logger.info("Compte admin seedé depuis ADMIN_PASSWORD")
```

### Liaison lifespan `api/main.py`

Après l'appel `run_migrations()` de 7.0 (déjà en place), ajouter :
```python
admin_password = os.environ.get("ADMIN_PASSWORD")
container.get_auth_service().seed_admin_if_needed(admin_password)
```
**Contrainte taille** : ≤ 5 lignes dans le lifespan, toute logique dans `AuthService`.

### Enregistrement router dans `api/main.py`

```python
from api.routers import users as users_router
app.include_router(users_router.router, prefix="/api/v1", tags=["users"])
```

### Stack technique — bibliothèques

- **sqlite3** : stdlib Python, déjà utilisé en 7.0. Pas de nouvelles dépendances.
- **bcrypt** : déjà dans `requirements.txt` et `auth_service.py`. Réutiliser `hash_password()` existant.
- **pydantic** : `EmailStr` nécessite `pydantic[email]` (déjà installé — vérifié via `api/schemas/auth.py`)
- **uuid** : `import uuid` stdlib pour générer les IDs utilisateur

### Patterns à réutiliser (ne pas réinventer)

- `FileCostBudgetRepository` dans `services/repositories/cost_budget_repository.py` — modèle Protocol + implémentation, pattern à copier pour `UserRepository`
- Getters lazy dans `api/container.py` — copier le pattern `if self._xxx is None: self._xxx = Xxx()`  
- Pattern `check_role` : voir `api/middleware/auth.py` si `role` est déjà vérifié quelque part

### Périmètre strict de 7.1 (ne PAS implémenter ici)

- ❌ `PATCH /api/v1/users/{id}` — géré en 7.3 (admin UI)
- ❌ `GET /api/v1/users` — géré en 7.3
- ❌ Wiring `authenticate_user()` vers SQLite — géré en 7.2
- ❌ Suppression du `_users_db` hardcodé dans `auth_service.py` — géré en 7.2
- ❌ Frontend `UserManagementPanel.tsx` — géré en 7.3
- ❌ Tables `dialogues_index`, `dialogue_shares`, `share_links` — migrations 002+
- ❌ Auto-login après création — explicitement exclu (AC #6)

### Quality bar (tests comportementaux)

Fichier principal : `tests/api/test_users.py`

Tests requis :
- `test_create_user_as_admin_succeeds` — POST /api/v1/users → 201, rôle writer, pas de hashed_password
- `test_create_user_as_writer_returns_403` — token writer → 403
- `test_create_user_unauthenticated_returns_403` — sans token → 403
- `test_create_user_duplicate_username_returns_409`
- `test_create_user_invalid_password_short_returns_422`
- `test_create_user_invalid_email_returns_422`
- `test_seed_admin_on_first_boot` — base vide + ADMIN_PASSWORD défini → admin en base
- `test_seed_admin_idempotent` — deuxième boot → pas de doublon ni erreur
- `test_seed_admin_no_env_var_in_production` — ADMIN_PASSWORD absent en prod → warning, pas de crash

Commande ciblée :
```
node scripts/getPythonPath.js -m pytest tests/api/test_users.py -v --tb=short
```

### Project Structure Notes

**Nouveaux fichiers** :
- `api/routers/users.py` — router `POST /api/v1/users`
- `api/schemas/users.py` — `UserCreate`, `UserResponse`
- `tests/api/test_users.py` — suite tests complets

**Fichiers modifiés** :
- `api/services/auth_service.py` — ajouter `create_user()`, `seed_admin_if_needed()`, paramètre optionnel `user_repository` dans `__init__`
- `api/container.py` — ajouter getter `get_auth_service()` (si pas encore présent post-7.0)
- `api/dependencies.py` — ajouter `require_admin` dependency
- `api/main.py` — inclure router users + appel seed_admin dans lifespan (≤ 5 lignes ajoutées)
- `services/repositories/sqlite/user_repository.py` — ajouter/compléter `insert()` et `find_by_username()`

**Ne pas créer** :
- `api/services/user_service.py` — logique dans `AuthService` ou `UserRepository` uniquement
- `api/routers/admin.py` — router admin global prévu en 7.3, pas maintenant

**Fichiers chauds à modifier avec précaution** :
- `api/main.py` (788 L) — ajouter ≤ 5 lignes dans lifespan + include_router ; ne pas réorganiser
- `api/container.py` (441 L) — ajouter 1 getter lazy ; si > 500 L après ajout, extraire mixin `UserProvidersMixin`
- `api/services/auth_service.py` — `_users_db` dict doit rester intact (ne pas supprimer avant 7.2)

### Intelligence story 7.0 (précédente)

Patterns établis en 7.0 (ou attendus) :
- Fixture `isolated_app_database` dans `tests/conftest.py` — utiliser pour tous les tests 7.1
- Pattern `container.reset()` inclut `_database_connection` et `_user_repository` — vérifier que reset est cohérent avec nouveau `_auth_service`
- WAL mode activé sur connection SQLite — pas à reconfigurer
- `UserRepository` a un stub `ping()` ou équivalent — vérifier avant d'ajouter `insert()`

Commits git récents (contexte) :
- Activité récente sur GDD/Notion sync — pas de conflit attendu avec epic 7
- Aucun commit SQLite visible → confirme que 7.0 est `ready-for-dev` mais pas codé

### References

- [Source: _bmad-output/planning-artifacts/epics/epic-07.md#Story 7.1]
- [Source: _bmad-output/planning-artifacts/epics/epic-07.md#Architecture SQLite — périmètre]
- [Source: _bmad-output/planning-artifacts/epics/epic-07.md#Décisions produit]
- [Source: _bmad-output/implementation-artifacts/7-0-fondation-sqlite-application-data-app-db.md]
- [Source: api/services/auth_service.py — hash_password, verify_password, _users_db pattern]
- [Source: api/routers/auth.py — singleton auth_service, DISABLE_AUTH pattern]
- [Source: api/container.py — ServiceContainer lazy getters]
- [Source: api/dependencies.py — get_current_user, injection pattern]
- [Source: services/repositories/cost_budget_repository.py — Protocol + file repo pattern]
- [Source: AGENTS.md — DISABLE_AUTH local dev intent (ne pas supprimer)]

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### File List
