# Dépannage : port API déjà utilisé (dev / prod)

> **Nom de fichier historique** : ce guide reste à `TROUBLESHOOTING_PORT_4242.md` pour ne pas casser les liens. Le contenu couvre **4243 (dev via `npm run dev`)** et **4242 (défaut `api/main.py` sans `API_PORT`, déploiement typique)**.

## Ports : source de vérité dans le code

| Contexte | Port backend | Où c’est défini |
|----------|--------------|-----------------|
| `npm run dev` (stack Node + API) | **4243** par défaut | `scripts/dev.js`, `scripts/dev-services.js` (`API_PORT` passé au process Python) |
| Proxy Vite `/api` → backend | **4243** | `frontend/vite.config.ts` (`server.proxy['/api'].target`) |
| `python -m api.main` sans `API_PORT` | **4242** | `api/main.py` (`os.getenv("API_PORT", "4242")`) |
| Production (ex. OVH / Nginx) | **4242** interne courant | `docs/deployment/PRODUCTION.md`, scripts de déploiement |

Si le frontend appelle une URL absolue sur le mauvais port, symptômes classiques : `ERR_CONNECTION_REFUSED`, E2E instables — voir aussi `docs/troubleshooting/e2e-llm.md` et `docs/troubleshooting/post-mortem-e2e-llm.md`.

## Problème observé (`npm run dev`)

Au démarrage, le script peut signaler que le **port du backend (4243 en dev)** est déjà pris et tenter de libérer des processus, parfois sans succès pour certains PID :

```
⚠️  Le port 4243 (Backend API) est déjà utilisé.
   Tentative de libération du port (4 processus trouvés)...
   ...
   ⚠️  Impossible d'arrêter le processus PID …
```

(Les libellés exacts peuvent varier selon la version du script.)

## Causes identifiées

### 1. Processus déjà terminés mais port non libéré

**Symptôme** : `netstat` montre des connexions LISTENING avec des PIDs, mais `tasklist` ne trouve pas ces processus.

**Explication** : Sur Windows, délai entre la fin d'un processus et la libération effective du port TCP (TIME_WAIT, fermeture).

### 2. Parsing de `netstat` trop permissif (anciennes versions)

`netstat -ano` peut mélanger lignes obsolètes ou formats différents ; le script peut alors tenter d'arrêter des PID invalides.

### 3. Vérification d'existence manquante (anciennes versions)

Tuer un PID sans vérifier qu'il existe encore produit des messages d'erreur confus.

### 4. Délai d'attente insuffisant

Après `taskkill`, Windows peut nécessiter plus d'une seconde avant que `listen()` réussisse à nouveau sur le port.

## Solution implémentée (état actuel du repo)

La libération de port pour le dev est dans **`scripts/dev-services.js`** (appelée depuis `scripts/dev.js`), pas dans un fichier séparé « one-off » :

1. **Ports autorisés pour kill automatique** : **3000** (Vite) et **4243** (API dev) — pas d'arrêt forcé d'autres ports.
2. **Windows** : `netstat -ano` + filtre LISTENING, extraction des PID, puis `taskkill /F /T /PID` uniquement si `processExists(pid)`.
3. **Unix** : `lsof -ti:<port>` puis `kill`.
4. **Attente courte** après kill avant de relancer l'écoute.

## Comportement attendu

1. Détection des PID en écoute sur le port cible.
2. Filtrage des PID réellement vivants avant `taskkill` / `kill`.
3. Attente puis redémarrage du backend par `npm run dev`.

## Cas limites restants

1. **Processus protégé** : privilèges administrateur requis.
2. **Antivirus / pare-feu** : peut bloquer l'arrêt ou la liaison au port.
3. **Port bloqué longtemps** : attendre ou redémarrer la machine en dernier recours.

**Diagnostic manuel (adapter le numéro de port : 4243 = dev, 4242 = prod / `api.main` par défaut)** :

```powershell
# Windows PowerShell — remplacer 4243 par 4242 si vous déboguez l'API sans npm run dev
Get-NetTCPConnection -LocalPort 4243 -ErrorAction SilentlyContinue | Select-Object OwningProcess, State
```

```bash
# Linux / macOS
lsof -i :4243
```

Arrêt ciblé (remplacer `<PID>`) :

```powershell
taskkill /F /T /PID <PID>
```

## Prévention

1. Arrêter le stack avec **Ctrl+C** dans le terminal qui exécute `npm run dev`.
2. En cas de zombie : `npm run dev:stop` si disponible dans `package.json`, ou tuer les PID listés ci-dessus.
3. Éviter de lancer en parallèle deux backends sur le **même** `API_PORT`.
