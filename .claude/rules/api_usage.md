---
description: >-
  Invoquer l'API REST FastAPI DialogueGenerator (sync Notion/GDD, contexte, documents,
  graphe, dialogues, coûts). Apply when the user asks to call an endpoint, sync GDD,
  précalcul tokens, curl the API, or run a backend action without reimplementing it in scripts.
paths:
  - "api/routers/**"
  - "scripts/Invoke-DialogueApi.ps1"
  - ".claude/skills/api-runbook/**"
---
# Invocation API (agents)

- **Runbook** : skill `.claude/skills/api-runbook/SKILL.md` — **lire le cookbook en premier**, pas le code.
- **Cookbook hit** (sync personnages, status sync, estimate-tokens, etc.) : exécuter **immédiatement** la commande du cookbook. **Interdit** : SemanticSearch, grep routers, lire `Invoke-DialogueApi.ps1`, curl parallèle, Notion MCP, exploration filesystem.
- **Budget commandes** (tâche cookbook) : health (1) → action (1) → status si pertinent (1). Pas de 2e ou 3e méthode d'invocation si la première échoue sans diagnostic.
- **Ordre si pas dans cookbook** : serveur up → `/api/openapi.json` → grep `@router` dans `api/routers/`.
- **Base URL dev** : `http://localhost:4243` (`npm run dev` ou `npm run start:api`).
- **Invocation unique** : `npm run api:invoke -- -Method … -Path …` ; query params via **`-QueryString key=value`** (pas `-Query @{…}` : npm ne serialise pas les hashtables PowerShell).
- **Auth locale** : défaut `DISABLE_AUTH=false` (JWT + guest UI). Le helper login auto si JWT requis. Pytest force `DISABLE_AUTH=true` via conftest.
- **Exécuter** et montrer status + JSON ; ne pas réimplémenter la logique métier.
- **Sync personnages** (Uresaïr, Valkazer, etc.) : `POST /api/v1/gdd-notion-sync/sync-entity` avec `{"name":"…"}` — une fiche, fuzzy ; pas `POST …/sync?category_file=Personnages.json` (base entière).
