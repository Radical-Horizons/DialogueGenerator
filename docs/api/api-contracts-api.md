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

**Response:** `UserResponse` including `role` (`admin | writer`) and `is_active`.

### POST `/auth/logout`
Logout and invalidate refresh token.

**Response:** `204 No Content`

---

## Administration Endpoints

All endpoints in this section require an authenticated, active `admin`.
Unauthenticated, inactive, and `writer` callers receive `403`.

### POST `/users`
Create a `writer` account. Returns `201 UserResponse`. User responses never
include `hashed_password`. A duplicate username returns `409`; invalid fields
return `422`.

### GET `/users`
List all accounts as `UserResponse[]`, ordered by username.

### PATCH `/users/{id}`
Update `role` (`admin | writer`) and/or `is_active`. Username and email are not
modifiable. An empty patch or unknown role returns `422`, an unknown account
returns `404`, and a mutation that would leave no active admin is atomically
rejected with `409`.

```json
{
  "role": "admin",
  "is_active": true
}
```

### GET `/admin/app-settings`
List persisted, allowlisted non-secret settings.

### GET `/admin/app-settings/{key}`
Read an allowlisted setting. An absent setting returns `404`.

### PUT `/admin/app-settings/{key}`
Create or replace a boolean setting and record `updated_by`. The only
allowlisted key is `notion_sync_enabled`; secret or unknown keys return `422`.
`updated_by` is nullable only when `DISABLE_AUTH=true` supplies the synthetic
development admin, which has no persisted SQLite user row. Authenticated admins
always persist their user ID.

```json
{
  "value": true
}
```

### DELETE `/admin/app-settings/{key}`
Delete an allowlisted setting. Returns `204`, or `404` if absent.

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

### POST `/dialogues/unity/export`
Write Unity JSON to the configured Unity dialogues directory (validation bloquante avant écriture). Remplace l'ancien chemin documenté `/export/unity-dialogue`.

**Request Body:** `ExportUnityDialogueRequest` — `json_content`, optional `filename`, `title`.

**Response:** `ExportUnityDialogueResponse` — `filename`, `success`.

### POST `/dialogues/batch-export`
Batch export persisted documents to Unity JSON (FR50).

**Request Body:** `BatchExportRequest` — `document_ids[]`.

**Response:** `BatchExportResponse` — `exported[]`, `failed[]`, `cancelled`, `success`.

### GET `/dialogues/{document_id}/preview-export`
Preview export for a persisted document without download (FR53).

**Response:** `ExportPreviewResponse` — `json_content`, `size_bytes`, `node_count`, `filename`, `schema_valid`, `errors[]`.

### POST `/dialogues/batch-preview-export`
Batch preview for library selection (FR53).

**Request Body:** `BatchExportPreviewRequest` — `document_ids[]`.

**Response:** `BatchExportPreviewResponse`.

### GET `/dialogues/{document_id}/download`
Download exported Unity JSON file (FR52). `Content-Disposition: attachment`.

### POST `/dialogues/batch-download`
Download multiple exports as ZIP.

**Request Body:** `BatchDownloadRequest`.

---

## Export logs (`/api/v1/exports`)

### GET `/exports/logs`
List Unity export logs (FR54). JWT required.

**Query:** `start_date`, `end_date` (default last 30 days), `status` (`success` \| `failure`).

**Response:** `ExportLogsResponse` — `entries[]`, `total_count`, `success_count`, `failure_count`.

Storage: `data/logs/exports/YYYY-MM-DD.json` via `ExportLogService`.

---

## Graph Editor Endpoints (`/api/v1/unity-dialogues/graph`)

Tous les routes ci-dessous exigent un **JWT** (`Authorization: Bearer …`), comme les autres routes graphe (`Depends(get_current_user)` dans `api/main.py`). Les schémas détaillés sont dans `api/schemas/graph.py`.

### Persistance et I/O

| Méthode | Chemin | Rôle |
|--------|--------|------|
| `POST` | `/unity-dialogues/graph/load` | Charger un graphe depuis le stockage |
| `POST` | `/unity-dialogues/graph/save` | Sauvegarder le graphe |
| `POST` | `/unity-dialogues/graph/save-and-write` | Sauvegarde + écriture disque (flux principal client) |
| `POST` | `/unity-dialogues/graph/preview-export` | Preview export graphe sans écriture (FR53) |

