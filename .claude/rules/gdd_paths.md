---
description: >-
  Chemins et données GDD (GDD_categories, shards, Vision.json, cache .gdd_snapshot,
  gdd_loader, gdd_paths, gdd_disk_cache, context_builder, split_gdd_category_to_shards,
  sync Notion .archive/.staging). Apply when changing GDD layout on disk, loaders,
  fingerprints, or DATA_MAINTENANCE.
alwaysApply: false
---

# Chemins GDD

- **Catégories GDD** : `data/GDD_categories/` (relatif à la racine du dépôt ; alimenter via sync Notion / copie ; voir `docs/deployment/DATA_MAINTENANCE.md`). Les dossiers `.archive/` et `.staging/` sont gitignored (backups sync), pas nécessairement tout le répertoire.
- **Shards (listes)** : forme cible — répertoires `personnages/*.json`, `systemes_de_jeu/*.json`, etc. (une fiche = un fichier Notion = un JSON ; prioritaire s’il y a au moins un JSON). **Monolithes `*.json` à la racine** : tolérés temporairement (transition) ; découpe → shards : `python scripts/split_gdd_category_to_shards.py --category <clé>`
- **Sync Notion (complète)** : réserve `.archive/` (snapshots, listables via API) et `.staging/` (temporaire) ; ne pas versionner ; restauration et détails dans `.claude/rules/gdd_notion_sync_builder.md`.
- **Vision.json** : `data/Vision.json` (dans le même dossier que GDD_categories)
- **Variable d'environnement** : `GDD_IMPORT_PATH` peut pointer vers le dossier contenant Vision.json ou directement vers le fichier
- **Cache disque** : `data/.gdd_snapshot/` (gitignored) — pickle du `GDDData` si l’empreinte source est inchangée ; l’empreinte inclut **shards** (`especes/*.json`, etc.) et monolithes (`services/gdd_disk_cache.compute_gdd_fingerprint`) ; `GDD_DISK_CACHE=false` pour désactiver

⚠️ **Note** : `data/GDD_categories/` peut être versionné (fiches) ; `.archive/` et `.staging/` restent ignorés. Les tests « vraies données » exigent des fiches présentes (shards ou monolithe temporaire).

- **Même changement que le code** : toute évolution de stratégie de chemins, shards ou chargeur GDD dans le code doit mettre à jour **ce fichier** dans le même lot (évite dérive doc ↔ runtime).
