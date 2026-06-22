# API Contracts - Frontend API Client

## Overview
The frontend uses a centralized API client (`frontend/src/api/client.ts`) that wraps Axios with authentication interceptors and error handling.

## Base Configuration
- **Base URL**: Configured via `VITE_API_BASE_URL` or defaults to proxy in dev (`/api`)
- **Timeout**: 30 seconds (default), 5 minutes for LLM generation
- **Authentication**: JWT tokens via `Authorization: Bearer <token>` header
- **Token Refresh**: Automatic via httpOnly cookie refresh token

## API Client Modules

### `client.ts`
Core Axios instance with:
- Request interceptor: Adds JWT token from localStorage
- Response interceptor: Handles 401 errors and automatic token refresh
- Error handling: Network errors, connection refused, etc.

### `auth.ts`
Authentication API calls:
- `login(email, password)`: User login
- `refreshToken()`: Refresh access token
- `getCurrentUser()`: Get authenticated user info
- `logout()`: User logout

### `context.ts`
Context/GDD data API calls:
- `getCharacters(page?, pageSize?)`: List characters
- `getCharacter(name)`: Get specific character
- `getLocations(page?, pageSize?)`: List locations
- `getLocation(name)`: Get specific location
- `getItems()`: List items
- `getItem(name)`: Get specific item
- `getSpecies()`: List species
- `getSpecies(name)`: Get specific species
- `getCommunities()`: List communities
- `getCommunity(name)`: Get specific community
- `getRegions()`: List regions
- `getSubLocations()`: List sub-locations
- `getLinkedElements(request)`: Get linked elements
- `buildContext(request)`: Build context summary

### `dialogues.ts`
Dialogue generation and Unity export API calls:
- `generateUnityDialogue(request)`: Generate Unity dialogue nodes (5min timeout)
- `estimateTokens(request)`: Estimate token count
- `previewPrompt(request)`: Preview full prompt
- `exportUnityDialogue(request)`: `POST /dialogues/unity/export` — write validated JSON to disk
- `validateDocumentSchema(documentId)`: `POST /dialogues/{id}/validate-schema`
- `batchExportUnityDialogues(request)`: `POST /dialogues/batch-export`
- `previewUnityDialogueExport(documentId)`: `GET /dialogues/{id}/preview-export`
- `batchPreviewUnityDialogues(request)`: `POST /dialogues/batch-preview-export`
- `downloadUnityDialogue(documentId)`: `GET /dialogues/{id}/download`
- `batchDownloadUnityDialogues(request)`: `POST /dialogues/batch-download`

### `exports.ts`
Export audit log (Story 5.6 / FR54):
- `getExportLogs(params?)`: `GET /exports/logs` — filter by date range and status

### `graph.ts`
Graph editor API calls:
- `validateGraph(data)`: Validate graph structure
- `calculateLayout(data)`: Calculate graph layout
- `saveGraphAndWrite(data)`: Save and write Unity JSON (`/graph/save-and-write`)
- `previewGraphExport(data)`: Preview export without disk write (`/graph/preview-export`)
- `saveGraph(data)`: Save graph

### `vocabulary.ts`
Vocabulary API calls:
- `getVocabulary()`: List vocabulary entries
- `getVocabularyTerm(term)`: Get specific term
- `addVocabularyEntry(data)`: Add vocabulary entry

### `flags.ts`
Game mechanics flags API calls:
- `getFlags()`: List available flags
- `validateFlags(request)`: Validate flag requirements
- `checkFlags(request)`: Check flag conditions
- `getFlagCombinations(request)`: Get valid combinations
- `suggestFlags(request)`: Suggest flags based on context

### `gameSystemsIntegration.ts`
Game systems catalogue (FR94):
- `getGameSystemsIntegrationCatalog()`: `GET /api/v1/mechanics/systems/integration`

### `documents.ts`
Canonical document persistence and preview:
- `getDocument(documentId)`: `GET /api/v1/documents/{id}`
- `putDocument(documentId, request)`: `PUT /api/v1/documents/{id}` (includes social diagnostics in validation report)
- `getLayout(documentId)`: `GET /api/v1/documents/{id}/layout`
- `putLayout(documentId, request)`: `PUT /api/v1/documents/{id}/layout`
- `postDocumentPreview(documentId, request)`: `POST /api/v1/documents/{id}/preview` — supports `game_systems_state` and returns `simulation_limits`

Preview state is also mirrored locally in `graphViewStore.previewGameSystemsState` for canvas affordances (skill checks, effort graying).

### `narrativeGuides.ts`
Narrative guides API calls:
- `getNarrativeGuides()`: List guides
- `getNarrativeGuide(id)`: Get specific guide
- `saveNarrativeGuide(data)`: Create/update guide

### `unityDialogues.ts`
Unity dialogue file management:
- `getUnityDialogues()`: List dialogue files
- `getUnityDialogue(filename)`: Get file content
- `saveUnityDialogue(data)`: Create/update file
- `deleteUnityDialogue(filename)`: Delete file

### `documents.ts`
Canonical document API (optimistic locking, Epic 9 preview):
- `getDocument(documentId)`: Load document + `schemaVersion` + `revision`
- `putDocument(documentId, body)`: Persist document (`validationMode`: `draft` \| `export`)
- `getLayout(documentId)`: Load layout sidecar + `revision`
- `putLayout(documentId, body)`: Persist layout sidecar
- `postDocumentPreview(documentId, body)`: Simulate visibility for flag/reputation/game-systems state

Uses `API_TIMEOUTS.DOCUMENT_IO` for I/O-heavy calls. Types: `frontend/src/types/documents.ts`.

### `llmUsage.ts`
LLM usage tracking:
- `getUsageStats(startDate?, endDate?)`: Get usage statistics
- `getUsageHistory(params)`: Get detailed history

### `config.ts`
Configuration API calls:
- `getConfig()`: Get application config
- `updateConfig(data)`: Update config
- `getSystemPrompts()`: Get system prompt templates
- `saveSystemPrompt(data)`: Create/update prompt
- `getSceneInstructions()`: Get scene instruction templates
- `saveSceneInstruction(data)`: Create/update instruction
- `getAuthorProfiles()`: Get author profile templates
- `getLLMModels()`: Get available LLM models
- `getLLMPricing()`: Get pricing information
- `getContextFields()`: Get field definitions
- `getContextField(name)`: Get specific field
- `updateContextField(name, data)`: Update field
- `validateField(request)`: Validate field value
- `validateFields(request)`: Validate multiple fields
- `getFieldSuggestions(fieldName, query?)`: Get suggestions

## Error Handling

All API calls may throw:
- `AxiosError`: Network or HTTP errors
- Automatic retry on 401 with token refresh
- Connection errors logged in dev mode only

## Timeouts

- **Default**: 30 seconds
- **LLM Generation**: 5 minutes (`API_TIMEOUTS.LLM_GENERATION`)
