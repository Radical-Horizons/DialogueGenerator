---
description: GDD Notion sync — régénérer settings depuis l’API quand le flux ou le script change
alwaysApply: false
globs:
  - scripts/build_gdd_notion_settings_from_notion.py
  - data/gdd_notion_sync/settings.json
  - services/gdd_notion_sync*.py
  - services/gdd_notion_full_sync_checkpoint.py
  - api/routers/gdd_notion_sync.py
  - api/schemas/gdd_notion_sync.py
---

- Après modification du script de construction des sources ou d’une logique qui impose un `settings.json` aligné sur le workspace Notion (filtres page/database, compact tables, etc.) : exécuter **sans attendre** une demande explicite :  
  `node scripts/getPythonPath.js -m scripts.build_gdd_notion_settings_from_notion`  
  (`.env` avec `NOTION_API_KEY`).
- Si l’appel réseau est impossible ou refusé par l’utilisateur, l’indiquer clairement plutôt que de laisser un `settings.json` supposé à jour.

## Sync complète + historique

- **Sync complète** (`POST .../sync?full=true`) : archive automatique de l’état courant, écriture sous `.staging/<run>/`, promotion miroir vers le live (cibles des sources) si aucune erreur bloquante ; `archive_retention_count` limite le nombre de dossiers sous `.archive/`. Le paramètre query `mirror_rebuild` est déprécié (sans effet). La clé JSON `mirror_rebuild_on_full_sync` est tolérée mais n’influence plus le comportement.
- **API historique** : `GET .../archives?limit=N` liste les snapshots valides ; `POST .../archives/{id}/restore` rétablit un snapshot (option `backup_current` pour archiver l’état actuel avant).
- **Après restauration** : le manifeste Notion (`data/.gdd_snapshot/manifest.json`) est réinitialisé pour éviter un décalage avec le disque.

## Reprise sync complète, zéro, pause

- **Checkpoint** : pendant une sync complète, état sous `data/gdd_notion_sync/full_sync_checkpoint.json` + `full_sync_checkpoint.manifest.json` (manifeste de run jusqu’à promotion) ; mis à jour après chaque source terminée.
- **Reprendre** : `POST .../sync?full=true&resume=true` (validation : staging présent, empreinte sources + ordre des `category_file` inchangés).
- **Tout recommencer** : `POST .../sync?full=true&fresh=true` (abandon checkpoint + staging référencé, nouvelle archive + nouveau staging). Une sync complète sans `resume` ni `fresh` abandonne aussi un checkpoint précédent.
- **Abandon sans relancer** : `DELETE .../full-sync-checkpoint` (efface aussi tout ``.staging/`` — un seul run incomplet à la fois).
- **État UI** : `GET .../full-sync-checkpoint` (`checkpoint_status`, `orphan_staging_runs`, message explicite).
- **Pause / reprise / annulation coopératives** : `POST .../full-sync/pause`, `.../unpause`, `.../cancel` (la sync en cours tient le verrou asyncio : le planificateur auto-sync attend la fin).
