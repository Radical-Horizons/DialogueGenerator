# Source Tree Analysis

## Project Root Structure

```
DialogueGenerator/
├── api/                    # Backend API (FastAPI)
│   ├── routers/           # API route handlers
│   ├── schemas/           # Pydantic request/response models
│   ├── services/           # API-specific services
│   ├── middleware/        # Cross-cutting middleware
│   ├── config/            # Security and validation config
│   ├── utils/             # API utilities
│   ├── dependencies.py    # FastAPI dependency injection
│   ├── container.py       # ServiceContainer for DI
│   └── main.py            # FastAPI app entry point
│
├── frontend/              # Frontend Web Application (React)
│   ├── src/
│   │   ├── api/          # API client modules
│   │   ├── components/   # React components
│   │   ├── store/        # Zustand state stores
│   │   ├── hooks/        # Custom React hooks
│   │   ├── pages/        # Route pages
│   │   ├── types/        # TypeScript type definitions
│   │   ├── utils/        # Frontend utilities
│   │   ├── constants.ts  # Application constants
│   │   ├── theme.ts      # Theme configuration
│   │   └── main.tsx      # React app entry point
│   ├── vite.config.ts    # Vite build configuration
│   └── package.json      # Frontend dependencies
│
├── core/                  # Core business logic (shared)
│   ├── context/          # Context building logic
│   ├── prompt/           # Prompt engine
│   └── llm/              # LLM client interfaces
│
├── services/              # Application services
│   ├── repositories/     # Data access abstractions
│   ├── json_renderer/    # Unity JSON rendering
│   ├── context_serializer/ # Context serialization
│   ├── game_systems_*.py # FR94 pure evaluators (skill checks, effort, reputation, social diagnostics)
│   └── [service files]   # Various business services
│
├── models/                # Data models
│   ├── dialogue_structure/ # Unity dialogue models
│   ├── llm_usage.py      # LLM usage tracking
│   └── prompt_structure.py # Prompt structure models
│
├── tests/                 # Test suite
│   ├── api/              # API endpoint tests
│   ├── services/          # Service tests
│   └── [test files]      # Additional tests
│
├── config/                # Configuration files
│   ├── llm_config.json   # LLM configuration
│   ├── context_config.json # Context configuration
│   └── [config files]    # Additional configs
│
├── data/                  # Data storage
│   └── [data files]      # JSON data files
│
├── scripts/               # Build and utility scripts
│   ├── dev.js            # Development server orchestration
│   ├── build_production.ps1 # Production build
│   └── [other scripts]   # Additional utilities
│
├── docs/                  # Documentation
│   ├── analysis/         # Analysis documents
│   ├── deployment/       # Deployment guides
│   └── [doc files]       # Technical documentation
│
├── .cursor/               # Cursor IDE configuration
│   ├── rules/            # Cursor rules (.mdc files)
│   └── commands/         # Custom commands
│
├── requirements.txt       # Python dependencies
├── package.json          # Node.js dependencies (root)
├── README.md             # Project documentation
└── README_API.md         # API documentation
```

## Critical Directories - Backend API

### `api/routers/`
**Purpose**: REST API endpoint handlers
- `auth.py`: Authentication endpoints (login, refresh, logout)
- `context.py`: GDD context endpoints (characters, locations, items, etc.)
- `dialogues.py`: Dialogue generation endpoints
- `graph.py`: Graph editor endpoints
- `config.py`: Configuration endpoints
- `vocabulary.py`: Vocabulary endpoints
- `narrative_guides.py`: Narrative guides endpoints
- `mechanics_flags.py`: Game mechanics flags endpoints
- `mechanics_systems.py`: FR94 game systems integration catalogue
- `documents.py`: Canonical documents CRUD, preview, validation
- `unity_dialogues.py`: Unity dialogue file management
- `llm_usage.py`: LLM usage tracking
- `logs.py`: Logging endpoints

### `api/schemas/`
**Purpose**: Pydantic models for request/response validation
- Mirrors router structure with corresponding schema files
- Ensures type safety and validation

### `api/services/`
**Purpose**: API-specific service layer
- `auth_service.py`: Authentication logic
- `log_service.py`: Logging service

### `api/middleware/`
**Purpose**: Cross-cutting concerns
- `rate_limiter.py`: Rate limiting
- `logging_context.py`: Request logging
- `http_cache.py`: HTTP caching

### `api/dependencies.py`
**Purpose**: FastAPI dependency injection
- Provides services to route handlers
- Manages service lifecycle

### `api/container.py`
**Purpose**: ServiceContainer for dependency management
- Centralized service initialization
- Service lifecycle management

## Critical Directories - Frontend

