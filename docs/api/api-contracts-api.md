# API Contracts - Backend API

## Base URL
- Development: `http://localhost:4243/api/v1`
- Production: `http://localhost:4242/api/v1` (or configured via `VITE_API_BASE_URL`)

## Authentication
All endpoints (except `/auth/login`) require JWT authentication via `Authorization: Bearer <token>` header.

---

## Authentication Endpoints (`/api/v1/auth`)

### POST `/auth/login`
Login and obtain access token.

**Request Body:**
```json
{
  "email": "string",
  "password": "string"
}
```

**Response:** `TokenResponse`
```json
{
  "access_token": "string",
  "token_type": "bearer"
}
```

### POST `/auth/refresh`
Refresh access token using refresh token from httpOnly cookie.

**Response:** `TokenResponse`

### GET `/auth/me`
Get current authenticated user information.

**Response:** `UserResponse`

### POST `/auth/logout`
Logout and invalidate refresh token.

**Response:** `204 No Content`

---

## Context Endpoints (`/api/v1/context`)

### GET `/context/characters`
List all available characters with optional pagination.

**Query Parameters:**
- `page` (optional): Page number (1-indexed)
- `page_size` (optional): Page size (default: 50)

**Response:** `CharacterListResponse`

### GET `/context/characters/{name}`
Get a specific character by name.

**Response:** `CharacterResponse`

### GET `/context/locations`
List all available locations with optional pagination.

**Response:** `LocationListResponse`

### GET `/context/locations/{name}`
Get a specific location by name.

**Response:** `LocationResponse`

### GET `/context/items`
List all available items.

**Response:** `ItemListResponse`

### GET `/context/items/{name}`
Get a specific item by name.

**Response:** `ItemResponse`

### GET `/context/species`
List all available species.

**Response:** `SpeciesListResponse`

### GET `/context/species/{name}`
Get a specific species by name.

**Response:** `SpeciesResponse`

### GET `/context/communities`
List all available communities.

**Response:** `CommunityListResponse`

### GET `/context/communities/{name}`
Get a specific community by name.

**Response:** `CommunityResponse`

### GET `/context/regions`
List all available regions.

**Response:** `RegionListResponse`

### GET `/context/sublocations`
List all sub-locations.

**Response:** `SubLocationListResponse`

### POST `/context/linked-elements`
Get linked elements for selected context items.

**Request Body:** `LinkedElementsRequest`

**Response:** `LinkedElementsResponse`

### POST `/context/build`
Build context summary from selected elements.

**Request Body:** `BuildContextRequest`

**Response:** `BuildContextResponse`

---

## Dialogue Generation Endpoints (`/api/v1/dialogues`)

### POST `/dialogues/estimate-tokens`
Estimate token count for a prompt without generating dialogue.

**Request Body:** `EstimateTokensRequest`
```json
{
  "context_selection": {
    "characters_full": ["string"],
    "characters_excerpt": ["string"],
    "locations_full": ["string"],
    "locations_excerpt": ["string"],
    "items_full": ["string"],
    "items_excerpt": ["string"],
    "species_full": ["string"],
    "species_excerpt": ["string"],
    "communities_full": ["string"],
    "communities_excerpt": ["string"],
    "dialogues_examples": ["string"],
    "scene_protagonists": {},
    "scene_location": {},
    "generation_settings": {}
  },
  "user_instruction": "string",
  "system_prompt_override": "string (optional)",
  "model_name": "string (optional)"
}
```

**Response:** `EstimateTokensResponse`
```json
{
  "estimated_tokens": 0,
  "raw_prompt": "string",
  "prompt_sections": {}
}
```

### POST `/dialogues/preview-prompt`
Preview the full prompt that would be sent to LLM.

**Request Body:** `PreviewPromptRequest`

**Response:** `PreviewPromptResponse`

### POST `/dialogues/generate/unity-dialogue`
Generate Unity dialogue nodes using LLM.

**Request Body:** `GenerateUnityDialogueRequest`
```json
{
  "context_selection": {},
  "user_instruction": "string",
  "system_prompt_override": "string (optional)",
  "model_name": "string (optional)",
  "temperature": 0.0,
  "max_tokens": 0,
  "variants_count": 1
}
```

**Response:** `GenerateUnityDialogueResponse`
```json
{
  "variants": [
    {
      "nodes": [],
      "reasoning_trace": "string (optional)"
    }
  ],
  "usage": {
    "prompt_tokens": 0,
    "completion_tokens": 0,
    "total_tokens": 0
  }
}
```

### POST `/dialogues/export/unity-dialogue`
Export Unity dialogue to YARN file format.

**Request Body:** `ExportUnityDialogueRequest`

