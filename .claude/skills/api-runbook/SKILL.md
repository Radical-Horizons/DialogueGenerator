---
name: api-runbook
description: >-
  Invoquer l'API REST DialogueGenerator : health, auth JWT, helper PowerShell,
  cookbook des tâches fréquentes (sync GDD Notion, contexte, documents, graphe).
  Use when calling FastAPI endpoints, syncing Notion/GDD, or any backend action via HTTP.
---

## Périmètre

Ce skill couvre :
- `api/**`
- `scripts/Invoke-DialogueApi.ps1`
- `docs/api/**`

# API runbook (DialogueGenerator)

Contrats détaillés : [`docs/api/api-contracts-api.md`](../../../docs/api/api-contracts-api.md)  
Rule courte : [`.claude/rules/api_usage.md`](../../rules/api_usage.md)  
Subagent exécuteur : **`api-operator`**

## Règle d'or — cookbook hit

Si la tâche est dans [`references/cookbook.md`](references/cookbook.md) : **exécuter la commande**, sans lire le code, sans grep, sans curl alternatif, sans Notion MCP.

Exemple « sync Uresaïr et Valkazer » — **2 requêtes parallèles** (après health si besoin) :

```powershell
npm run api:invoke -- -Method POST -Path /api/v1/gdd-notion-sync/sync-entity -BodyJson '{"name":"Uresaïr"}'
npm run api:invoke -- -Method POST -Path /api/v1/gdd-notion-sync/sync-entity -BodyJson '{"name":"Valkazer Reitar"}'
```

Ne pas utiliser `POST …/sync?category_file=Personnages.json` pour 1–2 noms (sync toute la base stale).

## A — Avant tout appel (hors cookbook)

1. **Health** : `npm run api:invoke -- -Method GET -Path /health`
2. Si down : `npm run start:api` — attendre 200 sur `/health`.
3. **Auth** : voir tableau ci-dessous ; le script gère le login sur 401/403.

| Environnement | Comportement |
|---------------|--------------|
| Dev, `DISABLE_AUTH=true` (défaut local) | Pas de header `Authorization` |
| Dev, auth activée | login auto via script (`admin` / `admin123`) |
| Prod | JWT obligatoire ; pas de mock |

4. **Endpoint inconnu** (absent du cookbook) : serveur up → `GET /api/openapi.json` ; serveur down → [`references/router-map.md`](references/router-map.md) + grep `api/routers/`.

## B — Invocation (une seule voie)

```powershell
npm run api:invoke -- -Method GET -Path /api/v1/gdd-notion-sync/status
npm run api:invoke -- -Method POST -Path /api/v1/gdd-notion-sync/sync -QueryString category_file=Personnages.json
```

Variables : `API_URL` (defaut `http://localhost:4243`), `API_TOKEN` (Bearer si deja connu).

**Query params via npm** : `-QueryString key=value` (ex. `category_file=Personnages.json`). Ne pas utiliser `-Query @{…}` — npm passe la chaine `System.Collections.Hashtable`.

## C — Cookbook

Tâches prêtes à l'emploi : [`references/cookbook.md`](references/cookbook.md).

## D — Router ↔ client

Index compact : [`references/router-map.md`](references/router-map.md).

## E — Preuve agent

Code HTTP + extrait JSON. Pas de « sync OK » sans réponse serveur.
