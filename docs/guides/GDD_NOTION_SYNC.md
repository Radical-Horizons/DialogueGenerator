# Sync GDD depuis Notion

## Rôle

Le backend peut **télécharger le GDD depuis Notion** et l’écrire sous `data/GDD_categories/` (fichiers JSON ou répertoires de shards), puis rafraîchir le `ContextBuilder` en mémoire. L’UI expose la configuration et le déclenchement ; l’API REST est utilisable par des scripts (même contrainte **JWT** que le reste de l’API).

## Fichiers et chemins

| Élément | Emplacement |
|--------|-------------|
| Paramètres (sources, intervalle, filtres) | `data/gdd_notion_sync/settings.json` |
| Token Notion (prioritaire sur l’env) | `data/gdd_notion_sync/notion_token.secret` |
| Statut dernier run | `data/gdd_notion_sync/status.json` |
| Manifeste incrémental | `data/.gdd_snapshot/manifest.json` |
| Checkpoint sync complète | `data/gdd_notion_sync/full_sync_checkpoint.json` (+ `.manifest.json`) |
| Snapshots avant promotion | `data/GDD_categories/.archive/<id>/` |
| Staging sync complète | `data/GDD_categories/.staging/<run>/` |
| Logs dédiés | `data/logs/gdd_notion_sync.log` (rotation selon config logging) |

**Token** : si `notion_token.secret` est absent ou vide, le service utilise la variable d’environnement `NOTION_API_KEY` (voir `GddNotionSyncConfigStore.read_token()`).

**Construction initiale des sources** : pour aligner `settings.json` sur le workspace Notion, le dépôt fournit `scripts.build_gdd_notion_settings_from_notion` (clé Notion dans `.env`). Détails : `.cursor/rules/gdd_notion_sync_builder.mdc`.

## Configuration (aperçu)

- **`sources`** : liste d’objets `{ notion_id, kind: "database" \| "page", category_file, notion_data_source_ids? }`. Chaque source mappe une page ou une base Notion vers un nom de fichier cible (ex. `personnages.json`).
- **`included_categories`** : si **non vide**, seules les sources **database** dont `category_file` est listé sont synchronisées ; les sources **page** sont exclues pour ce run (comportement documenté dans `GddNotionSyncConfigPublic`). Après une **sync complète** réussie (promotion miroir), les fichiers ou dossiers shards correspondant aux bases **non cochées** sont **supprimés** du disque sous `GDD_categories/` (les JSON issus des fiches `page` déjà présents ne sont pas effacés).
- **`auto_sync_enabled` / `sync_interval_minutes`** : planification côté serveur (voir `api/main.py` / tâches de fond).
- **`archive_retention_count`** : nombre max de dossiers sous `.archive/` (les plus anciens sont supprimés).
- **`mirror_rebuild_on_full_sync`** : **déprécié**, ignoré ; une sync complète applique toujours le miroir disque.

Schémas Pydantic : `api/schemas/gdd_notion_sync.py`.

## Bases « sans corps de page » (optimisation)

Certaines bases Notion n’ont que des **colonnes** (flags, inventaires, skills, vocabulaire…) : les lignes existent comme pages mais le **corps** (markdown / blocs) est vide. Pour ces bases (**export compact**, liste `NOTION_DATABASE_COMPACT_TABLE_IDS` dans le mapper) :

- **Pas de `get_page_content`**.
- **Pas de `get_page` par ligne** : les colonnes sont lues directement depuis le résultat de **`query_database`** (une requête paginée par base).
- Sync **complète** compacte monolithe : réécriture du fichier sans relire l’ancien JSON (~1 Mo).

Les autres bases peuvent éviter `get_page_content` après **sonde** sur les 3 premières lignes (ordre du `query_database`) ; titre et colonnes restent synchronisés via `get_page` si la sonde ne suffit pas.

## Sync incrémentale vs complète

- **POST `/api/v1/gdd-notion-sync/sync`** (sans `full=true`) : sync incrémentale guidée par le manifeste.
- **`full=true`** : sync complète — archive l’état courant, écriture sous `.staging/<run>/`, promotion vers les cibles des sources si pas d’erreur bloquante. Le query param `mirror_rebuild` est **déprécié** (sans effet).

**Reprise / abandon** :

- `resume=true` (avec `full=true`) : reprend une sync complète interrompue (checkpoint + staging valides, empreinte des sources inchangée).
- `fresh=true` (avec `full=true`) : abandon checkpoint + staging référencé, nouveau run complet.
- `DELETE /full-sync-checkpoint` : abandon sans lancer de sync (efface aussi `.staging/`).
- **Pause / annulation** : `POST .../full-sync/pause`, `.../unpause`, `.../cancel`.

État du checkpoint : **GET** `/full-sync-checkpoint`. Progression live : **GET** `/sync-progress`.

## Archives et restauration

- **GET** `/archives?limit=N` : liste des snapshots sous `.archive/`.
- **POST** `/archives/{archive_id}/restore` : corps optionnel `{ "backup_current": true }` (défaut : archiver le GDD actuel avant restauration).

Après restauration, le manifeste Notion est réinitialisé pour éviter un décalage disque / manifeste (voir règle `gdd_notion_sync_builder.mdc`).

## Export NotebookLM (ZIP Markdown)

**GET** `/api/v1/gdd-notion-sync/notebooklm-export?max_files=64` (entier 1–128, défaut 64).

- Réponse : `application/zip`, fichier suggéré `gdd-notebooklm-export.zip`.
- Contenu : regroupe le JSON **déjà présent sur disque** (périmètre `sources` + `included_categories`) en fichiers Markdown thématiques, plus `Vision.json` si trouvé (résolution identique à `GDDLoader` / `GDD_IMPORT_PATH`).
- Taille : chaque fichier Markdown reste sous ~1,8M caractères (`_MAX_EXPORT_CHARS_PER_PART` dans `services/gdd_notebooklm_export.py`) ; un thème trop volumineux est **découpé** en `…-part02.md`, `…-part03.md`, etc., sans tronquer le texte. Si le nombre de fichiers dépassait `max_files`, l’API renvoie une erreur explicite (augmenter le paramètre).

Implémentation : `services/gdd_notebooklm_export.py`, `GddNotionSyncService.build_notebooklm_export_zip()`.

## Références code

| Zone | Fichiers |
|------|-----------|
| Routes HTTP | `api/routers/gdd_notion_sync.py` |
| Service | `services/gdd_notion_sync_service.py` |
| Client frontend | `frontend/src/api/gddNotionSync.ts` |
| Injection DI | `api/container.py` (`get_gdd_notion_sync_service`) |
| Constantes chemins | `constants.py` (`FilePaths.GDD_NOTION_SYNC_*`) |

Contrat API détaillé : [Backend API Contracts — GDD Notion Sync](../api/api-contracts-api.md#gdd-notion-sync-endpoints).
