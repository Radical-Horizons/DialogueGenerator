# Export Unity JSON (Epic 5)

**Dernière mise à jour :** 2026-06-22  
**Référence d'implémentation :** le code et les tests font foi (`services/unity_dialogue_export_service.py`, `services/unity_export_validation_service.py`, `api/routers/dialogues.py`, `api/routers/graph_io.py`, tests `test_unity_export_*`, `test_dialogue_download_story_5_4.py`).

Ce guide décrit le pipeline **export → validation → écriture disque → téléchargement → journalisation** livré pour les stories 5.1–5.6 (FR49–FR54). En cas d'écart avec un document de planification, vérifier le code.

---

## Vue d'ensemble

Deux surfaces utilisateur partagent le même pipeline backend :

| Surface | Flux typique | Source log export |
|---------|--------------|-------------------|
| **Éditeur de graphe** | `save-and-write` ou `preview-export` | `graph` |
| **Bibliothèque Unity Dialogues** | batch/single export, preview, download | `library`, `batch`, `unity_export` |

Le document cible est le **Unity Dialogue JSON** canonique (`schemaVersion` + `nodes`). Le schéma de référence est `docs/resources/dialogue-format.schema.json`.

---

## Configuration du répertoire d'export

Les fichiers exportés sont écrits sous le chemin configuré `unity_dialogues_path` :

- **Lecture/écriture :** `ConfigurationService.get_unity_dialogues_path()` (`services/configuration_service.py`)
- **API config :** `GET` / `PUT` `/api/v1/config/unity-dialogues-path` (`api/routers/config.py`)
- **Stockage :** `config/app_config.json` (clé `unity_dialogues_path`)

Si le chemin n'est pas configuré, les endpoints d'export renvoient une `ValidationException` avec `details.field = "unity_dialogues_path"`.

**Écriture atomique (ADR-006) :** `write_unity_dialogue_to_file()` écrit via fichier temporaire → `fsync` → `rename`. Un sidecar `{stem}.seq` persiste le dernier `seq` reconnu pour éviter les écrasements concurrents (`save-and-write` avec `seq` fourni).

---

## Validation export (FR51)

Pipeline unifié : `services/unity_export_validation_service.py` → `validate_unity_export_document()` / `unity_export_schema_validator`.

| Couche | Bloquant ? | Détail |
|--------|------------|--------|
| JSON Schema Unity | Oui | `validate_unity_json_structured()` |
| Règles GDD (RepPalier) | Oui | `validate_dialogue_flags_do_not_store_rep_palier()` |
| Seuils flags/compteurs | Non (warnings) | `MAX_CONVERSATIONAL_FLAGS`, `MAX_COUNTERS` |
| Volumétrie nœuds | Non (warnings) | `MAX_NODES_MAINTAINABILITY` |

Les warnings GDD apparaissent dans les logs d'export (`warnings_gdd`) mais **ne bloquent pas** l'écriture.

**Normalisation :** `normalize_unity_export_document()` est appliquée avant validation/écriture. Un tableau legacy `[{node…}]` est converti en `{ "schemaVersion": "1.1.0", "nodes": [...] }`.

**Opt-out batch :** `POST /dialogues/batch-export` accepte `skip_validation: true` (écriture sans validation schéma — usage avancé uniquement).

---

## Endpoints API — graphe (`/api/v1/unity-dialogues/graph`)

JWT requis. Client : `frontend/src/api/graph.ts`.

| Méthode | Chemin | Rôle |
|---------|--------|------|
| `POST` | `/save-and-write` | Convertit nodes/edges → Unity JSON, valide, écrit sur disque |
| `POST` | `/preview-export` | Même conversion sans écriture ; retourne `ExportPreviewResponse` |

`save-and-write` enregistre un log export `source=graph` en cas de succès ou d'échec de validation.

**Concurrence ADR-006 :** si `seq` est fourni et `seq <= last_seq` (lu depuis `{stem}.seq`), le serveur **n'écrase pas** le fichier et renvoie `ack_seq` / `last_seq` avec le JSON généré.

---

## Endpoints API — dialogues (`/api/v1/dialogues`)

JWT requis. Client : `frontend/src/api/dialogues.ts`.

| Méthode | Chemin | Story | Rôle |
|---------|--------|-------|------|
| `POST` | `/unity/export` | 5.1 | Export JSON brut (corps `json_content`) vers disque |
| `POST` | `/batch-export` | 5.2 | Export batch depuis documents persistés (`document_ids`, max **64**) |
| `POST` | `/{document_id}/validate-schema` | 5.3 | Validation schéma d'un document sur disque |
| `GET` | `/{document_id}/preview-export` | 5.5 | Preview JSON formaté + `schema_valid` / `errors` |
| `POST` | `/batch-preview-export` | 5.5 | Preview batch (aperçu tronqué si volumineux) |
| `GET` | `/{document_id}/download` | 5.4 | Téléchargement JSON (`Content-Disposition: attachment`) |
| `POST` | `/batch-download` | 5.4 | Archive ZIP (`compression`: `store` \| `deflate`) |

