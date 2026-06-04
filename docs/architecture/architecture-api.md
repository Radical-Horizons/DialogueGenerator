# Architecture - Backend API

## Executive Summary

The backend is a **FastAPI** REST API built with **Python 3.10+** that provides endpoints for dialogue generation, context management, and configuration. It uses **Pydantic** for validation, **ServiceContainer** for dependency injection, and integrates with **OpenAI API** for LLM-powered dialogue generation.

## Technology Stack

See `technology-stack.md` for detailed technology breakdown.

**Key Technologies:**
- FastAPI 0.104.0+
- Python 3.10+
- Pydantic 2.0+
- Uvicorn (ASGI server)
- OpenAI SDK 1.15+
- Tiktoken (token counting)

## Architecture Pattern

### Layered Architecture

The backend follows a **layered architecture** with clear separation of concerns:

```
┌─────────────────────────────────────────┐
│         Presentation Layer               │
│  ┌──────────┐  ┌──────────┐             │
│  │ Routers  │  │ Schemas  │             │
│  │(FastAPI) │  │(Pydantic)│             │
│  └────┬─────┘  └────┬─────┘             │
└───────┼─────────────┼───────────────────┘
        │             │
┌───────▼─────────────▼───────────────────┐
│       Application Layer                   │
│  ┌──────────┐  ┌──────────┐             │
│  │Services  │  │Middleware│             │
│  │(Business)│  │(Cross-cut)│            │
│  └────┬─────┘  └────┬─────┘             │
└───────┼─────────────┼───────────────────┘
        │             │
┌───────▼─────────────▼───────────────────┐
│          Domain Layer                    │
│  ┌──────────┐  ┌──────────┐             │
│  │   Core   │  │  Models  │             │
│  │  Logic   │  │(Pydantic)│             │
│  └────┬─────┘  └────┬─────┘             │
└───────┼─────────────┼───────────────────┘
        │             │
        └──────┬──────┘
               │
        ┌──────▼──────┐
        │ External APIs│
        │ (OpenAI, etc)│
        └─────────────┘
```

### Request Flow

1. **HTTP Request** → FastAPI Router
2. **Router** → Dependency Injection (ServiceContainer)
3. **Router** → Service Layer
4. **Service** → Core Logic / External API
5. **Response** → Pydantic Schema Validation
6. **JSON Response** → Client

## Router Structure

### API Endpoints

**Authentication** (`api/routers/auth.py`):
- Login, refresh, logout, user info

**Context** (`api/routers/context.py`):
- GDD element access (characters, locations, items, etc.)
- Context building and linked elements

**Dialogues** (`api/routers/dialogues.py`):
- Token estimation
- Prompt preview
- Unity dialogue generation
- Dialogue export

**Graph** (`api/routers/graph.py`):
- Graph validation, layout, export/import, save

**Configuration** (`api/routers/config.py`):
- System prompts, scene instructions, author profiles
- Context field definitions
- LLM models and pricing

**Vocabulary** (`api/routers/vocabulary.py`):
- Vocabulary term management

**Narrative Guides** (`api/routers/narrative_guides.py`):
- Narrative guide management

**Mechanics Flags** (`api/routers/mechanics_flags.py`):
- Game mechanics flags management

**Unity Dialogues** (`api/routers/unity_dialogues.py`):
- Unity dialogue file management

**LLM Usage** (`api/routers/llm_usage.py`):
- Usage statistics and history

**Logs** (`api/routers/logs.py`):
- Log search and statistics

## Service Layer

### Service Architecture

**Business Services** (`services/`):
- `dialogue_generation_service.py`: Dialogue generation logic
- `unity_dialogue_generation_service.py`: Unity-specific generation
- `context_construction_service.py`: Context building
- `context_field_validator.py`: Field validation
- Various catalog services (skills, traits, flags, vocabulary)

**API Services** (`api/services/`):
- `auth_service.py`: Authentication logic
- `log_service.py`: Logging service

### ServiceContainer Pattern

**Dependency Injection:**
- `api/container.py`: ServiceContainer class
- Manages service lifecycle
- Provides services to routers via FastAPI dependencies
- Initialized in `app.state.container`

**Usage:**
```python
from api.dependencies import get_dialogue_generation_service

@router.post("/endpoint")
async def endpoint(
    service: Annotated[DialogueGenerationService, Depends(get_dialogue_generation_service)]
):
    # Use service
```

## Core Logic

### Context Building

**Location**: `core/context/context_builder.py`

**Responsibilities:**
- Load GDD JSON files from `data/GDD_categories/`
- Load Vision.json from `../import/Bible_Narrative/`
- Build context summaries for LLM
- Filter and organize GDD elements

### Prompt Engineering

**Location**: `core/prompt/prompt_engine.py`

