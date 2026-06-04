# DialogueGenerator API REST

API REST FastAPI pour la génération de dialogues IA pour jeux de rôle.

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
   - `JWT_SECRET_KEY`: Clé secrète pour JWT (requis en production, valeur par défaut acceptée en dev)
   - `ENVIRONMENT`: Environnement (`development` ou `production`)
   - `AUTH_RATE_LIMIT_ENABLED`: Activer le rate limiting (par défaut: `true`)
   - `AUTH_RATE_LIMIT_REQUESTS`: Nombre de requêtes par fenêtre (par défaut: `5`)
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

Pour plus de détails sur la sécurité, voir [docs/SECURITY.md](docs/SECURITY.md).

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

### Authentification

- `POST /api/v1/auth/login` - Connexion
- `GET /api/v1/auth/me` - Utilisateur courant
- `POST /api/v1/auth/logout` - Déconnexion
- `POST /api/v1/auth/refresh` - Rafraîchir token

### Génération de dialogues

- `POST /api/v1/dialogues/generate/variants` - Générer variantes texte
- `POST /api/v1/dialogues/generate/interactions` - Générer interactions structurées (supporte `previous_interaction_id` pour la continuité)
- `POST /api/v1/dialogues/preview-prompt` - Prévisualiser le prompt brut construit (sans estimation de tokens)
- `POST /api/v1/dialogues/estimate-tokens` - Estimer tokens et retourner le prompt brut (pour l'estimation avant génération)

### Interactions

- `GET /api/v1/interactions` - Liste interactions
- `GET /api/v1/interactions/{id}` - Détails interaction
- `GET /api/v1/interactions/{id}/parents` - Interactions parentes
- `GET /api/v1/interactions/{id}/children` - Interactions enfants
- `GET /api/v1/interactions/{id}/context-path` - Chemin complet de contexte (parents jusqu'à la racine)
- `POST /api/v1/interactions` - Créer interaction
- `PUT /api/v1/interactions/{id}` - Mettre à jour
- `DELETE /api/v1/interactions/{id}` - Supprimer

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
- `GET /api/v1/config/unity-dialogues-path` - Chemin configuré des dialogues Unity
- `PUT /api/v1/config/unity-dialogues-path` - Configurer le chemin des dialogues Unity

## Authentification

L'API utilise JWT (JSON Web Tokens) pour l'authentification.

1. Se connecter via `POST /api/v1/auth/login` avec `username` et `password`
2. Récupérer le `access_token` dans la réponse
3. Inclure le token dans les requêtes suivantes : `Authorization: Bearer <token>`

**Note**: Pour le développement, un utilisateur par défaut existe :
- Username: `admin`
- Password: `admin123`

⚠️ **À changer en production !**

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