**Response:** `ExportUnityDialogueResponse`

---

## Graph Editor Endpoints (`/api/v1/graph`)

### POST `/graph/validate`
Validate graph structure.

**Request Body:** Graph validation request

**Response:** Validation result

### POST `/graph/layout`
Calculate graph layout.

**Request Body:** Graph layout request

**Response:** Layout data

### POST `/graph/export`
Export graph to various formats.

**Request Body:** Export request

**Response:** Export data

### POST `/graph/import`
Import graph from format.

**Request Body:** Import request

**Response:** Imported graph data

### POST `/graph/save`
Save graph to storage.

**Request Body:** Graph save request

**Response:** Save confirmation

---

## Narrative Guides Endpoints (`/api/v1/narrative-guides`)

### GET `/narrative-guides`
List all narrative guides.

**Response:** List of narrative guides

### GET `/narrative-guides/{id}`
Get a specific narrative guide.

**Response:** Narrative guide data

### POST `/narrative-guides`
Create or update narrative guide.

**Request Body:** Narrative guide data

**Response:** Created/updated guide

---

## Vocabulary Endpoints (`/api/v1/vocabulary`)

### GET `/vocabulary`
List vocabulary entries.

**Response:** Vocabulary list

### POST `/vocabulary`
Add vocabulary entry.

**Request Body:** Vocabulary entry data

**Response:** Created entry

### GET `/vocabulary/{term}`
Get specific vocabulary term.

**Response:** Vocabulary term data

---

## Mechanics Flags Endpoints (`/api/v1/mechanics/flags`)

### GET `/mechanics/flags`
List all available game flags.

**Response:** Flag catalog

### POST `/mechanics/flags/validate`
Validate flag requirements.

**Request Body:** Flag validation request

**Response:** Validation result

### POST `/mechanics/flags/check`
Check flag conditions.

**Request Body:** Flag check request

**Response:** Check result

### POST `/mechanics/flags/combinations`
Get valid flag combinations.

**Request Body:** Combination request

**Response:** Valid combinations

### POST `/mechanics/flags/suggest`
Suggest flags based on context.

**Request Body:** Suggestion request

**Response:** Suggested flags

---

## Configuration Endpoints (`/api/v1/config`)

### GET `/config`
Get application configuration.

**Response:** Configuration object

### PUT `/config`
Update application configuration.

**Request Body:** Configuration updates

**Response:** Updated configuration

### GET `/config/fields`
Get available context fields.

**Response:** Field definitions

### GET `/config/system-prompts`
Get system prompt templates.

**Response:** System prompt list

### POST `/config/system-prompts`
Create or update system prompt.

**Request Body:** System prompt data

**Response:** Created/updated prompt

### GET `/config/scene-instructions`
Get scene instruction templates.

**Response:** Scene instruction list

### POST `/config/scene-instructions`
Create or update scene instruction.

**Request Body:** Scene instruction data

**Response:** Created/updated instruction

### GET `/config/author-profiles`
Get author profile templates.

**Response:** Author profile list

### GET `/config/llm-models`
Get available LLM models.

**Response:** LLM model list

### GET `/config/llm-pricing`
Get LLM pricing information.

**Response:** Pricing data

### GET `/config/context-fields`
Get context field definitions.

**Response:** Context field list

### GET `/config/context-fields/{field_name}`
Get specific context field definition.

**Response:** Field definition

### PUT `/config/context-fields/{field_name}`
Update context field definition.

**Request Body:** Field updates

**Response:** Updated field

### GET `/config/validation`
Get validation configuration.

**Response:** Validation config

### POST `/config/validate-field`
Validate a specific field value.

**Request Body:** Field validation request

**Response:** Validation result

### POST `/config/validate-fields`
Validate multiple field values.

**Request Body:** Fields validation request

**Response:** Validation results

### GET `/config/field-suggestions`
Get field value suggestions.

**Query Parameters:**
- `field_name`: Field to get suggestions for
- `query`: Search query (optional)

**Response:** Field suggestions

---

## GDD Notion Sync Endpoints

All routes require JWT (`Authorization: Bearer <token>`). Schémas : `api/schemas/gdd_notion_sync.py`.

### GET `/gdd-notion-sync/config`

**Response:** `GddNotionSyncConfigResponse` — `config` (sources, `included_categories`, `sync_interval_minutes`, `auto_sync_enabled`, `archive_retention_count`, `token_configured`, etc.) ; **aucun secret** dans le corps.

### PUT `/gdd-notion-sync/config`

**Request Body:** `GddNotionSyncConfigUpdate` — champs optionnels ; `notion_token` si fourni remplace le fichier token (jamais renvoyé).

**Response:** même forme que GET.

