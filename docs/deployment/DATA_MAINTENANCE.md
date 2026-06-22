# Maintenance des Données GDD et Unity

## Contexte

Pour des raisons de déploiement en production, les dossiers suivants ne sont **plus des liens symboliques** mais des **dossiers réels** :

- `data/GDD_categories/` : Contient les fichiers JSON des catégories GDD (personnages, lieux, objets, etc.)
- `data/UnityData/` : Contient les catalogues de référence Unity (TraitCatalog.csv, SkillCatalog.csv, FlagCatalog.csv)
- `Assets/Dialogue/` : Contient les dialogues Unity JSON exportés (dossier réel, plus de lien symbolique)

## ⚠️ Important : comment le GDD est alimenté

**Option A — Sync intégrée (Notion → disque)** : l’application peut synchroniser le GDD depuis Notion via l’API **`/api/v1/gdd-notion-sync`** (configuration dans `data/gdd_notion_sync/settings.json`, token fichier ou `NOTION_API_KEY`). Guide : [`docs/guides/GDD_NOTION_SYNC.md`](../guides/GDD_NOTION_SYNC.md).

**Option B — Chaîne externe** : sans utiliser la sync intégrée, le dossier `data/GDD_categories/` peut être mis à jour **manuellement** (ex. export depuis le projet Notion Scrapper, copie des JSON).

Le dossier `data/UnityData/` contient les catalogues CSV de référence Unity. Ces fichiers doivent être **mis à jour manuellement** si le système Unity change (nouveaux traits, compétences, drapeaux).

**Note** : Les dialogues Unity JSON générés sont exportés vers un chemin configuré (voir section "Export des Dialogues Unity JSON" ci-dessous), pas dans `data/UnityData/`.

## Processus de Mise à Jour

### Pour `data/GDD_categories/` (sans sync intégrée)

1. **Exporter les données depuis Notion** :
   - Exécuter les scripts du projet `Notion_Scrapper` :
     - `main.py` : Export des pages et bases de données Notion
     - `merge.py` : Agrégation des fichiers par catégorie
     - `filter.py` : Génération des variantes filtrées

2. **Copier les fichiers** :
   - Les fichiers générés se trouvent dans `../Notion_Scrapper/output/` ou `../Notion_Scrapper/GDD/`
   - Copier les fichiers JSON nécessaires vers `DialogueGenerator/data/GDD_categories/`
   - Fichiers attendus :
     - `lieux.json` ou `lieux_full.json`
     - `personnages.json` ou `personnages_full.json`
     - `objets.json` ou `objets_full.json`
     - `especes.json` ou `especes_full.json`
     - `communautes.json` ou `communautes_full.json`
     - `quetes.json` ou `quetes_full.json`
     - `dialogues.json` ou `dialogues_full.json`
     - `structure_narrative.json`
     - `structure_macro.json`
     - `structure_micro.json`

3. **Vérifier le format** :
   - Les fichiers doivent respecter le format attendu par `GDDLoader`
   - Format attendu : `{"lieux": [...], "personnages": [...], ...}` ou liste directe `[...]`

### Pour `data/UnityData/`

Ce dossier contient les **catalogues de référence Unity** (fichiers CSV) :
- `TraitCatalog.csv` : Catalogue des traits Unity
- `SkillCatalog.csv` : Catalogue des compétences Unity
- `FlagCatalog.csv` : Catalogue des drapeaux Unity

Ces fichiers sont utilisés par l'application pour valider et référencer les traits, compétences et drapeaux lors de la génération de dialogues.

**⚠️ Maintenance manuelle requise** : Ces fichiers CSV doivent être mis à jour manuellement si le système Unity change (ajout de nouveaux traits, compétences, drapeaux).

### Export des Dialogues Unity JSON

Les **dialogues Unity JSON exportés** sont écrits vers un **chemin configuré** (pas dans `data/UnityData/`) :

- **Configuration :** `config/app_config.json` (clé `unity_dialogues_path`) ou API `GET`/`PUT` `/api/v1/config/unity-dialogues-path`
- **Chemin typique dev :** dossier sous le dépôt ou projet Unity (ex. `Assets/Dialogue/`)
- **Écriture :** atomique (tmp → rename) avec sidecar `{stem}.seq` pour la concurrence ADR-006

**Flux principaux :**

