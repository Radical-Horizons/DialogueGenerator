# DialogueGenerator API REST

API REST FastAPI pour la génération de dialogues IA pour jeux de rôle.

> **Agents** : quickstart partiel seulement. Invocation → `.cursor/skills/api-runbook/SKILL.md` + `npm run api:invoke`. Contrats complets → [`docs/api/api-contracts-api.md`](docs/api/api-contracts-api.md). Commande Cursor → `.cursor/commands/api-runbook.md`.

Cette API est utilisée par l'**interface web React** (interface principale).

## Démarrage rapide

### Installation

**Méthode recommandée: Script automatique**

```bash
npm run setup
```

Ce script va:
- Créer un environnement virtuel Python (`.venv/`)
- Installer toutes les dépendances depuis `requirements.txt`
- Vérifier l'installation

**Méthode manuelle:**

```bash
# Créer le venv
python -m venv .venv

# Activer le venv (Windows PowerShell)
.\.venv\Scripts\Activate.ps1

# Installer les dépendances
pip install -r requirements.txt
```

**Note:** Tous les scripts npm utilisent automatiquement le venv. Vous n'avez besoin de l'activer manuellement que si vous exécutez des commandes Python directement.

### Configuration

1. **Créer le fichier `.env`** :
   ```bash
   cp .env.example .env
   ```

2. **Modifier `.env`** et définir les variables d'environnement :
   - `OPENAI_API_KEY`: Clé API OpenAI (requis)
   - `OPENROUTER_API_KEY`: Clé OpenRouter (optionnel — modèles finetuned / Aion)
   - `JWT_SECRET_KEY`: Clé secrète pour JWT (requis en production, valeur par défaut acceptée en dev)
   - `ENVIRONMENT`: Environnement (`development` ou `production`)
   - `AUTH_RATE_LIMIT_ENABLED`: Activer le rate limiting (par défaut: `true`)
   - `AUTH_RATE_LIMIT_REQUESTS`: Nombre de requêtes par fenêtre (par défaut: `20`)
   - `AUTH_RATE_LIMIT_WINDOW`: Fenêtre en secondes (par défaut: `60`)
   - `LOG_FILE_ENABLED`: Activer l'archivage des logs dans des fichiers (par défaut: `true`)
   - `LOG_RETENTION_DAYS`: Durée de rétention des logs en jours (par défaut: `30`)
   - `LOG_DIR`: Dossier de stockage des logs (par défaut: `data/logs`)
   - `LOG_MAX_FILE_SIZE_MB`: Taille maximale d'un fichier de log en MB avant rotation (par défaut: `100`)
   - `LOG_FORMAT`: Format des logs (`json` ou `text`, par défaut: `text` en dev, `json` en prod)
   - `LOG_LEVEL`: Niveau de log (`DEBUG`, `INFO`, `WARNING`, `ERROR`, `CRITICAL`, par défaut: `INFO`)

   **Note** : Voir `.env.example` pour la liste complète des variables. En production, `JWT_SECRET_KEY` **doit** être changée et ne peut pas être la valeur par défaut.

3. **Générer une clé secrète JWT sécurisée** (recommandé) :
   ```bash
   python -c "import secrets; print(secrets.token_urlsafe(32))"
   ```

Pour plus de détails sur la sécurité, voir [docs/guides/SECURITY.md](docs/guides/SECURITY.md).

### Lancer l'API

**Méthode 1: Via npm (utilise automatiquement le venv)**
```bash
npm start
# ou
npm run start:api
```

**Méthode 2: Via Python directement (nécessite activation du venv)**
```bash
# Activer le venv d'abord
.\.venv\Scripts\Activate.ps1

# Puis lancer l'API
python -m api.main
```

**Méthode 3: Via uvicorn directement**
```bash
# Avec le venv activé — port aligné dev (proxy Vite / E2E utilisent 4243 par défaut)
API_PORT=4243 uvicorn api.main:app --reload --host 0.0.0.0 --port 4243
```

Sans `API_PORT`, `python -m api.main` utilise le défaut **`4242`** (`api/main.py`). `npm run dev` fixe **`API_PORT=4243`** via `scripts/dev.js`.

L'API sera accessible sur (exemple port **4243**) :
- API: http://localhost:4243
- Documentation Swagger: http://localhost:4243/api/docs
- Documentation ReDoc: http://localhost:4243/api/redoc

## Endpoints principaux

### Authentification et administration (Epic 7)