### POST `/gdd-notion-sync/test-connection`

**Response:** `GddNotionConnectionTestResponse` (`ok`, `message`, métadonnées bot optionnelles).

### POST `/gdd-notion-sync/preview-database-row`

**Request Body:** `GddNotionPreviewDatabaseRequest` — `{ "category_file": "..." }` (doit correspondre à une source `database`).

**Response:** `GddNotionPreviewDatabaseResponse` — première ligne mappée comme en sync (debug / UI). Champs utiles au diagnostic Notion multi-vues : `data_sources_count`, `data_source_entries` (`{ id, name }`), `query_total_rows`, `property_keys_from_query_row`, `property_keys_from_get_page`, `compact_table`.

### POST `/gdd-notion-sync/sync`

**Query Parameters:**

- `full` (bool, default `false`) — sync complète (archive, staging, miroir).
- `mirror_rebuild` (bool) — **déprécié, sans effet**.
- `resume` (bool) — reprendre une sync complète (`full=true` obligatoire ; mutuellement exclusif avec `fresh`).
- `fresh` (bool) — abandon checkpoint + nouveau run complet (`full=true` obligatoire).
- `apply_staging_despite_errors` (bool, default `false`) — avec `full=true` seulement ; promeut le staging malgré `partial_errors` quand `mirror_promotion_pending` est true. **Incompatible** avec `resume` et `fresh`.

**Response:** `GddNotionSyncRunResponse` (`success`, `message`, `updated_entities`, `partial_errors`, `mirror_promotion_pending`).

### GET `/gdd-notion-sync/full-sync-checkpoint`

**Response:** `GddFullSyncCheckpointResponse` — reprise possible, staging orphelin, fichiers terminés, etc.

### DELETE `/gdd-notion-sync/full-sync-checkpoint`

**Response:** `GddFullSyncCheckpointAbandonResponse` — supprime checkpoint et `.staging/` associé.

### POST `/gdd-notion-sync/full-sync/pause` | `/unpause` | `/cancel`

**Response:** `GddFullSyncPauseResponse` (`ok`, `message`).

### GET `/gdd-notion-sync/status`

**Response:** `GddNotionSyncStatusResponse` — dernier run persisté.

### GET `/gdd-notion-sync/sync-progress`

**Response:** `GddNotionSyncProgressResponse` — polling progression (phase, pages, source courante, `paused`).

### GET `/gdd-notion-sync/notebooklm-export`

**Query Parameters:** `max_files` (int, 1–128, default 64) — nombre max de fichiers Markdown dans le ZIP (README + thèmes et suites `-partNN`).

**Response:** `application/zip` ; en-tête `Content-Disposition: attachment; filename="gdd-notebooklm-export.zip"`. Erreurs : `400` si validation métier (`ValueError`), `500` si lecture disque (`OSError`).

### GET `/gdd-notion-sync/archives`

**Query Parameters:** `limit` (1–100, default 20).

**Response:** `GddArchivesListResponse` — liste de `GddArchiveEntrySchema`.

### POST `/gdd-notion-sync/archives/{archive_id}/restore`

**Request Body (optional):** `GddArchiveRestoreRequest` — `{ "backup_current": true }` par défaut si corps absent.

**Response:** `GddArchiveRestoreResponse` (`ok`, `message`, `new_backup_id` optionnel).

**Guide détaillé (chemins disque, comportement full/resume, NotebookLM) :** [GDD Notion Sync](../guides/GDD_NOTION_SYNC.md).

---

## Unity Dialogues Endpoints (`/api/v1/unity-dialogues`)

### GET `/unity-dialogues`
List all Unity dialogue files.

**Response:** Dialogue file list

### GET `/unity-dialogues/{filename}`
Get specific Unity dialogue file content.

**Response:** Dialogue file content

### DELETE `/unity-dialogues/{filename}`
Delete Unity dialogue file.

**Response:** `204 No Content`

### POST `/unity-dialogues`
Create or update Unity dialogue file.

**Request Body:** Dialogue file data

**Response:** Created/updated file info

---

## Validation rules — context dropping (`/api/v1/validation/rules`)

JWT required (same as other protected routes). Rules are persisted on disk as UTF-8 JSON at `data/validation-rules/context-dropping.json` (see `ContextDroppingRulesService`, `constants.FilePaths.CONTEXT_DROPPING_RULES_FILE`).

### GET `/validation/rules/context-dropping`

**Response:** `ContextDroppingRulesSchema` — `rules_profile` (`strict` \| `light`), optional `tolerance` \[0, 1\], `mandatory_info` (labels), `dialogue_type_overrides`, `schema_version`.