### `frontend/src/api/`
**Purpose**: API client modules
- `client.ts`: Core Axios instance with auth interceptors
- `auth.ts`: Authentication API calls
- `context.ts`: Context/GDD API calls
- `dialogues.ts`: Dialogue generation API calls
- `graph.ts`: Graph editor API calls
- `config.ts`: Configuration API calls
- `vocabulary.ts`: Vocabulary API calls
- `flags.ts`: Game flags API calls
- `gameSystemsIntegration.ts`: FR94 catalogue API
- `documents.ts`: Document CRUD and preview API
- `narrativeGuides.ts`: Narrative guides API calls
- `unityDialogues.ts`: Unity dialogue file API calls
- `llmUsage.ts`: LLM usage API calls

### `frontend/src/components/`
**Purpose**: React UI components
- `auth/`: Authentication components
- `context/`: Context selection components
- `generation/`: Dialogue generation components
- `graph/`: Graph editor components
- `layout/`: Layout components
- `shared/`: Reusable shared components
- `unityDialogues/`: Unity dialogue management
- `usage/`: Usage tracking components

### `frontend/src/store/`
**Purpose**: Zustand state management stores
- `contextStore.ts`: Context selection state
- `generationStore.ts`: Generation state
- `graphStore.ts`: Graph editor state
- `authStore.ts`: Authentication state
- `flagsStore.ts`: Game flags state
- `vocabularyStore.ts`: Vocabulary state
- `narrativeGuidesStore.ts`: Narrative guides state
- `contextConfigStore.ts`: Context configuration state
- `generationActionsStore.ts`: Action history
- `syncStore.ts`: Synchronization state
- `commandPaletteStore.ts`: Command palette state

### `frontend/src/types/`
**Purpose**: TypeScript type definitions
- `api.ts`: API request/response types
- `prompt.ts`: Prompt structure types
- `generation.ts`: Generation types
- `graph.ts`: Graph editor types
- `flags.ts`: Game flags types
- `gameSystemsIntegration.ts`: FR94 catalogue types
- `visibilityConditions.ts`, `choiceEffects.ts`, `documents.ts`: FR94 conditions/effects/preview
- `errors.ts`: Error types

### `frontend/src/utils/` (FR94 evaluators)
- `skillChecks.ts`, `effortPreview.ts`, `reputationFr94.ts`, `socialDiagnostics.ts`, `previewSimulationLimits.ts`: Mirror backend `services/game_systems_*.py`

### `frontend/src/components/graph/systems/`
- `GameSystemsIntegrationPanel.tsx`: FR94 catalogue side panel

### `frontend/src/hooks/`
**Purpose**: Custom React hooks
- Reusable logic hooks
- API integration hooks

## Critical Directories - Core Logic

### `core/context/`
**Purpose**: Context building from GDD data
- `context_builder.py`: Main context builder class
- Loads and processes GDD JSON files
- Builds context summaries for LLM

### `core/prompt/`
**Purpose**: Prompt construction
- `prompt_engine.py`: Prompt engine
- Combines system prompt, context, and user instructions

### `core/llm/`
**Purpose**: LLM client interfaces
- `llm_client.py`: LLM client interface and implementations
- OpenAI client implementation

## Critical Directories - Services

### `services/`
**Purpose**: Business logic services
- `dialogue_generation_service.py`: Dialogue generation logic
- `unity_dialogue_generation_service.py`: Unity-specific generation
- `context_builder_factory.py`: Context builder factory
- `context_construction_service.py`: Context construction
- `context_field_validator.py`: Field validation
- `json_renderer/`: Unity JSON rendering
- `context_serializer/`: Context serialization
- Various catalog services (skills, traits, flags, vocabulary)

## Entry Points

### Backend
- **Main Entry**: `api/main.py`
  - FastAPI application initialization
  - Middleware setup
  - Router registration
  - ServiceContainer initialization

### Frontend
- **Main Entry**: `frontend/src/main.tsx`
  - React app initialization
  - Router setup
  - Store initialization
  - Theme application

## Integration Points

### Frontend → Backend
- **Protocol**: HTTP/HTTPS REST API
- **Base Path**: `/api/v1`
- **Authentication**: JWT tokens in Authorization header
- **Data Format**: JSON
- **Proxy**: Vite dev server proxies `/api` to backend

### Shared Code
- **Models**: TypeScript types mirror Pydantic schemas
- **Constants**: Shared constants in `constants.py` and `frontend/src/constants.ts`
- **Configuration**: JSON config files in `config/`

## Build Outputs

### Frontend
- **Build Directory**: `frontend/dist/`
- **Static Assets**: Served by backend or separate web server

### Backend
- **No Build Step**: Python interpreted directly
- **Production**: Uses uvicorn ASGI server
