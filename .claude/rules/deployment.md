---
description: >-
  Déploiement production VPS (demo.auto-diffusion.net) — npm run deploy / deploy-production.ps1,
  deploy-from-wsl.sh, nginx, systemd, .env prod (ENVIRONMENT, JWT, CORS), 403 frontend/dist
  permissions, SSE proxy_buffering. Apply when deploying, configuring prod, or debugging
  production, nginx, or health checks — même sans ouvrir les scripts deploy.
paths:
  - "scripts/deploy*"
  - "docs/deployment/**"
---
- **Référence longue** : `docs/deployment/PRODUCTION.md` (serveur, systemd, nginx, logs, `.env` prod). URL publique de référence : `demo.auto-diffusion.net`.
- **Release prod (semver + canvas)** : **`.claude/rules/app_versioning.md`** · skill `/prod-release` · deploy `npm run deploy`.

- **Commandes racine** : `npm run deploy:check` (prérequis / `.env` local) ; `npm run deploy:build` (frontend seul) ; `npm run deploy` → `scripts/deploy-production.ps1`. Variantes : `deploy:skip-build`, `deploy:skip-restart`. WSL / Linux : `scripts/deploy-from-wsl.sh`.

- **`deploy-production.ps1` (paramètres utiles)** : `-SkipBuild`, `-SkipRestart`, `-SkipNginx`, `-SkipGitPull`, `-SkipPipInstall`, `-GitUseAutostash` (remplace le défaut git), `-GitRemoteBranch` (défaut `main`), `-ServerHost` / `-ServerUser` / `-ServerPath`, `-HealthCheckHost` (défaut `demo.auto-diffusion.net` pour le health HTTP avec en-tête `Host`), `-SkipDistPermissions`.

- **Git sur le VPS** : par défaut `git fetch origin` puis `reset --hard origin/<branche>` — le dépôt serveur doit refléter GitHub ; évite les blocages sur `data/` suivie. `-GitUseAutostash` réactive un scénario proche de `pull --autostash` (fragile si conflits).

- **Frontend upload + nginx** : après SCP depuis Windows, les fichiers peuvent être illisibles pour `www-data` → **403 sur `/assets/*`**, page blanche. Le script applique `chown` / `chmod` sur `frontend/dist` (étape 2b) sauf `-SkipDistPermissions`. Aligné avec `deploy-from-wsl.sh`.

- **PowerShell 5.1** : éviter dans les chaînes doubles les motifs du type `(--Switch)` ou `&&` mélangés à des guillemets ambigus ; le script utilise des helpers `Invoke-SshRemoteCapture` / `Invoke-SshRemote` pour SSH sous `$ErrorActionPreference Stop` (stderr de `git` ne doit pas faire échouer le déploiement).

- **Config prod app** : `ENVIRONMENT=production`, `DISABLE_AUTH=false` si auth requise, `JWT_SECRET_KEY`, `OPENAI_API_KEY` si besoin ; CORS : `PUBLIC_ORIGIN` (ou `CORS_ORIGINS`). Écarts `context_config` vs GDD : avertissements au démarrage — voir `PRODUCTION.md`, `npm run diagnose:prod-context`.

- **Nginx** : exemple `docs/deployment/nginx.conf.example` ; SSE `/api` : `proxy_buffering off` (le script de déploiement peut vérifier / proposer une mise à jour).