**Errors:** `422` if the on-disk file exists but is not valid JSON or fails schema validation (explicit `detail` message).

### PUT `/validation/rules/context-dropping`

**Request Body:** `ContextDroppingRulesSchema` (replaces the entire persisted document).

**Response:** Saved rules (echo).

**Errors:** `422` on validation failure or write error (`ValueError` / `OSError`).

**Usage:** `POST .../unity-dialogues/graph/detect-context-dropping` merges **request `options`** with these persisted values when a field is omitted — priority: non-null request field **>** persisted **>** defaults (`rules_profile` default `strict`, etc.). Implementation: `api/routers/graph_quality.py` (`_context_dropping_options_to_data`).

---

## Graph editor API (`/api/v1/unity-dialogues/graph`)

All routes below require **JWT** (`Depends(get_current_user)` in `api/main.py`). They're split across `api/routers/graph_io.py`, `graph_generation.py`, `graph_cost.py`, `graph_validation.py`, `graph_quality.py`, `graph_flow.py`, `graph_node_history.py`.

**Typical client:** `frontend/src/api/graph.ts` (timeouts vary per call).

### I/O

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/load` | Load graph into editor session |
| POST | `/save` | Save graph |
| POST | `/save-and-write` | Save and write Unity file |

### Generation & cost

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/generate-node` | Generate a new node (LLM) |
| POST | `/estimate-cost` | Cost estimate for generation |

### Structural & schema validation

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/validate` | Orphans, broken refs, cycles (`GraphValidationService.validate_graph`) |
| POST | `/validate-schema` | Unity JSON schema conformance (`validate_unity_json` on serialized graph). **Empty `nodes` list → `is_valid: true`** (no-op). |
| POST | `/validate-lore-explicit` | Explicit lore vs GDD facts (`ContextBuilder` + `validate_explicit_lore_contradictions`) |

### Flow & layout

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/simulate-flow` | Dead ends, cul-de-sacs, **coverage** stats (`GraphValidationService.simulate_flow` + `compute_coverage_stats`) |
| POST | `/calculate-layout` | Auto-layout (`GraphConversionService.calculate_layout`) |

### Quality (static + LLM)

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/detect-ai-slop` | GPT-isms, repetitions, generic phrases (`AISlopDetector`). Regex personnalisées : max **32** motifs, **512** caractères chacun ; motifs à quantificateurs imbriqués typiques ReDoS refusés (`MAX_CUSTOM_REGEX_*` dans `services/ai_slop_detector.py`). |
| POST | `/detect-context-dropping` | GDD context usage vs selections (`ContextDroppingDetector`; rules from request + persisted GET `/validation/rules/context-dropping`) |
| POST | `/evaluate-dialogue-quality` | LLM judge (`LLMQualityJudgeService`; requires working LLM provider) |

### Node lifecycle (generated nodes)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/prompt` | Prompt payload for node generation context |
| POST | `/nodes/{node_id}/accept` | Accept pending generated node |
| POST | `/nodes/{node_id}/reject` | Reject / remove |
| POST | `/nodes/{node_id}/regenerate` | Regenerate node |

**OpenAPI:** `/api/docs` and `/api/redoc` list full request/response models (`api/schemas/graph.py`, `api/schemas/dialogue_quality.py`).

---

## LLM Usage Endpoints (`/api/v1/llm-usage`)

### GET `/llm-usage`
Get LLM usage statistics.

**Query Parameters:**
- `start_date` (optional): Start date filter
- `end_date` (optional): End date filter

**Response:** Usage statistics

### GET `/llm-usage/history`
Get detailed usage history.

**Query Parameters:**
- Pagination parameters

**Response:** Usage history with pagination

---

## Logs Endpoints (`/api/v1/logs`)

### GET `/logs`
Search application logs.

**Query Parameters:**
- Search and filter parameters

**Response:** `LogSearchResponse`

### GET `/logs/stats`
Get log statistics.

**Response:** `LogStatisticsResponse`

### GET `/logs/files`
List available log files.

**Response:** List of `LogFileInfo`

### POST `/logs/frontend`
Receive frontend log entries.

**Request Body:** Frontend log data

**Response:** `204 No Content`

---

## Error Responses

All endpoints may return standard error responses:

**400 Bad Request:**
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Validation failed",
    "details": {}
  }
}
```

**401 Unauthorized:**
```json
{
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Authentication required"
  }
}
```

**404 Not Found:**
```json
{
  "error": {
    "code": "NOT_FOUND",
    "message": "Resource not found",
    "details": {}
  }
}
```

**500 Internal Server Error:**
```json
{
  "error": {
    "code": "INTERNAL_ERROR",
    "message": "Internal server error",
    "request_id": "string"
  }
}
```
