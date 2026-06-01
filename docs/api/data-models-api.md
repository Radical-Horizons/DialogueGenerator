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

### `graph.py`
Graph editor request/response models (Pydantic). Les routes HTTP sont réparties dans `api/routers/graph_*.py` ; ce fichier reste la source OpenAPI des payloads graphe.

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
