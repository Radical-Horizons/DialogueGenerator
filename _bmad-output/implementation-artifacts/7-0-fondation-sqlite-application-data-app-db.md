# Story 7.0: fondation-sqlite-application-data-app-db

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **développeur / opérateur**,
I want **une base SQLite locale versionnée par migrations**,
so that **auth, préférences et métadonnées multi-utilisateur sont persistants et transactionnels sans serveur DB externe**.

## Acceptance Criteria

1. **Given** l'API démarre sans fichier `data/app.db`  
   **When** le lifespan FastAPI s'exécute  
   **Then** le répertoire `data/` est créé si absent  
   **And** les migrations pending sont appliquées automatiquement  
   **And** la version courante est enregistrée dans `schema_migrations`

2. **Given** une migration échoue  
   **When** le boot continue  
   **Then** l'API refuse de servir les routes métier dépendantes (fail-fast) avec log explicite  
   **And** `/health` indique `database: error` (check `name: "database"`, `status: "unhealthy"`)

3. **Given** `ServiceContainer` est initialisé  
   **When** un router demande `UserRepository` ou `DatabaseConnection`  
   **Then** une instance partagée par processus est injectée (thread-safe via `check_same_thread=False` + lock ou connexion par thread documentée)

4. **Given** les tests pytest s'exécutent  
   **When** `conftest` configure l'environnement  
   **Then** une base SQLite temporaire (`tmp_path`) est utilisée — jamais `data/app.db` de dev

## Tasks / Subtasks

