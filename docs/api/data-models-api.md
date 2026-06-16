# Data Models - Backend API

## Overview
Backend uses **Pydantic** models for request/response validation and data structures.

## Schema Modules

### `auth.py`
Authentication models:
- `LoginRequest`: Email and password
- `TokenResponse`: Access token and type
- `UserResponse`: User information

### `context.py`
GDD context element models:
- `CharacterResponse`: Character with name and full data
- `LocationResponse`: Location with name and full data
- `ItemResponse`: Item with name and full data
- `SpeciesResponse`: Species with name and full data
- `CommunityResponse`: Community with name and full data
- `CharacterListResponse`: Paginated character list
- `LocationListResponse`: Paginated location list
- `ItemListResponse`: Item list
- `SpeciesListResponse`: Species list
- `CommunityListResponse`: Community list
- `RegionListResponse`: Region list
- `SubLocationListResponse`: Sub-location list
- `LinkedElementsRequest`: Request for linked elements
- `LinkedElementsResponse`: Linked elements response
- `BuildContextRequest`: Context building request
- `BuildContextResponse`: Built context summary

### `dialogue.py`
Dialogue generation models:
- `ContextSelection`: Context element selection with modes (full/excerpt)
- `EstimateTokensRequest`: Token estimation request
- `EstimateTokensResponse`: Token count and raw prompt
- `PreviewPromptRequest`: Prompt preview request
- `PreviewPromptResponse`: Full prompt preview
- `GenerateUnityDialogueRequest`: Unity dialogue generation request
- `GenerateUnityDialogueResponse`: Generated dialogue variants
- `ExportUnityDialogueRequest`: Unity dialogue export request
- `ExportUnityDialogueResponse`: Export result

### `flags.py`
Game mechanics flags models:
- Flag catalog structures
- Flag validation models
- Flag combination models

### `game_systems.py`
Game systems integration models (FR94):
- `GameSystemFamily`: Catalogue family (`attributes_skills`, `effort`, `reputation`)
- `RuntimeSourceStatus`: Runtime connection state (`connected` | `disconnected` | `unknown`)
- `GameSystemsIntegrationCatalogResponse`: Catalogue + runtime source
- `PreviewGameSystemsState`: Simulated preview state (`attributes`, `skills`, `effort_pool`, `reputation_values`, `faction_titles`) with map size limits

### `dialogue_preview.py`
Document preview models:
- `DialoguePreviewRequest`: `revision`, `flag_states`, `reputation_states`, `game_systems_state`
- `DialoguePreviewResponse`: masking aggregates, `simulation_limits`, `visibility_warnings`
- `MaskedChoiceRef`: Stable reference for masked choices

### `visibility_conditions.py` / `choice_effects.py`
Structured conditions and effects (Story 9.2/9.3 + FR94):
- Legacy: `reputation`, `reputation_delta`
- FR94: `reputation_fr94`, `reputation_delta_fr94`, `faction_title`

### Social diagnostics (validation report entries)
Produced by `services/game_systems_social_diagnostics.py` on `PUT /documents/{id}`:
- `social_system_confusion`: Influence/Respect misused as Réputation axes
- `reputation_palier_runtime_only`: RepPalier stored in dialogueFlags

### `graph.py`
Graph editor models:
- Graph structure models
- Node and edge models
- Layout models

### `config.py`
Configuration models:
- System prompt models
- Scene instruction models
- Author profile models
- Context field definition models
- LLM model and pricing models

### `vocabulary.py`
Vocabulary models:
- Vocabulary entry models
- Term search models

### `llm_usage.py`
LLM usage tracking models:
- Usage statistics models
- Usage history models

## Core Models Location

Additional core models in `models/`:
- `models/dialogue_structure/unity_dialogue_node.py`: Unity dialogue node structure
- `models/dialogue_structure/dialogue_elements.py`: Dialogue element structures
- `models/llm_usage.py`: LLM usage tracking
- `models/prompt_structure.py`: Prompt structure models

## Validation

All models use Pydantic v2 with:
- Field validation
- Type coercion
- Optional fields with defaults
- Custom validators where needed
