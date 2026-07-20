# Documentation Sécurité - DialogueGenerator API

Ce document décrit les mesures de sécurité implémentées dans l'API DialogueGenerator et les bonnes pratiques pour le déploiement en production.

## Gestion des Secrets

### Variables d'environnement

L'application utilise des variables d'environnement pour gérer les secrets. **Ne jamais committer les secrets dans le code source.**

### Configuration via .env

1. Copier `.env.example` vers `.env` :
   ```bash
   cp .env.example .env
   ```

2. Modifier `.env` et définir des valeurs sécurisées pour toutes les variables, notamment :
   - `JWT_SECRET_KEY` : Clé secrète pour signer les tokens JWT
   - `OPENAI_API_KEY` : Clé API OpenAI

### Génération d'une clé secrète JWT sécurisée

Pour générer une clé secrète JWT forte :

```bash
python -c "import secrets; print(secrets.token_urlsafe(32))"
```

**Important** : En production, `JWT_SECRET_KEY` **doit** être changée et ne peut pas être la valeur par défaut. L'application refusera de démarrer si la valeur par défaut est utilisée en production.

### Variables d'environnement principales

| Variable | Description | Requis en prod | Par défaut |
|----------|-------------|----------------|------------|
| `JWT_SECRET_KEY` | Clé secrète pour signer les tokens JWT | ✅ Oui | `your-secret-key-change-in-production` |
| `OPENAI_API_KEY` | Clé API OpenAI | ✅ Oui | - |
| `ENVIRONMENT` | Environnement (development/production) | Non | `development` |
| `AUTH_RATE_LIMIT_ENABLED` | Activer le rate limiting | Non | `true` |
| `AUTH_RATE_LIMIT_REQUESTS` | Nombre de requêtes par fenêtre | Non | `5` |
| `AUTH_RATE_LIMIT_WINDOW` | Fenêtre en secondes | Non | `60` |
| `CORS_ORIGINS` | Origines CORS autorisées (CSV) | Oui (si prod) | `*` (dev) |
| `DISABLE_AUTH` | Bypass JWT (mock admin) — **interdit** si `ENVIRONMENT=production` | Non | `false` |
| `ADMIN_PASSWORD` | Mot de passe du compte seed `admin` au premier démarrage (bcrypt en SQLite) | Recommandé (prod) | — |
| `APP_DATABASE` | Chemin SQLite applicatif (override tests) | Non | `data/app.db` |

## Rate Limiting

### Endpoints protégés

Les endpoints d'authentification suivants sont protégés par rate limiting :

- `POST /api/v1/auth/login`
- `POST /api/v1/auth/refresh`

### Configuration

Le rate limiting est configuré via les variables d'environnement :

- **Par défaut** : 5 requêtes par minute (60 secondes) par adresse IP
- **Désactivable** : `AUTH_RATE_LIMIT_ENABLED=false` (utile pour les tests)

### Réponse en cas de dépassement

Si la limite est dépassée, l'API retourne :

- **Status Code** : `429 Too Many Requests`
- **Body** : Message d'erreur avec détails
- **Headers** :
  - `X-RateLimit-Limit` : Limite configurée
  - `X-RateLimit-Window` : Fenêtre en secondes
  - `Retry-After` : Secondes à attendre avant de réessayer

### Exemple de réponse

```json
{
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "Trop de requêtes. Limite: 5 requêtes par 60 secondes.",
    "details": {
      "limit": 5,
      "window_seconds": 60,
      "retry_after": 60
    },
    "request_id": "uuid"
  }
}
```

## Authentification JWT

### Tokens

L'API utilise JWT (JSON Web Tokens) pour l'authentification :

- **Access Token** : Court terme (15 minutes par défaut), inclus dans le header `Authorization: Bearer <token>`
- **Refresh Token** : Long terme (7 jours par défaut), stocké dans un cookie httpOnly

### Sécurité des tokens

- **HttpOnly cookies** : Les refresh tokens sont stockés dans des cookies httpOnly (non accessibles via JavaScript)
- **Secure cookies** : En production, les cookies sont marqués comme Secure (HTTPS uniquement)
- **SameSite** : Protection CSRF via SameSite=Lax (dev) ou SameSite=None; Secure (prod)