**Réponse export unitaire :** `ExportUnityDialogueResponse` — `{ filename, success }` uniquement. Le champ `file_path` est **déprécié et non renseigné** (pas de fuite de chemins serveur).

**Batch export :** `filename_strategy` = `preserve` (défaut, `{document_id}.json`) ou `slug` (dérivé du titre / première ligne).

**Limites batch :** `Defaults.UNITY_EXPORT_BATCH_MAX_ITEMS = 64` (`constants.py`) pour `document_ids` et `filenames`.

---

## Logs d'export métier (FR54)

Distinct des logs observabilité FastAPI (`data/logs/logs_*.json`).

| Élément | Emplacement |
|---------|-------------|
| Fichiers journaliers | `data/logs/exports/YYYY-MM-DD.json` |
| API consultation | `GET /api/v1/exports/logs` |
| Client frontend | `frontend/src/api/exports.ts` → `ExportLogsPanel` |

**Query params :** `start_date`, `end_date` (défaut : 30 derniers jours), `status` (`success` \| `failure`).

Chaque entrée inclut : `dialogue_id`, `filename`, `export_status`, `validation_status`, `errors`, `warnings_gdd`, `source` (`graph` \| `library` \| `batch` \| `unity_export`), `cost_eur` (si disponible via `LLMUsageService`).

---

## UI — Bibliothèque Unity Dialogues

Composants : `frontend/src/components/unityDialogues/`

- `UnityDialoguesPage` — liste et détail des fichiers exportés
- `BatchExportToolbar` / `BatchExportSummaryBanner` — export batch depuis la bibliothèque
- `ExportPreviewModal` / `ExportPreviewJsonTree` — preview avant export
- `DownloadExportOptionsPanel` / `ExportDownloadBanner` — téléchargement single/batch
- `ExportLogsPanel` — historique des exports (FR54)

Options batch persistées localement : `frontend/src/utils/batchExportOptions.ts` (`validateBeforeExport`, `filenameStrategy`).

---

## Sécurité export

- **Noms de fichier :** `safe_export_filename()` rejette `..`, `/`, `\` ; seul le basename est accepté (`services/unity_dialogue_download_service.py`).
- **Écriture disque :** `_resolve_export_path()` vérifie que le chemin résolu reste sous `unity_dir` (`services/unity_dialogue_export_service.py`).
- **Réponses API :** pas de `file_path` absolu dans les réponses export.
- **Téléchargement :** `Content-Disposition` construit via `content_disposition_attachment()` (guillemets et sauts de ligne neutralisés).
- **Erreurs serveur :** messages génériques sur les endpoints export (détails dans les logs serveur, pas dans le corps 500).

Voir aussi [SECURITY.md](./SECURITY.md#export-unity-json).

---

## Dépannage

### `unity_dialogues_path` non configuré

Configurer le chemin via l'UI paramètres ou `PUT /api/v1/config/unity-dialogues-path`. Sans chemin, tout export échoue avec `ValidationException`.

### Export bloqué par validation schéma

1. `POST /dialogues/{id}/validate-schema` ou preview (`GET …/preview-export`) pour lister `errors` / `errors_structured`.
2. Corriger le document (souvent `choiceId` manquant pour `schemaVersion >= 1.1.0`).
3. Graphe : `POST /unity-dialogues/graph/validate-schema` avant `save-and-write`.

### Batch partiellement en échec

`BatchExportResponse` sépare `exported[]` et `failed[]` (par `id` + `errors`). Consulter `GET /exports/logs` pour l'historique détaillé.

### Fichier absent au téléchargement

`GET …/download` et `POST /batch-download` lèvent `404` si le JSON n'existe pas encore sous `unity_dialogues_path` — exporter d'abord ou vérifier le `document_id` (sans extension `.json`).

---

## Références

| Zone | Fichiers |
|------|----------|
| Routes HTTP | `api/routers/dialogues.py`, `api/routers/graph_io.py`, `api/routers/exports.py` |
| Services export | `services/unity_dialogue_export_service.py`, `services/batch_export_service.py`, `services/unity_export_preview_service.py`, `services/unity_dialogue_download_service.py` |
| Validation | `services/unity_export_validation_service.py`, `api/utils/unity_schema_validator.py` |
| Logs | `services/export_log_service.py`, `services/export_log_recorder.py` |
| Schéma JSON | `docs/resources/dialogue-format.schema.json` |
| Pipeline ADR-008 | [pipeline-unity-backend-front-architecture.md](../architecture/pipeline-unity-backend-front-architecture.md) |
| Contrats API | [api-contracts-api.md](../api/api-contracts-api.md#unity-json-export-endpoints-apiv1dialogues) |