### Validation et flux

| Méthode | Chemin | Rôle |
|--------|--------|------|
| `POST` | `/unity-dialogues/graph/validate` | Structure (orphelins, références, cycles) |
| `POST` | `/unity-dialogues/graph/validate-schema` | Conformité schéma JSON Unity (FR48) |
| `POST` | `/unity-dialogues/graph/validate-lore-explicit` | Contradictions lore explicites (texte vs GDD) |
| `POST` | `/unity-dialogues/graph/simulate-flow` | Simulation de parcours / couverture |
| `POST` | `/unity-dialogues/graph/calculate-layout` | Recalcul de layout côté serveur |

### Qualité graphe (heuristiques + LLM)

| Méthode | Chemin | Rôle |
|--------|--------|------|
| `POST` | `/unity-dialogues/graph/detect-ai-slop` | Détection motifs « AI slop » (FR43) |
| `POST` | `/unity-dialogues/graph/detect-context-dropping` | Détection context dropping vs contexte GDD (FR44) ; fusionne options requête + règles persistées (`ContextDroppingRulesService`) |
| `POST` | `/unity-dialogues/graph/evaluate-dialogue-quality` | Juge qualité narrative via LLM (FR42) |

### Coût et génération

| Méthode | Chemin | Rôle |
|--------|--------|------|
| `POST` | `/unity-dialogues/graph/estimate-cost` | Estimation coût/tokens |
| `POST` | `/unity-dialogues/graph/generate-node` | Génération de nœud |

### Historique nœud / prompts

| Méthode | Chemin | Rôle |
|--------|--------|------|
| `GET` | `/unity-dialogues/graph/prompt` | Récupération prompt associé au nœud (paramètres query selon schéma) |
| `POST` | `/unity-dialogues/graph/nodes/{node_id}/accept` | Accepter proposition générée |
| `POST` | `/unity-dialogues/graph/nodes/{node_id}/reject` | Rejeter |
| `POST` | `/unity-dialogues/graph/nodes/{node_id}/regenerate` | Régénérer |

**Schémas** : corps et réponses typés dans `api/schemas/graph.py` (ex. `DetectContextDroppingRequest` / `DetectContextDroppingResponse` avec `kind` : `context_dropping` \| `too_subtle` \| `mandatory_missing`).

---

## Validation rules — context dropping (`/api/v1/validation/rules`)

Persistance des **règles** utilisées par défaut lors d’un `POST .../detect-context-dropping` (priorité : champs fournis dans la requête > fichier persisté > défauts). Implémentation : `services/context_dropping_rules_service.py` → fichier `data/validation-rules/context-dropping.json` (UTF-8, créé au besoin).

| Méthode | Chemin | Rôle |
|--------|--------|------|
| `GET` | `/validation/rules/context-dropping` | Lire les règles (défauts si fichier absent). JSON corrompu → `422` avec message explicite |
| `PUT` | `/validation/rules/context-dropping` | Remplacer les règles (`ContextDroppingRulesSchema` dans `api/schemas/validation_rules.py`) |

**Corps `PUT` (champs principaux)** : `rules_profile` (`strict` \| `light`), `tolerance` optionnelle `[0,1]`, `mandatory_info` (liste de labels obligatoires dans le graphe), `dialogue_type_overrides`, `schema_version`.

**Auth** : JWT requis (`api/main.py`, router `validation_rules`).

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

## Mechanics Systems Integration (`/api/v1/mechanics/systems`)

### GET `/mechanics/systems/integration`
Catalogue des familles de systèmes de jeu utilisables dans les dialogues (FR94).

**Response:** `GameSystemsIntegrationCatalogResponse`

```json
{
  "families": [
    {
      "id": "attributes_skills",
      "label": "Caractéristiques & Compétences",
      "description": "Tests tentables : caractéristique + compétence + modificateurs vs DD."
    },
    {
      "id": "effort",
      "label": "Gestion de l'Effort",
      "description": "Pool preview par défaut 10 PE, coûts d'Effort et choix grisés si insuffisant."
    },
    {
      "id": "reputation",
      "label": "Réputation",
      "description": "Admiration, Prestige et Crainte avec cible sociale et paliers calculés."
    }
  ],
  "runtime_source": {
    "status": "disconnected",
    "label": "Source runtime externe (Unity/API/fichier config)",
    "editing_blocked": false,
    "message": "Source runtime externe non connectée : édition locale disponible via preview simulée."
  }
}
```