### Rotation des tokens

Les refresh tokens peuvent être utilisés pour obtenir de nouveaux access tokens via `POST /api/v1/auth/refresh`. Le cookie `refresh_token` est limité au path `/api/v1/auth`, httpOnly, Secure en production.

`POST /api/v1/auth/logout` efface toujours le cookie refresh (même si l'access token est expiré). Il n'existe pas encore de blacklist serveur : un access token reste valide jusqu'à expiration (~15 min).

### Rôles et session invité (Epic 7)

| Rôle | Compte SQLite | Refresh cookie | Capacités |
|------|---------------|----------------|-----------|
| `admin` | Oui | Oui | Gestion utilisateurs, audit, paramètres app, CRUD dialogues (tous) |
| `writer` | Oui | Oui | Édition dialogues (propriétaire ou partagé), préférences serveur |
| `guest` | Non | Non | Lecture seule (démo) ; `403` sur mutations |

**Entrée UI (défaut `DISABLE_AUTH=false`)** : sans JWT valide, le frontend appelle `POST /api/v1/auth/guest` et obtient un access token `role=guest` (TTL 8 h). Connexion explicite via `/login` pour `admin` / `writer`.

**`DISABLE_AUTH=true`** (pytest, Playwright E2E) : mock admin sans JWT — réservé au développement ; refusé au démarrage si `ENVIRONMENT=production`.

### Comptes et base SQLite

Les utilisateurs persistés vivent dans `data/app.db` (override `APP_DATABASE`). Migrations versionnées au démarrage (`services/repositories/sqlite/migrations/`, tables `users`, `user_settings`, `app_settings`, `dialogues_index`, `dialogue_shares`, `audit_logs`).

- **Seed admin** : au premier boot, si `ADMIN_PASSWORD` est défini et qu'aucun `admin` n'existe, le compte `admin` est créé (mot de passe hashé bcrypt). Sans `ADMIN_PASSWORD` : warning au démarrage, pas de seed automatique.
- **Provisioning** : `POST /api/v1/users` (admin only) crée des comptes `writer`.
- **Changement de mot de passe** : `POST /api/v1/auth/me/password` (admin/writer ; `403` pour guest).

Contrats détaillés : [`docs/api/api-contracts-api.md`](../api/api-contracts-api.md) (sections Authentication, Administration, Dialogue Shares).

### Journal d'audit (FR71)

Les mutations sensibles (création/utilisateur, sauvegarde/suppression dialogue, partages) sont journalisées en append-only dans SQLite. Consultation admin :

- `GET /api/v1/audit-logs` — pagination, filtres `user_id`, `action`, dates
- `GET /api/v1/audit-logs/export` — export JSON/CSV (plafond 10 000 lignes)

## Configuration Production

### Checklist de déploiement

Avant de déployer en production, vérifier :

- [ ] `.env` est créé et configuré avec des valeurs sécurisées
- [ ] `JWT_SECRET_KEY` est changée (pas la valeur par défaut)
- [ ] `ENVIRONMENT=production` est défini
- [ ] `OPENAI_API_KEY` est configurée
- [ ] `CORS_ORIGINS` est configuré avec les domaines autorisés (format CSV)
- [ ] HTTPS est activé (requis pour les cookies Secure)
- [ ] Rate limiting est activé (recommandé)
- [ ] Les logs ne contiennent pas de secrets

### Validation automatique

L'application valide automatiquement la configuration au démarrage :

- **En développement** : Warnings si valeurs par défaut utilisées
- **En production** : Erreur et arrêt si `JWT_SECRET_KEY` est la valeur par défaut

### Message d'erreur en cas de configuration invalide

```
ValueError: JWT_SECRET_KEY ne peut pas être la valeur par défaut en production. 
Veuillez définir une clé secrète sécurisée dans .env ou les variables d'environnement.
```

## Bonnes Pratiques

### Secrets

1. **Ne jamais committer `.env`** : Vérifier que `.env` est dans `.gitignore`
2. **Utiliser des secrets forts** : Générer des clés aléatoires pour JWT_SECRET_KEY
3. **Rotation régulière** : Changer périodiquement les secrets (notamment en cas de compromission)
4. **Séparation des environnements** : Utiliser des secrets différents pour dev/staging/prod

### Déploiement

1. **HTTPS obligatoire** : Utiliser HTTPS en production pour protéger les tokens
2. **CORS restreint** : Configurer `CORS_ORIGINS` avec uniquement les domaines autorisés
3. **Rate limiting** : Maintenir le rate limiting activé pour limiter les attaques par force brute
4. **Monitoring** : Surveiller les logs pour détecter les tentatives d'attaque

### Authentification

1. **Mots de passe** : politique validée côté API (`api/utils/password_policy.py`) à la création et au changement
2. **Expiration des tokens** : access ~15 min ; refresh cookie 7 jours ; guest 8 h sans refresh
3. **Déconnexion** : efface le cookie refresh ; l'access token court reste utilisable jusqu'à expiration
4. **Production** : `DISABLE_AUTH=false` obligatoire ; définir `ADMIN_PASSWORD` avant le premier déploiement

## Limitations actuelles

- **Pas de blacklist JWT** : un access token reste valide jusqu'à expiration après logout
- **Pas de suivi de sessions actives** : pas de révocation centralisée des refresh tokens côté serveur
- **Invité** : pas de compte ni de refresh ; reconnexion guest requise après expiration du token

## Limites anti-DoS (Epic 9)

Les endpoints de preview et validation document bornent la taille des payloads **authentifiés** pour éviter un abus CPU/mémoire. Constantes dans `services/dialogue_preview_limits.py` :

| Limite | Valeur | Endpoint / champ |
|--------|--------|------------------|
| `MAX_PREVIEW_FLAG_STATES` | 512 | `POST /documents/{id}/preview` → `flag_states` |
| `MAX_PREVIEW_REPUTATION_STATES` | 256 | `preview` → `reputation_states` |
| `MAX_PREVIEW_GAME_SYSTEMS_ATTRIBUTES` | 64 | `preview` → `game_systems_state.attributes` |
| `MAX_PREVIEW_GAME_SYSTEMS_SKILLS` | 128 | `preview` → `game_systems_state.skills` |
| `MAX_PREVIEW_GAME_SYSTEMS_REPUTATION_VALUES` | 256 | `preview` → `game_systems_state.reputation_values` |
| `MAX_PREVIEW_GAME_SYSTEMS_FACTION_TITLES` | 64 | `preview` → `game_systems_state.faction_titles` |
| `MAX_VALIDATE_FLAG_REFERENCES_INLINE_NODES` | 5000 | `POST /documents/{id}/validate-flag-references` → `document.nodes` |

Dépassement → `422` (validation Pydantic) avant exécution métier.

## Export Unity — path traversal

Les routes d'export Unity (graphe `save-and-write`, bibliothèque `batch-export`, téléchargement) valident les identifiants et noms de fichier **avant** toute écriture ou lecture disque :

| Fonction | Module | Rôle |
|----------|--------|------|
| `safe_document_id` | `services/unity_persisted_document_io.py` | Normalise l'id document (pas de `..`, `/`, `\`) |
| `safe_export_filename` | `services/unity_dialogue_download_service.py` | Basename uniquement, extension `.json` forcée |
| `_resolve_export_path` | `services/unity_dialogue_export_service.py` | Vérifie que le chemin résolu reste sous le répertoire Unity configuré |

Comportement en cas d'abus : `ValidationException` (422) ou `ValueError` côté service — pas d'écriture hors du dossier Unity. Tests : `tests/services/test_unity_dialogue_download_service.py`, `tests/api/test_unity_export_story_5_1.py`.

## Réponses d'erreur en production

Quand `ENVIRONMENT=production` :

- Les handlers globaux (`api/main.py`) **n'exposent pas** les détails internes des exceptions non gérées (`INTERNAL_ERROR`, type/message Python).
- Les `APIException` avec code `INTERNAL_ERROR` ont leur champ `details` vidé.

En développement, les détails restent visibles pour le diagnostic. Voir aussi [API Contracts — Error Handling](../api/api-contracts-api.md).

## Évolutions futures

- Blacklist ou rotation serveur des refresh tokens
- Authentification multi-facteurs (2FA)
- Gestion des sessions avec suivi des connexions actives