- [ ] Task 1 : Boot applique les migrations SQLite au premier démarrage (AC: #1)
  - [ ] 🔴 Test échoue : lifespan avec `APP_DATABASE` sur `tmp_path` inexistant → fichier créé, tables `schema_migrations` + `users` + `user_settings` + `app_settings` présentes, version `001` enregistrée ; second boot idempotent (aucune erreur, une seule ligne migration)
  - [ ] 🟢 Implémenter couche `services/repositories/sqlite/` (connection, runner migrations, `001_initial.sql`) + hook lifespan minimal (voir Dev Notes)
  - [ ] 🔵 Refactor : isoler la résolution du chemin DB (`FilePaths.APP_DATABASE` + override env) dans un helper unique testable, éviter duplication lifespan/tests. Si applicable : extraire le SQL de `001_initial.sql` en constantes nommées uniquement si le runner devient verbeux.

- [ ] Task 2 : Échec migration → fail-fast + health `database` unhealthy (AC: #2)
  - [ ] 🔴 Test échoue : migration invalide (fixture SQL corrompue ou migration forcée en échec) → `perform_health_checks()` contient check `database` unhealthy ; requête métier typique (`GET /api/v1/documents` ou équivalent existant) retourne 503/503-like avec message explicite (pas de données servies depuis DB absente)
  - [ ] 🟢 Implémenter état global `database_ready` + middleware/dependency fail-fast + `check_database()` dans `health_check.py` (voir Dev Notes)
  - [ ] 🔵 Refactor : factoriser le pattern « service indisponible au boot » pour que health et middleware lisent la même source d'état (pas deux flags divergents). Si applicable : clarifier nommage du check (`database` vs `storage`).

- [ ] Task 3 : Injection DI partagée `DatabaseConnection` / `UserRepository` (AC: #3)
  - [ ] 🔴 Test échoue : deux appels `container.get_database_connection()` (ou `get_user_repository()`) retournent la même instance ; accès concurrent basique (2 threads lecture `SELECT 1`) ne lève pas d'exception
  - [ ] 🟢 Enregistrer getters dans `ServiceContainer` + `api/dependencies.py` ; `UserRepository` minimal (CRUD stub ou `ping()` — pas encore branché sur `AuthService`, story 7.1)
  - [ ] 🔵 Refactor : aligner le reset `container.reset()` pour inclure les nouveaux champs `_database_connection` / `_user_repository` (cohérence reload uvicorn). Si applicable : Protocol `IUserRepository` pour préparer 7.1 sans couplage concret.

- [ ] Task 4 : Isolation pytest — jamais `data/app.db` de dev (AC: #4)
  - [ ] 🔴 Test échoue : avec fixture autouse `conftest`, fichier `data/app.db` du repo (s'il existait) n'est ni créé ni modifié ; variable env `APP_DATABASE` pointe vers `tmp_path`
  - [ ] 🟢 Étendre `tests/conftest.py` : fixture session/function autouse + documenter override `APP_DATABASE` (voir Dev Notes)
  - [ ] 🔵 Refactor : harmoniser le pattern d'override DB avec `unlimited_llm_cost_budget` (même style patch env + container). Si applicable : nommer la fixture `isolated_app_database` pour lisibilité des tests futurs epic 7.

## Dev Notes

- **Architecture guardrails**
  - SQLite **stdlib `sqlite3` uniquement** — pas de `aiosqlite` ni nouvelle dépendance `requirements.txt`.
  - Chemin canonique : `FilePaths.APP_DATABASE = DATA_DIR / "app.db"` dans `constants.py` ; override tests via env `APP_DATABASE` (à documenter dans fixture).
  - Migrations : `services/repositories/sqlite/migrations/00N_*.sql` + `migrations/runner.py` ; table `schema_migrations(version TEXT PRIMARY KEY, applied_at TEXT)`.
  - **WAL mode** : `PRAGMA journal_mode=WAL` au connect (lectures concurrentes 3–5 users, NFR-SC2).
  - **DI** : enregistrement dans `api/container.py` — pas de singleton global hors container (contrairement à `AuthService()` actuel dans `api/routers/auth.py` — **ne pas migrer AuthService dans cette story**, story 7.1).
  - **Hors périmètre 7.0** : seed admin, login DB, tables `dialogues_index` / `share_links` / `audit_logs` (migrations 002+), frontend.
  - Conserver `DISABLE_AUTH=true` et comportement dev existant inchangé.

- **What to reuse**
  - Pattern repository fichier : `FileCostBudgetRepository` (`services/repositories/cost_budget_repository.py`) — Protocol + impl, path injecté, `threading.Lock`.
  - Pattern store config : `GddNotionSyncConfigStore` — chemins via `FilePaths`, `ensure_dirs()`.
  - Lifespan hook : `api/main.py` `lifespan()` après `security_config_ok`, avant ou au début du bloc `ServiceContainer()` (~l.107–112).
  - Health : étendre `perform_health_checks()` dans `api/utils/health_check.py` (checks `config`, `storage` existants).
  - Tests budget : modèle `unlimited_llm_cost_budget` dans `tests/conftest.py` (patch path + container).

- **Migration 001 — tables minimales**
  - `schema_migrations`, `users` (id TEXT PK, username UNIQUE, email, hashed_password, role, is_active, created_at, updated_at), `user_settings` (user_id, namespace, key, value JSON, UNIQUE composite), `app_settings` (key PK, value JSON, updated_by, updated_at).
  - Pas de données seed dans 7.0 (seed admin = story 7.1).

- **Quality bar (tests comportementaux)**
  - `tests/services/repositories/sqlite/test_migrations.py` : apply, idempotence, rollback sur SQL invalide.
  - `tests/services/repositories/sqlite/test_connection.py` : WAL, thread-safety minimal.
  - `tests/api/test_health_database.py` ou extension `tests/api/test_health.py` : check database present.
  - `tests/conftest.py` : preuve non-écriture `data/app.db`.
  - Commande ciblée : `node scripts/getPythonPath.js -m pytest tests/services/repositories/sqlite/ tests/api/test_health.py -v --tb=short`

- **Refactor bar (defaults dev-story)**
  - Fichiers touchés visés < 300 lignes **ajoutés** ; fichiers existants modifiés : extraire logique migration dans `services/`, pas dans `main.py` (> 30 lignes de logique SQL interdites dans lifespan).
  - Fonctions ~60 lignes max.

- **Fichiers chauds** (pré-existants > 500 lignes à modifier)
  - `api/main.py` (788 L) — lifespan : **≤ 15 lignes** d'appel délégué (`run_migrations()`, `set_database_ready()`), toute logique dans `services/repositories/sqlite/`.
  - `api/utils/health_check.py` (368 L) — ajouter `check_database()` ≤ 40 lignes, déléguer détails au connection/runner.
  - `api/container.py` (441 L) — ajouter getters lazy ; si dépassement, extraire mixin `DatabaseProvidersMixin` plutôt qu'élargir le fichier.

- **Conventions**
  - Package : `services/repositories/sqlite/` (miroir `services/repositories/cost_budget_repository.py`).
  - `.gitignore` : ajouter `data/app.db`, `data/app.db-wal`, `data/app.db-shm`.
  - Logs : `logger.error`/`critical` sur échec migration avec chemin DB (pas de secrets).
  - Annotations types + docstrings PEP257 sur tout code Python ajouté.

### Project Structure Notes

- Nouveau : `services/repositories/sqlite/__init__.py`, `connection.py`, `migrations/runner.py`, `migrations/001_initial.sql`, `user_repository.py` (minimal).
- Modifier : `constants.py`, `api/container.py`, `api/main.py`, `api/utils/health_check.py`, `api/dependencies.py` (si `Depends` DB), `tests/conftest.py`, `.gitignore`.
- **Ne pas** créer `api/services/sqlite_*` — logique dans `services/repositories/sqlite/`.
- **Ne pas** dupliquer les repos JSON existants (`FileCostBudgetRepository`, `GddNotionSyncConfigStore`) pour des données déjà fichier.

### References

- [Source: _bmad-output/planning-artifacts/epics/epic-07.md#Story 7.0]
- [Source: _bmad-output/planning-artifacts/epics/epic-07.md#Architecture SQLite — périmètre]
- [Source: _bmad-output/project-context.md#Framework-Specific Rules]
- [Source: api/container.py — ServiceContainer lazy getters]
- [Source: services/repositories/cost_budget_repository.py — Protocol + file repo pattern]
- [Source: tests/conftest.py — unlimited_llm_cost_budget isolation pattern]
- [Source: AGENTS.md — DISABLE_AUTH local dev intent]

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### File List