**Comportement actuel :** en local, `runtime_source.status` reste `disconnected` ; `editing_blocked` est `false`. Voir `services/game_systems_integration_service.py`.

**Reste à faire :** connexion runtime live (Unity/API) non implémentée.

---

## Documents Endpoints (`/api/v1/documents`)

Persistance des dialogues canoniques (blob JSON source de vérité + révision
`.meta`, layout sidecar et index propriétaire SQLite). Toutes les lectures et
mutations exigent le propriétaire ou un administrateur. Un fichier historique
non indexé reste administrable mais n'est jamais attribué implicitement.
`DISABLE_AUTH=true` conserve le bypass administrateur local.

### GET `/documents/check-migration`
Vérifie les documents nécessitant une migration de schéma.

**Response:** `CheckMigrationResponse` (liste de documents à migrer).

### GET `/documents/{document_id}`
Charge le document JSON persisté et sa révision.

**Response:** `DocumentGetResponse` — `document`, `revision`, `capabilities`
(`can_read`, `can_edit`, `can_delete`, `is_owner`).

### PUT `/documents/{document_id}`
Met à jour le document avec contrôle de révision optimiste (409 si conflit).

**Request Body:** `PutDocumentRequest` — `revision`, `document`, `createOnly?`.

**Response:** `PutDocumentResponse` — inclut `validationReport` (schéma Unity, flags, effets, **diagnostics sociaux FR94**).

Une création (`revision: 1`, fichier absent) attribue le dialogue à l'utilisateur
courant. `createOnly: true` réserve atomiquement le nom et retourne `409` avec
l'état canonique si le fichier existe, y compris à révision 1. Codes d'erreur :
`403` hors propriétaire/admin, `409` en conflit de
révision, `400/422` en validation ; aucun de ces statuts ne déclenche de voie
d'écriture legacy.

Codes diagnostic sociaux possibles dans `validationReport` :

| Code | Condition |
|------|-----------|
| `social_system_confusion` | `Influence` ou `Respect` utilisés comme axe de Réputation |
| `reputation_palier_runtime_only` | `RepPalier*` stocké dans `dialogueFlags` |

### DELETE `/documents/{document_id}`
Supprime le document et ses fichiers associés (`.meta`, layout).

**Response:** `204 No Content`

### GET `/documents/{document_id}/layout`
Charge le layout graphe (sidecar, révision `.layout.meta`).

**Response:** `LayoutGetResponse`

### PUT `/documents/{document_id}/layout`
Persiste le layout avec contrôle de révision.

**Request Body:** `PutLayoutRequest` — `revision`, `layout`.

**Response:** `PutLayoutResponse`

### POST `/documents/{document_id}/preview`
Preview scénario avec état simulé (flags, réputation legacy, stats FR94).

**Request Body:** `DialoguePreviewRequest`

```json
{
  "revision": 3,
  "flag_states": {},
  "reputation_states": {},
  "game_systems_state": {
    "attributes": { "sociabilite": 4 },
    "skills": { "tromperie": 3 },
    "effort_pool": 10,
    "reputation_values": {
      "fr94::HEROINE_A::community::garde::Admiration::community_calculated": 35
    },
    "faction_titles": { "garde": "garde_capitaine" }
  }
}
```

