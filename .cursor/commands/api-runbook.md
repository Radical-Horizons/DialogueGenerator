# API runbook — invoquer l'API DialogueGenerator

Charge le skill **`.cursor/skills/api-runbook/SKILL.md`** et **exécute** (ne pas explorer le code si le cookbook couvre la tâche).

## Protocole agent — cookbook hit

1. Ouvrir `.cursor/skills/api-runbook/references/cookbook.md` — **pas** de SemanticSearch ni grep routers
2. `npm run api:invoke -- -Method GET -Path /health` — si connexion refusée : `npm run start:api`, attendre, retry
3. Exécuter la commande cookbook (`npm run api:invoke -- …`)
4. Rapporter code HTTP + JSON

**Interdit** pour tâches cookbook : lire `Invoke-DialogueApi.ps1`, curl parallèle, Notion MCP, explorer `api/routers/`.

## Exemples utilisateur → action (sans exploration)

| Demande | Commandes |
|---------|-----------|
| Sync Uresaïr / Valkazer / personnages | health → `POST …/sync?category_file=Personnages.json` → `GET …/status` |
| Statut sync GDD | `GET /api/v1/gdd-notion-sync/status` |

Rule : `.cursor/rules/api_usage.mdc` · Subagent : **`api-operator`**