**Responsibilities:**
- Combine system prompt, context, and user instructions
- Structure prompts with sections
- Token estimation
- Prompt optimization

### LLM Integration

**Location**: `core/llm/llm_client.py`

**Responsibilities:**
- Abstract LLM client interface
- OpenAI client implementation
- Structured output support
- Error handling and retries

## Data Models

### Pydantic Schemas

**Request/Response Models** (`api/schemas/`):
- Request validation
- Response serialization
- Type safety

**Domain Models** (`models/`):
- Unity dialogue node structure
- Dialogue elements
- Prompt structure
- LLM usage tracking

## Middleware

### Cross-Cutting Concerns

**Rate Limiting** (`api/middleware/rate_limiter.py`):
- SlowAPI integration
- Per-endpoint rate limits

**Logging** (`api/middleware/logging_context.py`):
- Request ID generation
- Structured logging
- Request/response logging

**HTTP Caching** (`api/middleware/http_cache.py`):
- Cache control headers
- ETag support

**CORS** (`api/main.py`):
- CORS middleware configuration
- Environment-based origin settings

## Security

### Authentication

- **JWT Tokens**: Access tokens for API authentication
- **Refresh Tokens**: HttpOnly cookies for token refresh
- **Password Hashing**: Bcrypt for password storage

### Input Validation

- **Pydantic**: Request/response validation
- **Field Validation**: Custom validators for GDD fields
- **Schema Validation**: JSON Schema for Unity dialogue format

### Error Handling

- **Standardized Errors**: Consistent error response format
- **Error Codes**: Typed error codes
- **Request IDs**: Track errors across requests

## Configuration Management

### Configuration Service

**Location**: `services/configuration_service.py`

**Responsibilities:**
- Load JSON configuration files from `config/`
- Provide configuration to services
- Validate configuration

### Configuration Files

- `config/llm_config.json`: LLM model configuration
- `config/context_config.json`: Context field definitions
- `config/system_prompts.json`: System prompt templates
- `config/scene_instructions/`: Scene instruction templates
- `config/author_profiles/`: Author profile templates

## Data Access

### GDD Data

**Loading:**
- JSON files from `data/GDD_categories/`
- Vision.json from parent directory
- Loaded at application startup
- Cached in memory

**Access:**
- Via ContextBuilder service
- Filtered and organized by type
- Pagination support for large lists

### File System

**Dialogue Files:**
- Unity dialogue files in `Assets/Dialogues/generated/`
- YARN format export
- File management via API

**Logs:**
- Application logs in `data/logs/`
- Automatic rotation and cleanup
- Structured logging format

## External Integrations

### OpenAI API

**Integration:**
- OpenAI SDK for API calls
- Structured output support
- Token counting with Tiktoken
- Error handling and retries

**Configuration:**
- API key from environment variable
- Model selection from config
- Temperature and other parameters

### Notion API (Optional)

**Integration:**
- HTTPX client for Notion API
- Caching for performance
- Used for GDD data import (if configured)

## Testing Strategy

### Test Structure

**Location**: `tests/`

**Organization:**
- `tests/api/`: API endpoint tests
- `tests/services/`: Service layer tests
- `tests/utils/`: Utility tests

### Testing Tools

- **Framework**: pytest with pytest-asyncio
- **Mocking**: pytest-mock for external services
- **Test Client**: FastAPI TestClient for API tests

### Test Patterns

- **Isolation**: Each test is independent
- **Mocking**: Mock external APIs (OpenAI, files)
- **Fixtures**: Reusable test fixtures in `conftest.py`

## Performance

### Optimization

- **Async/Await**: Full async support for I/O operations
- **Caching**: In-memory caching for GDD data and configs
- **Connection Pooling**: HTTPX connection pooling
- **Lazy Loading**: Load data on demand where possible

### Monitoring

- **Prometheus**: Metrics endpoint (if configured)
- **Sentry**: Error tracking (if configured)
- **Structured Logging**: Request/response logging

## Deployment

### Server Configuration

- **ASGI Server**: Uvicorn
- **Workers**: Configured for production
- **Port**: `API_PORT` (défaut **`4242`** dans `api/main.py` si absent) ; **`npm run dev`** définit **`4243`** (`scripts/dev.js`, aligné proxy Vite / E2E). Gunicorn en prod : `bind` typiquement **`127.0.0.1:4242`** dans `gunicorn.conf.py` (Nginx reverse-proxy vers ce socket).

### Environment Configuration

- **Environment Variables**: `.env` file
- **Security**: JWT secret, CORS origins
- **External Services**: OpenAI API key

## Future Considerations

### Potential Enhancements

- **Database**: If data persistence needed
- **Message Queue**: For async processing
- **Caching Layer**: Redis for distributed caching
- **API Versioning**: If breaking changes needed