- `POST /api/v1/auth/guest` - Session invité lecture seule (JWT `role=guest`, TTL 8 h, sans refresh)
- `POST /api/v1/auth/login` - Connexion admin/writer (access token + cookie refresh httpOnly)
- `POST /api/v1/auth/refresh` - Rafraîchir l'access token (cookie refresh)
- `GET /api/v1/auth/me` - Utilisateur courant (`admin` | `writer` | `guest`)
- `POST /api/v1/auth/logout` - Déconnexion (efface le cookie refresh)
- `POST /api/v1/auth/me/password` - Changer son mot de passe (admin/writer)
- `GET/PUT /api/v1/users/me/settings` — Préférences serveur (`context`, `generation`)
- `POST/GET/PATCH /api/v1/users` - Gestion des comptes (admin only)
- `GET /api/v1/audit-logs` - Journal d'audit (admin only)
- `GET/POST/DELETE /api/v1/dialogues/{id}/shares` - Partage co-édition writer (propriétaire/admin)

Contrats complets : [`docs/api/api-contracts-api.md`](docs/api/api-contracts-api.md).

### Génération de dialogues

- `POST /api/v1/dialogues/generate/variants` - Générer variantes texte
- `POST /api/v1/dialogues/generate/interactions` - Générer interactions structurées (supporte `previous_interaction_id` pour la continuité)
- `POST /api/v1/dialogues/preview-prompt` - Prévisualiser le prompt brut construit (sans estimation de tokens)
- `POST /api/v1/dialogues/estimate-tokens` - Estimer tokens et retourner le prompt brut (pour l'estimation avant génération)

> **Note** : l'ancien module `/api/v1/interactions/*` (CRUD interactions) a été retiré. Utiliser les documents Unity / unity-dialogues à la place.

### Contexte GDD

- `GET /api/v1/context/characters` - Liste personnages
- `GET /api/v1/context/characters/{name}` - Détails d'un personnage
- `GET /api/v1/context/locations` - Liste lieux
- `GET /api/v1/context/locations/{name}` - Détails d'un lieu
- `GET /api/v1/context/items` - Liste objets
- `GET /api/v1/context/species` - Liste espèces
- `GET /api/v1/context/species/{name}` - Détails d'une espèce
- `GET /api/v1/context/communities` - Liste communautés
- `GET /api/v1/context/communities/{name}` - Détails d'une communauté
- `GET /api/v1/context/locations/regions` - Liste régions
- `GET /api/v1/context/locations/regions/{name}/sub-locations` - Sous-lieux d'une région
- `POST /api/v1/context/linked-elements` - Suggère des éléments liés
- `POST /api/v1/context/build` - Construire contexte

### Configuration

- `GET /api/v1/config/llm` - Configuration LLM
- `GET /api/v1/config/llm/models` - Modèles disponibles
- `GET /api/v1/config/context` - Configuration contexte

### Documents canoniques (Story 16.2 + extensions)

- `GET /api/v1/documents/{document_id}` — Document JSON persisté + révision
- `PUT /api/v1/documents/{document_id}` — Mise à jour avec contrôle de révision
- `GET /api/v1/documents/{document_id}/layout` — Layout sidecar
- `PUT /api/v1/documents/{document_id}/layout` — Persistance layout
- `POST /api/v1/documents/{document_id}/preview` — Preview d'un document avec état simulé (`flag_states`, `reputation_states`) et, depuis **FR94**, `game_systems_state` pour caractéristiques, compétences, Effort, Réputation FR94 et titres. La réponse renvoie les agrégats de masquage, écho `game_systems_state`, et `simulation_limits` lorsque la preview locale ne peut pas reproduire les données runtime complètes (ex. agrégat communautaire Réputation).
- `POST /api/v1/documents/{document_id}/validate-flag-references` — **FR93** : références de flags (`visibilityConditions`, `choiceEffects`) vs `dialogueFlags` déclarés ; corps optionnel `{ "document": { ... } }` (sinon lecture du fichier persisté). Réponse : `valid`, `summary`, `used_flag_count`, listes `errors` / `warnings` (types `dialogue_flag_undeclared`, `dialogue_flag_unused`), champs optionnels `referenced_flag_id` / `suggested_flag_id` sur les entrées d’erreur.

La même analyse est fusionnée dans `POST /api/v1/unity-dialogues/graph/validate` lorsque le client envoie `document` (repère Story 9.5).

### Mechanics — systèmes de jeu

- `GET /api/v1/mechanics/systems/integration` — **FR94** : catalogue non bloquant des familles utilisables dans les dialogues (`Caractéristiques & Compétences`, `Gestion de l'Effort`, `Réputation`) et état de la source runtime externe (`Unity/API/fichier config`). En local, une source runtime absente renvoie `editing_blocked=false` pour permettre l'édition et la preview simulée.

#### Exemple `POST /api/v1/documents/{document_id}/preview` (FR94)

**Requête :**

```json
{
  "revision": 3,
  "flag_states": {},
  "reputation_states": {},
  "game_systems_state": {
    "attributes": { "sociabilite": 4 },
    "skills": { "tromperie": 3 },
    "effort_pool": 10,
    "reputation_values": {
      "fr94::HEROINE_A::community::garde::Admiration::community_calculated": 35
    },
    "faction_titles": { "garde": "garde_capitaine" }
  }
}
```

**Réponse (extrait) :**

```json
{
  "revision": 3,
  "nodes_total": 1,
  "nodes_masked": 0,
  "choices_total": 0,
  "choices_masked": 0,
  "masked_node_ids": [],
  "masked_choice_refs": [],
  "game_systems_state": { "...": "écho de la requête" },
  "simulation_limits": [
    "Agrégat communautaire simulé localement : témoins, propagation et poids PNJ restent responsabilité runtime."
  ],
  "visibility_warnings": []
}
```

Contrats détaillés : [`docs/api/api-contracts-api.md`](docs/api/api-contracts-api.md). Guide utilisateur : [`docs/guides/game-systems-integration.md`](docs/guides/game-systems-integration.md).

#### Diagnostics sociaux (`PUT /api/v1/documents/{document_id}`)

Entrées possibles dans `validationReport` (voir `services/game_systems_social_diagnostics.py`) :

| Code | Message type |
|------|----------------|
| `social_system_confusion` | `Influence` ou `Respect` utilisé comme axe de Réputation — appartient au système **Influence & Respect (PJ possédés)** |
| `reputation_palier_runtime_only` | Tentative de persister un palier `RepPalier*` dans `dialogueFlags` (paliers calculés à la volée en runtime) |

### Logs

- `GET /api/v1/logs` - Recherche de logs (query params: `start_date`, `end_date`, `level`, `logger`, `request_id`, `endpoint`, `limit`, `offset`)
- `GET /api/v1/logs/stats` - Statistiques sur les logs (comptage par niveau, par jour, par logger)
- `GET /api/v1/logs/files` - Liste des fichiers de logs disponibles
- `POST /api/v1/logs/frontend` - Recevoir un log depuis le frontend

## Système de logs

L'API dispose d'un système de logs complet avec archivage persistant, rotation automatique et API de consultation.

### Archivage des logs

Les logs sont automatiquement archivés dans des fichiers JSON par date dans le dossier `data/logs/` :
- Format : `logs_YYYY-MM-DD.json`
- Rotation automatique quotidienne
- Rétention configurable (30 jours par défaut)
- Format JSON structuré pour faciliter l'analyse

### Configuration

Variables d'environnement pour le logging :
- `LOG_FILE_ENABLED`: Activer l'archivage fichier (défaut: `true`)
- `LOG_RETENTION_DAYS`: Durée de rétention en jours (défaut: `30`)
- `LOG_DIR`: Dossier de stockage (défaut: `data/logs`)
- `LOG_MAX_FILE_SIZE_MB`: Taille max avant rotation intra-jour (défaut: `100`)
- `LOG_FORMAT`: Format console (`json` ou `text`, défaut: `text` en dev, `json` en prod)
- `LOG_LEVEL`: Niveau de log (`DEBUG`, `INFO`, `WARNING`, `ERROR`, `CRITICAL`, défaut: `INFO`)

### Consultation des logs

#### Recherche de logs

```bash
# Rechercher tous les logs d'aujourd'hui
GET /api/v1/logs

# Rechercher les erreurs des 7 derniers jours
GET /api/v1/logs?level=ERROR&start_date=2024-12-08&end_date=2024-12-15

# Rechercher par request_id
GET /api/v1/logs?request_id=abc123

# Rechercher avec pagination
GET /api/v1/logs?limit=50&offset=0
```

#### Statistiques

```bash
# Statistiques sur les 30 derniers jours
GET /api/v1/logs/stats

# Statistiques sur une plage de dates
GET /api/v1/logs/stats?start_date=2024-12-01&end_date=2024-12-15
```

Réponse :
```json
{
  "total_logs": 1234,
  "date_range": {
    "start": "2024-12-01",
    "end": "2024-12-15"
  },
  "by_level": {
    "INFO": 800,
    "WARNING": 200,
    "ERROR": 34
  },
  "by_day": {
    "2024-12-15": 100,
    "2024-12-14": 95
  },
  "by_logger": {
    "api.middleware": 500,
    "api.routers": 300
  }
}
```

#### Liste des fichiers

```bash
GET /api/v1/logs/files
```

### Logs frontend

Le frontend envoie automatiquement ses logs critiques au backend via `POST /api/v1/logs/frontend`. Les logs frontend sont intégrés dans le même système d'archivage.

### Nettoyage automatique

Les fichiers de logs plus anciens que `LOG_RETENTION_DAYS` sont automatiquement supprimés au démarrage de l'API. Le nettoyage peut également être déclenché manuellement :

```bash
python -m api.utils.log_cleanup [retention_days]
```

### Format des logs

Chaque entrée de log contient :
```json
{
  "timestamp": "2024-12-15T10:30:00.123Z",
  "level": "INFO",
  "logger": "api.middleware",
  "message": "Request: GET /api/dialogues",
  "module": "middleware",
  "function": "dispatch",
  "line": 54,
  "request_id": "abc123",
  "endpoint": "/api/dialogues",
  "method": "GET",
  "status_code": 200,
  "duration_ms": 45,
  "environment": "production"
}
```

## Export Unity (Epic 5 — matrice preview / export / batch)

| Action | Endpoint / UI | Persistance disque | Validation schéma |
|--------|---------------|-------------------|-------------------|
| Prévisualiser (graphe) | `POST /api/v1/unity-dialogues/graph/preview-export` · menu **Actions → Prévisualiser export** | Non | Oui (réponse JSON normalisée) |
| Exporter (graphe) | `POST /api/v1/unity-dialogues/graph/save-and-write` · **Export Unity** | Oui (répertoire Unity configuré) | Oui avant écriture |
| Prévisualiser (bibliothèque) | `GET /api/v1/dialogues/{document_id}/preview-export` · liste `/unity-dialogues` | Non | Oui |
| Télécharger (bibliothèque) | `GET /api/v1/dialogues/{document_id}/download` | — | — |
| Batch export | `POST /api/v1/dialogues/batch-export` · page `/unity-dialogues` | Oui | Oui par fichier |
| Batch preview | `POST /api/v1/dialogues/batch-preview-export` | Non | Oui par fichier |
| Export JSON brut | `POST /api/v1/dialogues/unity/export` (corps `json_content`) | Oui | Oui avant écriture |
| Journal export | `GET /api/v1/exports/logs` (`status`, `start_date`, `end_date`) | — | — |

Normalisation pré-validation : choix placeholder `__idx_*` sans texte ni cible, champs `null`/vides (`influenceDelta`, `respectDelta`, `condition`, `test`, `title`). Service : `services/unity_export_normalizer.py`. Migration legacy : `python scripts/normalize_unity_dialogues.py` (dry-run) puis `--apply`.

Sécurité écriture : `safe_export_filename`, `safe_document_id`, `_resolve_export_path` — voir [docs/guides/SECURITY.md](docs/guides/SECURITY.md#export-unity--path-traversal).

- `GET /api/v1/config/unity-dialogues-path` - Chemin configuré des dialogues Unity
- `PUT /api/v1/config/unity-dialogues-path` - Configurer le chemin des dialogues Unity

## Authentification

L'API utilise JWT (JSON Web Tokens). Défaut applicatif : **`DISABLE_AUTH=false`** (voir `.env.example`).

### Flux développeur

1. **Invité (démo)** : `POST /api/v1/auth/guest` → access token lecture seule (l'UI l'appelle automatiquement sans JWT).
2. **Écriture** : `POST /api/v1/auth/login` avec `username` / `password` → `access_token` dans le body, refresh dans un cookie httpOnly.
3. Requêtes suivantes : `Authorization: Bearer <access_token>`.
4. Rafraîchissement : `POST /api/v1/auth/refresh` (cookie) ou intercepteur Axios côté frontend.

### Compte admin initial

Au premier démarrage, définir `ADMIN_PASSWORD` dans `.env` pour créer le compte seed `admin` (hash bcrypt en SQLite). Exemple dev :

```bash
ADMIN_PASSWORD=admin123
```

Puis connexion : username `admin`, mot de passe = valeur de `ADMIN_PASSWORD`.

Sans `ADMIN_PASSWORD`, aucun compte n'est seedé (warning au démarrage) ; l'accès invité reste disponible.

### Bypass tests (`DISABLE_AUTH=true`)

Réservé à pytest et Playwright : JWT ignoré, principal mock admin. **Interdit** si `ENVIRONMENT=production`. Voir [`docs/guides/SECURITY.md`](docs/guides/SECURITY.md).

### Données applicatives SQLite

Comptes, index propriétaire des dialogues, partages et audit : `data/app.db` (migrations automatiques au boot). Override tests : `APP_DATABASE`. Les JSON Unity restent la source de vérité des dialogues.

## Documentation

La documentation interactive est disponible via Swagger UI à `/api/docs` une fois l'API démarrée.

## Tests

```bash
pytest tests/api/
```

## Architecture

L'API suit les principes SOLID et RESTful :

- **Routers**: Gestion des routes HTTP uniquement
- **Services**: Logique métier (réutilise les services existants)
- **Schemas**: DTOs Pydantic pour validation
- **Dependencies**: Injection de dépendances FastAPI
- **Exceptions**: Gestion centralisée des erreurs

## Frontend

Le frontend React est dans le dossier `frontend/`. **C'est l'interface principale du projet.** Voir `frontend/README.md` pour plus d'informations.

