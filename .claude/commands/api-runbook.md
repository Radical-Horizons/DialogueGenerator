---
description: Invoquer l'API REST DialogueGenerator (health, sync GDD Notion, contexte, documents) — exécuter, ne pas explorer le code.
argument-hint: "[action, ex. 'sync Personnages' ou 'statut sync GDD']"
allowed-tools: Bash(npm run api:invoke:*), Bash(npm run start:api), Read, Grep
---

Charge le skill **`api-runbook`** (`.claude/skills/api-runbook/SKILL.md`) et **exécute** — ne pas explorer le code si le cookbook couvre la tâche.

Demande : $ARGUMENTS

## Protocole agent — cookbook hit

1. Ouvrir `.claude/skills/api-runbook/references/cookbook.md` — **pas** de recherche sémantique ni grep dans les routers
2. `npm run api:invoke -- -Method GET -Path /health` — si connexion refusée : `npm run start:api`, attendre, retry
3. Exécuter la commande cookbook (`npm run api:invoke -- …`)
4. Rapporter code HTTP + JSON

**Interdit** pour tâches cookbook : lire `Invoke-DialogueApi.ps1`, curl parallèle, Notion MCP, explorer `api/routers/`.

## Exemples utilisateur → action (sans exploration)

| Demande | Commandes |
|---------|-----------|
| Sync Uresaïr / Valkazer / personnages | health → `POST …/sync?category_file=Personnages.json` → `GET …/status` |
| Statut sync GDD | `GET /api/v1/gdd-notion-sync/status` |

Règle : `.claude/rules/api_usage.md` · Subagent : **`api-operator`**