**Response:** `DialoguePreviewResponse` — agrégats de masquage (`nodes_masked`, `choices_masked`, listes d'IDs), écho `game_systems_state`, `simulation_limits`, `visibility_warnings`.

Exemple `simulation_limits` (agrégat communautaire) :

```json
[
  "Agrégat communautaire simulé localement : témoins, propagation et poids PNJ restent responsabilité runtime."
]
```

### POST `/documents/{document_id}/validate-flag-references`
Validation FR93 des références de flags (`visibilityConditions`, `choiceEffects`) vs `dialogueFlags` déclarés.

**Request Body (optionnel):** `{ "document": { ... } }` — sinon lecture du fichier persisté.

**Response:** `ValidateFlagReferencesResponse` — `valid`, `summary`, `errors`, `warnings` (types `dialogue_flag_undeclared`, `dialogue_flag_unused`).

La même analyse est fusionnée dans `POST /api/v1/unity-dialogues/graph/validate` lorsque le client envoie `document`.

**Guide utilisateur :** [`docs/guides/game-systems-integration.md`](../guides/game-systems-integration.md)

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

**Response:** `GddNotionPreviewDatabaseResponse` — première ligne mappée comme en sync (debug / UI).

### POST `/gdd-notion-sync/sync`

**Query Parameters:**

- `full` (bool, default `false`) — sync complète (archive, staging, miroir).
- `mirror_rebuild` (bool) — **déprécié, sans effet**.
- `resume` (bool) — reprendre une sync complète (`full=true` obligatoire ; mutuellement exclusif avec `fresh`).
- `fresh` (bool) — abandon checkpoint + nouveau run complet (`full=true` obligatoire).

**Response:** `GddNotionSyncRunResponse` (`success`, `message`, `updated_entities`, `partial_errors`).

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

## Document Endpoints (`/api/v1/documents`)

Canonical Unity dialogue documents with optimistic locking (`revision` in sidecar `.meta` files). Layout sidecars live under `Assets/Layouts/` (separate from dialogue JSON in `Assets/Dialogue/`). An SQLite index records ownership without replacing the Unity JSON source of truth. Reads and mutations require the owner or an administrator; historical unindexed files remain admin-only and are never claimed implicitly. `DISABLE_AUTH=true` keeps the local administrator bypass. Implementation: `api/routers/documents.py`, `services/document_persistence_service.py`, client `frontend/src/api/documents.ts`.

### GET `/documents/check-migration`

Lists v1.1.0 documents missing `choiceId` on at least one choice (CI / pre-commit gate).

**Response:** `CheckMigrationResponse` — `{ "needsMigration": [{ "documentId", "path" }] }`

### GET `/documents/{document_id}`

Load persisted document with `schemaVersion` and `revision`.

**Response:** `DocumentGetResponse` — `{ document, schemaVersion, revision, capabilities }`, where `capabilities` contains `can_read`, `can_edit`, `can_delete`, and `is_owner`.

**Errors:** `403` if the caller is neither owner nor administrator; `404` if missing; `400` (`missing_choice_id`) if v1.1.0 document has choices without `choiceId` (except legacy list format normalized on read).

### PUT `/documents/{document_id}`

Validate and persist document. Optimistic locking via `revision` in body.

**Request Body:** `PutDocumentRequest` — `{ document, revision, validationMode?, createOnly? }` where `validationMode` is `draft` (default, non-blocking validation) or `export` (blocking). `createOnly: true` atomically rejects an existing ID, including an owner-owned revision-1 document.

**Headers (optional):** `X-Validation-Mode` overrides body `validationMode`.

**Response:** `PutDocumentResponse` — `{ revision, validationReport, flagThresholdWarnings? }`

**Errors:** `403` if the caller cannot edit; `409` with current `DocumentGetResponse` if revision stale; `400` (`GRAPH_PAYLOAD_NOT_ACCEPTED`) or `422` on validation failure. Client errors are terminal: clients must not retry through a legacy persistence route.

### DELETE `/documents/{document_id}`

Delete document, layout, revision/sequence sidecars, and ownership index entry atomically from the caller's perspective.

**Response:** `204 No Content`

**Errors:** `403` if the caller cannot delete; `404` if missing.

### GET `/documents/{document_id}/layout`

Load graph layout sidecar (positions, viewport).

**Response:** `LayoutGetResponse` — `{ layout, revision }`

**Errors:** `403` if the caller cannot read; `404` if document or layout missing.

### PUT `/documents/{document_id}/layout`

Persist layout with optimistic locking.

**Request Body:** `PutLayoutRequest` — `{ layout, revision }`

**Response:** `PutLayoutResponse` — `{ revision }`

**Errors:** `403` if the caller cannot edit; `409` with current `LayoutGetResponse` if revision stale.

### POST `/documents/{document_id}/preview`

Evaluate node/choice visibility for a simulated game state (Epic 9 — stories 9.4 / 9.6, FR92 / FR94). Reads the **persisted** document from disk (not an inline body).

**Request Body:** `DialoguePreviewRequest`

```json
{
  "revision": 3,
  "flag_states": { "quest_started": true },
  "reputation_states": { "faction_a": 0.5 },
  "game_systems_state": {
    "attributes": {},
    "skills": {},
    "effort_pool": 10,
    "reputation_values": {},
    "faction_titles": {}
  }
}
```

| Field | Role |
|-------|------|
| `revision` | Optional optimistic check; must match stored revision or `409 revision_stale` |
| `flag_states` | Simulated dialogue flags (max **512** keys) |
| `reputation_states` | Simulated reputation values (max **256** keys) |
| `game_systems_state` | FR94 stats overlay — attributes (64), skills (128), reputation_values (256), faction_titles (64) |

Oversized maps return `422` validation error at parse time (`services/dialogue_preview_limits.py`).

**Response:** `DialoguePreviewResponse`

```json
{
  "revision": 3,
  "nodes_total": 12,
  "nodes_masked": 2,
  "choices_total": 8,
  "choices_masked": 1,
  "masked_node_ids": ["node_3"],
  "masked_choice_refs": [{ "node_id": "node_1", "choice_id": "c2" }],
  "game_systems_state": { "...": "echo of request" },
  "simulation_limits": ["Agrégat communautaire simulé localement : ..."],
  "visibility_warnings": ["nodes[n1].visibilityConditions: ..."]
}
```

| Field | Role |
|-------|------|
| `masked_*` | Nodes/choices hidden by unsatisfied visibility conditions |
| `simulation_limits` | Non-blocking FR94 caveats (e.g. community aggregate keys) |
| `visibility_warnings` | Invalid visibility DSL treated as always visible in preview |

**Errors:** `404` document missing; `409` if `revision` in body ≠ stored revision.

### POST `/documents/{document_id}/validate-flag-references`

Validate flag references against `dialogueFlags` (Epic 9 — story 9.5, FR93).

**Request Body (optional):** `ValidateFlagReferencesRequest` — `{ document? }`. If `document` omitted, reads from storage. Inline `document.nodes` capped at **5000** nodes.

**Response:** `ValidateFlagReferencesResponse` — `{ valid, summary, used_flag_count, errors[], warnings[] }`

---

## Game Systems Integration (`/api/v1/mechanics/systems`)

### GET `/mechanics/systems/integration`

Catalog of game-system families (attributes/skills, effort, reputation) and runtime connection status for the FR94 integration panel.

**Response:** `GameSystemsIntegrationCatalogResponse` — `{ families[], runtime_source }`

Implementation: `api/routers/mechanics_systems.py`, `services/game_systems_integration_service.py`.

---

## Unity Dialogues Endpoints (`/api/v1/unity-dialogues`)

### GET `/unity-dialogues`
Liste uniquement les dialogues lisibles par l'utilisateur courant. Chaque item
expose les capacités serveur ; les chemins historiques sont visibles aux admins.

**Response:** Dialogue file list

### GET `/unity-dialogues/{filename}`
Façade de lecture compatible, protégée par la même autorité owner/admin.

**Response:** Dialogue file content

### DELETE `/unity-dialogues/{filename}`
Façade de suppression compatible déléguée au service canonique (document,
révisions, layout, séquence et index).

**Response:** `204 No Content`

Les anciennes écritures sans révision (`graph/save-and-write`, export et
expansion persistée) peuvent créer un nouveau document indexé mais répondent
`409 canonical_revision_required` si le fichier existe déjà. Toute mise à jour
passe par `PUT /documents/{document_id}`. Un `seq` déjà reconnu retourne
`409 SEQUENCE_CONFLICT` avec `ack_seq` et `last_seq` dans `error.details`; aucun
payload rejeté n'est annoncé comme sauvegardé.

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
| POST | `/preview-export` | Preview graph export without disk write (FR53) |

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
| POST | `/detect-ai-slop` | GPT-isms, repetitions, generic phrases (`AISlopDetector`) |
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
