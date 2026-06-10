# Guide de Déploiement - DialogueGenerator API

## Table des matières

1. [Prérequis](#prérequis)
2. [Checklist de déploiement](#checklist-de-déploiement)
3. [Placement des fichiers GDD](#placement-des-fichiers-gdd)
4. [Configuration des variables d'environnement](#configuration-des-variables-denvironnement)
5. [Build de production](#build-de-production)
6. [Déploiement selon la plateforme](#déploiement-selon-la-plateforme)
7. [Vérification post-déploiement](#vérification-post-déploiement)
8. [Troubleshooting](#troubleshooting)

## Prérequis

1. Compte sur une plateforme d'hébergement avec support Python (SmarterASP.net, VPS, etc.)
2. Accès FTP/SFTP ou contrôle de panel
3. Python 3.x installé
4. Node.js et npm installés (pour le build du frontend)
5. Accès aux fichiers GDD (Game Design Document)

## Checklist de déploiement

Avant de commencer, vérifier que vous avez :

- [ ] Copié `env.example` vers `.env` et configuré toutes les variables
- [ ] Généré une clé JWT secrète forte (voir [Configuration des variables d'environnement](#configuration-des-variables-denvironnement))
- [ ] Préparé les fichiers GDD (voir [Placement des fichiers GDD](#placement-des-fichiers-gdd))
- [ ] Build du frontend effectué (voir [Build de production](#build-de-production))
- [ ] Tous les fichiers Python prêts à être uploadés
- [ ] Configuration du serveur web préparée

## Placement des fichiers GDD

Les fichiers GDD (Game Design Document) doivent être accessibles sur le serveur. Deux options sont disponibles :

### Option A : Dans le répertoire de l'application (Recommandé)

Structure recommandée :

```
/serveur/app/
  ├── DialogueGenerator/          (code de l'application)
  │   ├── api/
  │   ├── services/
  │   ├── frontend/
  │   │   └── dist/               (fichiers build frontend)
  │   └── data/
  │       └── GDD_categories/     (copier les fichiers JSON ici)
  │           ├── personnages.json
  │           ├── lieux.json
  │           ├── objets.json
  │           └── ...
  └── import/
      └── Bible_Narrative/
          └── Vision.json          (copier ici)
```

**Avantages :**
- Structure simple et organisée
- Pas besoin de configurer de variables d'environnement supplémentaires
- Compatible avec la structure locale

### Option B : Dans un répertoire séparé (si besoin de partage)

Structure alternative :

```
/serveur/data/
  └── gdd/
      ├── categories/              (fichiers JSON)
      │   ├── personnages.json
      │   ├── lieux.json
      │   └── ...
      └── import/
          └── Bible_Narrative/
              └── Vision.json
```

**Configuration requise :**

Définir les variables d'environnement suivantes :

```bash
GDD_CATEGORIES_PATH=/serveur/data/gdd/categories
GDD_IMPORT_PATH=/serveur/data/gdd/import/Bible_Narrative
```

**Avantages :**
- Permet de partager les fichiers GDD entre plusieurs applications
- Séparation claire entre code et données

### Fichiers GDD requis

Les fichiers suivants doivent être présents dans le répertoire des catégories :

- `personnages.json` (recommandé)
- `lieux.json` (recommandé)
- `objets.json` (optionnel)
- `especes.json` (optionnel)
- `communautes.json` (optionnel)
- `dialogues.json` (optionnel)
- `structure_narrative.json` (optionnel)
- `structure_macro.json` (optionnel)
- `structure_micro.json` (optionnel)
- `quetes.json` (optionnel)

**Note :** L'application peut fonctionner avec des fichiers partiels, mais `personnages.json` et `lieux.json` sont fortement recommandés.

## Configuration des variables d'environnement

### Fichier de configuration

1. Copier `env.example` vers `.env` à la racine du projet
2. Remplir toutes les variables requises

### Variables requises en production

| Variable | Description | Comment obtenir |
|----------|-------------|-----------------|
| `ENVIRONMENT` | Doit être `production` | Définir à `production` |
| `JWT_SECRET_KEY` | Clé secrète pour JWT | Générer avec : `python -c "import secrets; print(secrets.token_urlsafe(32))"` |
| `OPENAI_API_KEY` | Clé API OpenAI | Obtenir depuis https://platform.openai.com/api-keys |
| `CORS_ORIGINS` | Domaines autorisés (CSV) | Exemple : `https://votre-domaine.com,https://www.votre-domaine.com` |

### Variables optionnelles

| Variable | Description | Défaut |
|----------|-------------|--------|
| `GDD_CATEGORIES_PATH` | Chemin vers catégories GDD | `DialogueGenerator/data/GDD_categories/` |
| `GDD_IMPORT_PATH` | Chemin vers import/Bible_Narrative | `PROJECT_ROOT_DIR/import/Bible_Narrative/` |
| `API_PORT` | Port de l'API | `4242` |
| `AUTH_RATE_LIMIT_ENABLED` | Activer rate limiting | `true` |
| `AUTH_RATE_LIMIT_REQUESTS` | Requêtes par fenêtre | `5` |
| `AUTH_RATE_LIMIT_WINDOW` | Fenêtre en secondes | `60` |

### Configuration sur le serveur

**SmarterASP.net :**
- Configurer les variables dans le panneau de contrôle
- Ou créer un fichier `.env` à la racine de l'application

**VPS/Linux :**
- Exporter les variables dans `/etc/environment` (système)
- Ou créer un fichier `.env` à la racine de l'application
- Ou utiliser un gestionnaire de processus (systemd, supervisor)

**Windows Server/IIS :**
- Configurer via le panneau de configuration IIS
- Ou créer un fichier `.env` à la racine de l'application

## Build de production

### Build du frontend

**Méthode recommandée (script automatique) :**

```powershell
# Depuis la racine du projet
npm run deploy:build
```

**Méthode manuelle :**

```bash
cd frontend
npm install
npm run build
```

### Configuration de l'URL API pour le frontend

Si l'API est sur un **domaine différent** du frontend, définir `VITE_API_BASE_URL` avant le build :

```bash
# Windows PowerShell
$env:VITE_API_BASE_URL="https://api.votre-domaine.com"
npm run deploy:build

# Linux/Mac
VITE_API_BASE_URL="https://api.votre-domaine.com" npm run deploy:build
```

Si l'API est sur le **même domaine** que le frontend, laisser `VITE_API_BASE_URL` vide (utilise des URLs relatives `/api`).

### Vérification du build

```powershell
# Vérifier que tout est prêt
npm run deploy:check
```

## Déploiement selon la plateforme

### SmarterASP.net

#### 1. Préparation du code

```bash
# Installer les dépendances localement pour vérifier
pip install -r requirements.txt

# Vérifier que l'API démarre localement
python -m api.main
```

#### 2. Upload des fichiers

1. Uploader tous les fichiers Python (api/, services/, core/, domain/, etc.)
2. Uploader le contenu de `frontend/dist/` dans `frontend/dist/`
3. Uploader les fichiers de configuration (config/, context_config.json)
4. Uploader les fichiers GDD selon l'Option A ou B choisie

#### 3. Configuration

1. Créer un fichier `web.config` à la racine (voir `docs/deployment/web.config.example`)
2. Configurer le point d'entrée : `api.main:app`
3. Configurer les variables d'environnement dans le panneau de contrôle

#### 4. Configuration du serveur

- **Port**: Configurer selon les spécifications SmarterASP.net (généralement automatique)
- **Worker processes** : pour ce projet, les **jobs de génération** et le **SSE streaming** sont **en mémoire par processus**. Sous **Gunicorn**, utiliser **`workers = 1`** (voir `gunicorn.conf.py` / `docs/deployment/gunicorn.conf.example`) ; plusieurs workers sans sticky sessions peuvent provoquer des **404** sur le flux SSE (`GET .../stream`) si la job est créée sur un autre worker. Si vous devez absolument monter en workers, il faut un équilibreur avec sessions persistantes ou une refonte du stockage des jobs — ce n’est pas le déploiement documenté par défaut.
- **Timeout**: Augmenter pour les requêtes LLM longues (300 secondes recommandé)

### VPS avec Nginx

#### 1. Installation des dépendances

```bash
# Installer Python et dépendances
python3 -m venv venv
source venv/bin/activate  # Linux/Mac
pip install -r requirements.txt
```

#### 2. Configuration Nginx

1. Copier `docs/deployment/nginx.conf.example` vers votre configuration Nginx
2. Ajuster les chemins et le nom de domaine
3. Tester la configuration : `nginx -t`
4. Recharger Nginx : `nginx -s reload`

**Important :** Ajuster le port dans la configuration Nginx (par défaut 4242, pas 8000).

#### 3. Démarrage de l'application

**Option A : Uvicorn directement**

```bash
uvicorn api.main:app --host 0.0.0.0 --port 4242
```

**Option B : Gunicorn (recommandé pour production)**

```bash
# Installer Gunicorn
pip install gunicorn

# Copier et ajuster docs/deployment/gunicorn.conf.example
gunicorn -c gunicorn.conf.py api.main:app
```

**Option C : Systemd service (recommandé)**

Créer `/etc/systemd/system/dialogue-generator.service` :

```ini
[Unit]
Description=DialogueGenerator API
After=network.target

[Service]
User=www-data
Group=www-data
WorkingDirectory=/chemin/vers/DialogueGenerator
Environment="PATH=/chemin/vers/venv/bin"
ExecStart=/chemin/vers/venv/bin/gunicorn -c gunicorn.conf.py api.main:app
Restart=always

[Install]
WantedBy=multi-user.target
```

Puis :

```bash
sudo systemctl daemon-reload
sudo systemctl enable dialogue-generator
sudo systemctl start dialogue-generator
```

### Windows Server / IIS

1. Installer Python et dépendances
2. Copier `docs/deployment/web.config.example` vers `web.config`
3. Configurer le point d'entrée dans IIS : `api.main:app`
4. Configurer les variables d'environnement dans IIS

## Vérification post-déploiement

### Tests de base

1. **Health check basique :**
   ```bash
   curl https://votre-domaine.com/health
   ```
   Doit retourner `{"status": "healthy", ...}`

2. **Health check détaillé :**
   ```bash
   curl https://votre-domaine.com/health/detailed
   ```
   Vérifier que les fichiers GDD sont accessibles

3. **API Documentation :**
   Ouvrir `https://votre-domaine.com/api/docs` dans un navigateur

4. **Frontend :**
   Ouvrir `https://votre-domaine.com` dans un navigateur

### Script de vérification

Un script PowerShell est disponible pour automatiser les vérifications :

```powershell
.\scripts\verify_deployment.ps1 -BaseUrl "https://votre-domaine.com"
```

## Troubleshooting

### Problème : Les fichiers GDD ne sont pas trouvés

**Symptômes :**
- Health check retourne `"status": "degraded"` pour `gdd_files`
- Erreurs dans les logs : "Répertoire GDD non trouvé"

**Solutions :**
1. Vérifier que les fichiers sont bien uploadés au bon emplacement
2. Vérifier les permissions d'accès aux fichiers
3. Si Option B utilisée, vérifier que `GDD_CATEGORIES_PATH` et `GDD_IMPORT_PATH` sont correctement définis
4. Vérifier les chemins dans `/health/detailed`

### Problème : Erreur "JWT_SECRET_KEY ne peut pas être la valeur par défaut"

**Symptômes :**
- L'application refuse de démarrer en production
- Erreur : `ValueError: JWT_SECRET_KEY ne peut pas être la valeur par défaut en production`

**Solutions :**
1. Générer une nouvelle clé : `python -c "import secrets; print(secrets.token_urlsafe(32))"`
2. Définir `JWT_SECRET_KEY` dans les variables d'environnement
3. Vérifier que `ENVIRONMENT=production` est bien défini

### Problème : Erreurs CORS

**Symptômes :**
- Erreurs dans la console du navigateur : "CORS policy"
- Les requêtes API échouent depuis le frontend

**Solutions :**
1. Vérifier que `CORS_ORIGINS` contient le domaine du frontend
2. Format CSV : `https://votre-domaine.com,https://www.votre-domaine.com`
3. En développement, laisser vide pour autoriser toutes les origines

### Problème : Timeout sur les requêtes LLM

**Symptômes :**
- Les requêtes de génération de dialogues timeout
- Erreur 504 Gateway Timeout

**Solutions :**
1. Augmenter le timeout du serveur web (Nginx/IIS)
2. Pour Nginx : `proxy_read_timeout 300s;`
3. Pour IIS : Ajuster `requestTimeout` dans `web.config`
4. Pour Gunicorn : `timeout = 300` dans `gunicorn.conf.py`

### Problème : Le frontend ne charge pas

**Symptômes :**
- Page blanche ou erreur 404
- Les assets (JS/CSS) ne se chargent pas

**Solutions :**
1. Vérifier que `frontend/dist/` contient les fichiers build
2. Vérifier que le serveur web sert correctement les fichiers statiques
3. Vérifier les permissions d'accès aux fichiers
4. Vérifier la configuration du reverse proxy (si applicable)

### Problème : L'API ne répond pas

**Symptômes :**
- Erreur "Connection refused" ou timeout
- Health check échoue

**Solutions :**
1. Vérifier que l'application Python est bien démarrée
2. Vérifier les logs de l'application
3. Vérifier que le port est correctement configuré
4. Vérifier les règles de firewall
5. Vérifier la configuration du reverse proxy

## Maintenance

### Logs

- **SmarterASP.net** : Vérifier les logs dans le panneau de contrôle
- **Nginx** : `/var/log/nginx/dialogue-generator-*.log`
- **Application** : Logs dans `logs/` ou stdout selon la configuration
- **Systemd** : `journalctl -u dialogue-generator -f`

### Monitoring

- Surveiller l'utilisation des ressources (CPU, RAM)
- Surveiller les erreurs dans les logs
- Surveiller les health checks : `/health` et `/health/detailed`
- Surveiller l'utilisation de l'API OpenAI (coûts)

### Backups

Sauvegarder régulièrement :
- Les interactions dans `data/interactions/`
- Les fichiers GDD
- La configuration (`.env`, fichiers de config)
- Les logs importants

### Mises à jour

1. Tester les mises à jour en local d'abord
2. Faire un backup avant de déployer
3. Déployer pendant une période de faible utilisation
4. Vérifier les health checks après déploiement
5. Surveiller les logs pour détecter les erreurs

## Développement local

### Démarrer le backend

```bash
# Terminal 1
python -m api.main
# Ou avec uvicorn directement
uvicorn api.main:app --reload --host 0.0.0.0 --port 8000
```

### Démarrer le frontend

```bash
# Terminal 2
cd frontend
npm install
npm run dev
```

L'application sera accessible sur :
- Frontend: http://localhost:3000
- Backend API: http://localhost:8000
- API Docs: http://localhost:8000/api/docs

