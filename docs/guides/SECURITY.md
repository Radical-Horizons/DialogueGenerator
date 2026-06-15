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

Les refresh tokens peuvent être utilisés pour obtenir de nouveaux access tokens via `POST /api/v1/auth/refresh`.

**Note** : En production, on pourrait implémenter une blacklist de tokens pour invalider les refresh tokens lors de la déconnexion.

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

1. **Mots de passe forts** : Implémenter des règles de complexité (à faire pour utilisateurs réels)
2. **Expiration des tokens** : Les tokens actuels expirent automatiquement
3. **Révoquer les tokens** : En production, implémenter une blacklist pour révoquer les tokens

## Limitations actuelles

- **Utilisateurs en dur** : Actuellement, les utilisateurs sont stockés en dur dans le code (TODO: base de données)
- **Pas de blacklist** : Les tokens ne peuvent pas être révoqués avant expiration
- **Pas de gestion de sessions** : Pas de suivi des sessions actives

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

## Réponses d'erreur en production

Quand `ENVIRONMENT=production` :

- Les handlers globaux (`api/main.py`) **n'exposent pas** les détails internes des exceptions non gérées (`INTERNAL_ERROR`, type/message Python).
- Les `APIException` avec code `INTERNAL_ERROR` ont leur champ `details` vidé.

En développement, les détails restent visibles pour le diagnostic. Voir aussi [API Contracts — Error Handling](../api/api-contracts-api.md).

## Évolutions futures

- Migration vers une base de données pour les utilisateurs
- Implémentation d'une blacklist de tokens
- Support de l'authentification multi-facteurs (2FA)
- Gestion des sessions avec suivi des connexions actives