| Contexte | Endpoint | Guide |
|----------|----------|-------|
| Éditeur de graphe | `POST /api/v1/unity-dialogues/graph/save-and-write` | [Unity Export](../guides/unity-export.md) |
| Bibliothèque / batch | `POST /api/v1/dialogues/batch-export`, preview/download | idem |
| Export JSON brut | `POST /api/v1/dialogues/unity/export` | idem |

**Validation :** schéma `docs/resources/dialogue-format.schema.json` + règles GDD (voir `services/unity_export_validation_service.py`). Les exports bloquants échouent en `422` avec erreurs structurées.

**Logs métier :** `data/logs/exports/YYYY-MM-DD.json` — consultables via `GET /api/v1/exports/logs`.

**Intégration Unity :** copier ou pointer le projet Unity vers le répertoire configuré ; pas de push automatique vers le moteur de jeu.

## Chemins de Configuration

Les chemins peuvent être configurés via variables d'environnement :

- `GDD_CATEGORIES_PATH` : Chemin vers le répertoire des catégories GDD (défaut : `data/GDD_categories`)
- `GDD_IMPORT_PATH` : Chemin vers le répertoire import/Bible_Narrative (défaut : `../import/Bible_Narrative`)

## Vérification

Pour vérifier que les données sont correctement chargées :

1. **Vérifier les logs au démarrage** :
   - Le serveur backend affiche les chemins utilisés et le nombre d'éléments chargés
   - Rechercher dans les logs : `"Chargement des fichiers GDD terminé"`

2. **Tester via l'API** :
   - `GET /api/v1/context/characters` : Liste des personnages
   - `GET /api/v1/context/locations` : Liste des lieux
   - `GET /api/v1/context/locations/regions` : Liste des régions

3. **Vérifier l'interface web** :
   - Le panneau de contexte doit afficher les personnages, lieux, etc.
   - Si les listes sont vides, vérifier que les fichiers JSON sont présents et correctement formatés

## Dépannage

### Problème : Les données ne se chargent pas

1. **Vérifier que les fichiers existent** :
   ```powershell
   Get-ChildItem "data/GDD_categories" -Filter "*.json"
   ```

2. **Vérifier le format JSON** :
   - Ouvrir un fichier et vérifier qu'il est valide JSON
   - Vérifier la structure attendue (clé principale ou liste directe)

3. **Vérifier les logs** :
   - Les erreurs de chargement sont loggées avec le niveau `WARNING` ou `ERROR`
   - Rechercher les messages contenant le nom du fichier problématique

### Problème : Les régions ne s'affichent pas

- Vérifier que `lieux.json` contient des lieux avec `"Catégorie": "Région"`
- Vérifier que les noms de régions sont corrects (pas de problèmes d'encodage)

## Notes pour le Développement Futur

- **Automatisation GDD** : la sync Notion intégrée couvre le flux API/UI ; la copie depuis `Notion_Scrapper` reste une alternative hors application
- **Export Unity** : pipeline Epic 5 documenté dans [`docs/guides/unity-export.md`](../guides/unity-export.md) — validation schéma, batch (max 64), logs métier
- **CI/CD** : Intégrer la mise à jour des données GDD dans le pipeline de déploiement
- **Monitoring** : Ajouter des alertes si les données GDD sont obsolètes ou manquantes

## Références

### GDD
- Code de chargement : `services/gdd_loader.py`
- Sync Notion → `data/GDD_categories/` : `services/gdd_notion_sync_service.py`, `api/routers/gdd_notion_sync.py`, guide [`docs/guides/GDD_NOTION_SYNC.md`](../guides/GDD_NOTION_SYNC.md)
- Configuration des chemins : `services/gdd_paths.py`, `services/configuration_service.py`
- Documentation des chemins : `.cursor/rules/gdd_paths.mdc`

### Unity
- Guide export (Epic 5) : [`docs/guides/unity-export.md`](../guides/unity-export.md)
- Routes HTTP : `api/routers/dialogues.py`, `api/routers/graph_io.py`, `api/routers/exports.py`
- Configuration du chemin Unity : `services/configuration_service.py` (`get_unity_dialogues_path()`)
- Schéma JSON Unity : `docs/resources/dialogue-format.schema.json`
- Validateur export : `services/unity_export_validation_service.py`, `api/utils/unity_schema_validator.py`
- Catalogues Unity (CSV) : `data/UnityData/` (TraitCatalog.csv, SkillCatalog.csv, FlagCatalog.csv)

---

**Dernière mise à jour** : 2026-06-22 (export Unity Epic 5, sync GDD Notion)
