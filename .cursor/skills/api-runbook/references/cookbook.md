# Cookbook API — tâches agent fréquentes

Prérequis commun : API sur `:4243`, health OK, auth selon skill principal.

## GDD / Notion sync

### Sync fiches personnages (Uresaïr, Valkazer, etc.)

**Sync ciblée (1 fiche, fuzzy)** — préférer à la sync base entière :

```powershell
npm run api:invoke -- -Method POST -Path /api/v1/gdd-notion-sync/sync-entity -BodyJson '{"name":"Uresaïr","category_file":"Personnages.json"}'
npm run api:invoke -- -Method POST -Path /api/v1/gdd-notion-sync/sync-entity -BodyJson '{"name":"Valkazer Reitar","category_file":"Personnages.json"}'
```

Les deux appels peuvent être lancés en parallèle. La réponse contient `success`, `resolved_name`, `gdd_relative_path` — pas de `GET …/status` nécessaire.

**Sync incrémentale base entière** (82+ fiches si manifeste stale — éviter pour 1–2 noms) :

```powershell
npm run api:invoke -- -Method GET -Path /health
npm run api:invoke -- -Method POST -Path /api/v1/gdd-notion-sync/sync -QueryString category_file=Personnages.json
npm run api:invoke -- -Method GET -Path /api/v1/gdd-notion-sync/status
```

### Sync complète GDD (lourd)

```powershell
pwsh -File scripts/Invoke-DialogueApi.ps1 -Method POST -Path /api/v1/gdd-notion-sync/sync -QueryString full=true
```

### Test connexion Notion

```powershell
pwsh -File scripts/Invoke-DialogueApi.ps1 -Method POST -Path /api/v1/gdd-notion-sync/test-connection
```

### Export NotebookLM (ZIP)

```powershell
pwsh -File scripts/Invoke-DialogueApi.ps1 -Method GET -Path /api/v1/gdd-notion-sync/notebooklm-export
```

## Contexte GDD

### Estimer tokens sélection contexte

```powershell
pwsh -File scripts/Invoke-DialogueApi.ps1 -Method POST -Path /api/v1/context/estimate-tokens -BodyJson '{"selection":{"characters":["Uresaïr"]},"user_instructions":"","organization_mode":"default"}'
```

Adapter le corps selon [`api/schemas/dialogue.py`](../../../api/schemas/dialogue.py) / contrats API.

### Lookup tokens précompilés (panneau détails)

```powershell
pwsh -File scripts/Invoke-DialogueApi.ps1 -Method POST -Path /api/v1/context/precomputed-entity-tokens -BodyJson '{ ... }'
```

Voir `POST /api/v1/context/precomputed-entity-tokens` dans [`api/routers/context.py`](../../../api/routers/context.py).

### Lister / détail personnage

```powershell
pwsh -File scripts/Invoke-DialogueApi.ps1 -Method GET -Path /api/v1/context/characters
pwsh -File scripts/Invoke-DialogueApi.ps1 -Method GET -Path '/api/v1/context/characters/Uresaïr'
```

## Documents & graphe

| Tâche | Méthode + chemin |
|-------|------------------|
| Lire document | `GET /api/v1/documents/{id}` |
| Preview FR94 | `POST /api/v1/documents/{id}/preview` |
| Valider graphe | `POST /api/v1/unity-dialogues/graph/validate` |
| Coût génération nœud | `POST /api/v1/unity-dialogues/graph/estimate-cost` |
| **Expansion dialogue complet (BFS)** | `POST /api/v1/unity-dialogues/graph/expand-tree` |

Préfixe graphe : `/api/v1/unity-dialogues/graph/*` — voir [`references/router-map.md`](router-map.md).

### Expansion dialogue autonome (arbre complet)

Dry-run (estimation ~121 appels LLM, modèle **gpt-5-mini** imposé) :

```powershell
npm run generate:dialogue-tree -- --dry-run --depth 4 --choices 3 --characters Uresaïr
```

Génération réelle (petit arbre depth=2) :

```powershell
npm run generate:dialogue-tree -- --depth 2 --choices 3 --characters Uresaïr --title "Rencontre test"
```

Run complet avec PJ/PNJ/lieu scène (ex. Uresaïr chez Voknir) :

```powershell
npm run generate:dialogue-tree -- `
  --depth 4 --choices 3 `
  --player Uresaïr --npc "Voknir Esh'Maradel" `
  --characters Uresaïr "Voknir Esh'Maradel" `
  --scene-region "Plis d'ossements" --sub-location "Atelier de Voknir" `
  --title "Uresaïr chez Voknir" --document-id test_uresair_voknir `
  --print-path --save-json data/test_dialogues/test_uresair_voknir.json
```

Flags utiles : `--player`, `--npc`, `--scene-region`, `--sub-location`, `--print-path`, `--path-choice`, `--save-json`.

Via API directe :

```powershell
npm run api:invoke -- -Method POST -Path /api/v1/unity-dialogues/graph/expand-tree -BodyJson '{"user_instructions":"Scène courte","context_selections":{"characters_full":["Uresaïr"]},"max_depth":2,"max_choices":3,"persist":false,"dry_run":true}'
```

## Dialogues & LLM

| Tâche | Chemin |
|-------|--------|
| Estimer tokens prompt dialogue | `POST /api/v1/dialogues/estimate-tokens` |
| Générer variantes | `POST /api/v1/dialogues/generate/variants` |
| Usage LLM | `GET /api/v1/llm-usage/...` |
| Budget coûts | `GET /api/v1/costs/budget` |

## Logs & config

```powershell
npm run api:invoke -- -Method GET -Path /api/v1/logs -QueryString limit=20
pwsh -File scripts/Invoke-DialogueApi.ps1 -Method GET -Path /api/v1/config/llm
```

## Auth (si JWT requis)

```powershell
pwsh -File scripts/Invoke-DialogueApi.ps1 -Method POST -Path /api/v1/auth/login -BodyJson '{"username":"admin","password":"admin123"}'
```
