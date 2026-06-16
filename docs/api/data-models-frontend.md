# Data Models - Frontend

## Overview
Frontend uses **TypeScript** interfaces and types for type safety.

## Type Definitions Location
- `frontend/src/types/api.ts`: API request/response types
- `frontend/src/types/prompt.ts`: Prompt structure types
- `frontend/src/types/generation.ts`: Generation types
- `frontend/src/types/graph.ts`: Graph editor types
- `frontend/src/types/flags.ts`: Game flags types
- `frontend/src/types/gameSystemsIntegration.ts`: FR94 catalogue types
- `frontend/src/types/visibilityConditions.ts`: Visibility conditions (incl. `reputation_fr94`, `faction_title`)
- `frontend/src/types/choiceEffects.ts`: Choice effects (incl. `reputation_delta_fr94`)
- `frontend/src/types/documents.ts`: Document API types (`PreviewGameSystemsState`, preview request/response)
- `frontend/src/types/errors.ts`: Error types

## Core Types

### Authentication (`api.ts`)
- `LoginRequest`: Email and password
- `TokenResponse`: Access token response
- `UserResponse`: User information

### Context Selection (`api.ts`)
- `ElementMode`: 'full' | 'excerpt'
- `ContextSelection`: Context element selection with mode separation
  - `characters_full`, `characters_excerpt`
  - `locations_full`, `locations_excerpt`
  - `items_full`, `items_excerpt`
  - `species_full`, `species_excerpt`
  - `communities_full`, `communities_excerpt`
  - `dialogues_examples`
  - `scene_protagonists`, `scene_location`
  - `generation_settings`

### Dialogue Generation (`api.ts`)
- `BasePromptRequest`: Base prompt request structure
- `EstimateTokensRequest`: Token estimation request
- `EstimateTokensResponse`: Token count and raw prompt
- `PreviewPromptRequest`: Prompt preview request
- `PreviewPromptResponse`: Full prompt preview
- `GenerateUnityDialogueRequest`: Unity dialogue generation request
- `GenerateUnityDialogueResponse`: Generated dialogue variants with usage stats
- `ExportUnityDialogueRequest`: Unity dialogue export request
- `ExportUnityDialogueResponse`: Export result

### Game Flags (`flags.ts`)
- `InGameFlag`: Flag with id, value, category, timestamp

### Game Systems Integration (`gameSystemsIntegration.ts`)
- `GameSystemFamily`: Catalogue family id + label + description
- `RuntimeSourceState`: Runtime connection (`status`, `editing_blocked`, `message`)
- `GameSystemsIntegrationCatalog`: Full catalogue response

### Visibility & Effects (FR94)
- `ReputationConditionFr94`, `FactionTitleCondition` in `visibilityConditions.ts`
- `ReputationDeltaEffectFr94` in `choiceEffects.ts`
- `SkillCheckDefinition`, `SkillCheckIssue` in `utils/skillChecks.ts` (choice JSON shape)

### Document Preview (`documents.ts`)
- `PreviewGameSystemsState`: Frontend preview state (camelCase: `effortPool`, `reputationValues`, `factionTitles`)
- `DialoguePreviewRequest` / `DialoguePreviewResponse`: API preview contract incl. `simulation_limits`

### Prompt Structure (`prompt.ts`)
- `PromptStructure`: Structured prompt with sections
- Section types and hierarchy

### Graph Editor (`graph.ts`)
- Graph node types
- Edge types
- Layout types

### Generation (`generation.ts`)
- Generation state types
- Variant types

### Errors (`errors.ts`)
- API error types
- Error code enums

## Type Safety Features

- **Strict TypeScript**: All components and functions typed
- **API Types**: Synchronized with backend Pydantic schemas
- **Zod Validation**: Runtime validation for forms
- **Type Guards**: Runtime type checking where needed

## Key Distinctions

- `RawPrompt`: The actual prompt used for generation (from API)
- `PreviewPrompt`: User-facing prompt preview
- These are kept separate to avoid confusion in UI
