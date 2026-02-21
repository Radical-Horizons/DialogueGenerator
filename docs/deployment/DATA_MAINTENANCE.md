# Maintenance des Données GDD et Unity

## Contexte

Pour des raisons de déploiement en production, les dossiers suivants ne sont **plus des liens symboliques** mais des **dossiers réels** :

- `data/GDD_categories/` : Contient les fichiers JSON des catégories GDD (personnages, lieux, objets, etc.)
- `data/UnityData/` : Contient les catalogues de référence Unity (TraitCatalog.csv, SkillCatalog.csv, FlagCatalog.csv)
- `Assets/Dialogue/` : Contient les dialogues Unity JSON exportés (dossier réel, plus de lien symbolique)

## ⚠️ Important : Maintenance Manuelle Requise

Le dossier `data/GDD_categories/` n'est **plus alimenté automatiquement** par les scripts Notion Scrapper. Il doit être **mis à jour manuellement** lors des changements du GDD.

Le dossier `data/UnityData/` contient les catalogues CSV de référence Unity. Ces fichiers doivent être **mis à jour manuellement** si le système Unity change (nouveaux traits, compétences, drapeaux).

**Note** : Les dialogues Unity JSON générés sont exportés vers un chemin configuré (voir section "Export des Dialogues Unity JSON" ci-dessous), pas dans `data/UnityData/`.

## Processus de Mise à Jour

### Pour `data/GDD_categories/`

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

Les **dialogues Unity JSON générés** sont exportés vers un **chemin configuré** (pas dans `data/UnityData/`) :
- Le chemin est configuré via les paramètres de l'application (`app_config.json`, clé `unity_dialogues_path`)
- **Chemin actuel** : `DialogueGenerator/Assets/Dialogue/` (dossier réel, plus de lien symbolique)
- L'export se fait via l'endpoint `/api/v1/dialogues/unity/export`

**⚠️ Problème d'export à résoudre** : Le dossier `Assets/Dialogue/` n'est plus un lien symbolique mais un dossier réel. L'export automatique vers Unity doit être revu pour fonctionner correctement en production. Voir Epic 1 pour les améliorations prévues.

**Action manuelle actuelle** : Les dialogues exportés dans `Assets/Dialogue/` doivent être copiés manuellement vers le projet Unity si nécessaire.

### Schéma JSON Unity

Le **schéma JSON Unity** utilisé pour la validation est situé dans :
- `docs/resources/dialogue-format.schema.json`

Ce schéma est utilisé pour valider les dialogues avant export (uniquement en développement, pas en production).

**⚠️ Maintenance manuelle requise** : Si Unity met à jour son format de dialogue, ce schéma doit être mis à jour manuellement.

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

- **Automatisation GDD** : Un script de synchronisation pourrait être créé pour automatiser la copie depuis `Notion_Scrapper`
- **Export Unity** : Le système d'export automatique vers Unity doit être revu pour fonctionner avec le dossier réel `Assets/Dialogue/` (voir Epic 1 pour les améliorations prévues)
- **CI/CD** : Intégrer la mise à jour des données GDD dans le pipeline de déploiement
- **Monitoring** : Ajouter des alertes si les données GDD sont obsolètes ou manquantes

## Références

### GDD
- Code de chargement : `services/gdd_loader.py`
- Configuration des chemins : `services/config_manager.py`
- Documentation des chemins : `.cursor/rules/gdd_paths.mdc`

### Unity
- Export des dialogues : `api/routers/dialogues.py` (endpoint `/api/v1/dialogues/unity/export`)
- Configuration du chemin Unity : `services/configuration_service.py` (méthode `get_unity_dialogues_path()`)
- Schéma JSON Unity : `docs/resources/dialogue-format.schema.json`
- Validateur de schéma : `api/utils/unity_schema_validator.py`
- Catalogues Unity (CSV) : `data/UnityData/` (TraitCatalog.csv, SkillCatalog.csv, FlagCatalog.csv)

---

**Dernière mise à jour** : 2026-01-25 (correction chemin schéma JSON Unity)
