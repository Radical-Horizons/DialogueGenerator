# Integration Architecture

## Overview
DialogueGenerator is a **multi-part application** with clear separation between frontend (React) and backend (FastAPI), communicating via REST API.

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────┐
│                    Frontend (React)                      │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐ │
│  │  Components  │  │    Stores    │  │  API Client  │ │
│  │   (UI)       │→ │  (Zustand)   │→ │   (Axios)    │ │
│  └──────────────┘  └──────────────┘  └──────┬───────┘ │
└──────────────────────────────────────────────┼─────────┘
                                                │
                                    HTTP/REST   │
                                    JSON        │
                                    JWT Auth    │
                                                ▼
┌─────────────────────────────────────────────────────────┐
│                  Backend API (FastAPI)                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐ │
│  │   Routers   │→ │   Services   │→ │  Core Logic │ │
│  │ (Endpoints) │  │ (Business)   │  │  (Context,   │ │
│  └──────────────┘  └──────────────┘  │   Prompt)   │ │
│                                       └──────────────┘ │
└─────────────────────────────────────────────────────────┘
```

## Communication Protocol

### Protocol
- **Type**: HTTP/HTTPS REST API
- **Data Format**: JSON
- **Authentication**: JWT Bearer tokens

### API Base Path
- **Development**: `http://localhost:4243/api/v1`
- **Production**: Configured via `VITE_API_BASE_URL` or defaults to `/api/v1`

### Development Proxy
In development, Vite dev server proxies `/api` requests to backend:
- **Frontend**: `http://localhost:3000`
- **Backend**: `http://localhost:4243`
- **Proxy**: Vite proxies `/api/*` → `http://localhost:4243/api/*`

Configuration in `frontend/vite.config.ts`:
```typescript
proxy: {
  '/api': {
    target: 'http://localhost:4243',
    changeOrigin: true,
    secure: false
  }
}
```

## Integration Points

### 1. Authentication Flow

**Frontend → Backend:**
```
POST /api/v1/auth/login
  Body: { email, password }
  Response: { access_token, token_type }
```

**Token Management:**
- Access token stored in `localStorage`
- Refresh token in httpOnly cookie (backend)
- Automatic token refresh on 401 errors
- Token added to requests via `Authorization: Bearer <token>` header

**Backend → Frontend:**
- JWT tokens issued on login
- Refresh endpoint: `POST /api/v1/auth/refresh`
- User info: `GET /api/v1/auth/me`

### 2. Context/GDD Data Flow

**Frontend → Backend:**
```
GET /api/v1/context/characters
GET /api/v1/context/locations
GET /api/v1/context/items
...
POST /api/v1/context/build
  Body: { context_selection, ... }
  Response: { context_summary, ... }
```

**Data Flow:**
1. Frontend requests GDD elements (characters, locations, etc.)
2. Backend loads from JSON files in `data/GDD_categories/`
3. Backend returns element lists
4. Frontend stores in Zustand stores
5. User selects elements
6. Frontend sends selection to `/context/build`
7. Backend constructs context summary
8. Backend returns formatted context

### 3. Dialogue Generation Flow

**Frontend → Backend:**
```
POST /api/v1/dialogues/estimate-tokens
  Body: { context_selection, user_instruction, ... }
  Response: { estimated_tokens, raw_prompt, ... }

POST /api/v1/dialogues/generate/unity-dialogue
  Body: { context_selection, user_instruction, model_name, ... }
  Response: { variants: [...], usage: {...} }
```

**Generation Flow:**
1. User selects context and enters instruction
2. Frontend calls `estimate-tokens` to preview
3. User confirms and calls `generate/unity-dialogue`
4. Backend:
   - Builds context from GDD data
   - Constructs prompt via PromptEngine
   - Calls OpenAI API
   - Validates and structures response
5. Backend returns Unity dialogue nodes
6. Frontend displays variants
7. User can edit and export

### 4. Configuration Flow

**Frontend → Backend:**
```
GET /api/v1/config
GET /api/v1/config/system-prompts
GET /api/v1/config/scene-instructions
PUT /api/v1/config
```

**Configuration Management:**
- Backend reads from `config/*.json` files
- Frontend can read and update via API
- Changes persisted to JSON files

### 5. Graph Editor Flow

**Frontend → Backend:**
```
POST /api/v1/graph/validate
POST /api/v1/graph/layout
POST /api/v1/graph/export
POST /api/v1/graph/import
POST /api/v1/graph/save
```

**Graph Operations:**
- Frontend manages graph state in Zustand
- Backend provides validation and layout services
- Graph data can be exported/imported

## Data Flow Patterns

### Request Flow
1. **User Action** → React Component
2. **Component** → Zustand Store Action
3. **Store** → API Client Function
4. **API Client** → Axios Request (with auth token)
5. **Backend** → FastAPI Router
6. **Router** → Service Layer
7. **Service** → Core Logic / External API
8. **Response** → Service → Router → JSON Response
9. **Frontend** → API Client → Store Update
10. **Component** → Re-render with new data

### Error Handling Flow
1. **Backend Error** → FastAPI Exception
2. **Exception** → Standardized Error Response
3. **Frontend** → Axios Interceptor
4. **401 Error** → Automatic Token Refresh
5. **Other Errors** → Display to User
6. **Error State** → Store Update → Component Display

## CORS Configuration

### Development
- **Origins**: `http://localhost:3000` (frontend dev server)
- **Methods**: All methods allowed
- **Headers**: All headers allowed
- **Credentials**: Cookies enabled

### Production
- **Origins**: Configured via `CORS_ORIGINS` environment variable (CSV)
- **Regex Support**: ngrok URLs supported for testing
- **Security**: Strict origin validation

Configuration in `api/main.py`:
```python
cors_origins = os.getenv("CORS_ORIGINS", "").split(",")
# Configure CORS middleware with allowed origins
```

## Shared Dependencies

### Data Models
- **Backend**: Pydantic models in `api/schemas/`
- **Frontend**: TypeScript types in `frontend/src/types/api.ts`
- **Synchronization**: Types should mirror Pydantic schemas

### Constants
- **Backend**: `constants.py`
- **Frontend**: `frontend/src/constants.ts`
- **Shared Values**: Model names, defaults, etc.

### Configuration
- **Backend**: Reads from `config/*.json`
- **Frontend**: Reads via API endpoints
- **Format**: JSON files with consistent structure

## Authentication Integration

### Token Storage
- **Access Token**: `localStorage.getItem('access_token')`
- **Refresh Token**: httpOnly cookie (backend managed)
- **Token Refresh**: Automatic via Axios interceptor

### Request Interceptor
```typescript
apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})
```

### Response Interceptor
- Detects 401 errors
- Attempts token refresh
- Retries original request
- Logs out on refresh failure

## State Synchronization

### Frontend State
- **Zustand Stores**: Client-side state management
- **React Query**: Server state caching (where used)
- **Local Storage**: Persistent preferences

### Backend State
- **ServiceContainer**: Service lifecycle management
- **In-Memory**: GDD data loaded at startup
- **File System**: Configuration and data files

### Synchronization Points
- **Context Selection**: Frontend → Backend on build request
- **Dialogue Generation**: Frontend → Backend → OpenAI → Backend → Frontend
- **Configuration**: Bidirectional via API

## Error Handling Integration

### Backend Error Format
```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable message",
    "details": {},
    "request_id": "uuid"
  }
}
```

### Frontend Error Handling
- **Axios Interceptor**: Catches HTTP errors
- **Error Types**: Typed in `frontend/src/types/errors.ts`
- **User Display**: Toast notifications or error boundaries
- **Logging**: Frontend errors sent to `/api/v1/logs/frontend`

## Performance Considerations

### Request Optimization
- **Token Estimation**: Pre-validates before generation
- **Caching**: React Query caches API responses
- **Pagination**: Large lists paginated (characters, locations)

### Timeout Configuration
- **Default**: 30 seconds
- **LLM Generation**: 5 minutes (extended timeout)
- **Configuration**: `frontend/src/constants.ts` → `API_TIMEOUTS`

## Security Integration

### Authentication
- **JWT Tokens**: Secure token-based auth
- **HttpOnly Cookies**: Refresh tokens protected
- **Token Expiration**: Access tokens expire, refresh tokens rotate

### CORS
- **Development**: Permissive for local development
- **Production**: Strict origin validation
- **Credentials**: Enabled for cookie-based refresh

### API Security
- **Rate Limiting**: SlowAPI middleware
- **Input Validation**: Pydantic schemas
- **Error Messages**: Sanitized to avoid information leakage

## Testing Integration

### Frontend Tests
- **API Mocking**: Mock API client in tests
- **Store Testing**: Test Zustand stores independently
- **E2E Tests**: Playwright tests with real API

### Backend Tests
- **TestClient**: FastAPI TestClient for API tests
- **Service Tests**: Mock external dependencies (OpenAI, files)
- **Integration Tests**: Test full request/response flow

## Deployment Integration

### Development
- **Separate Processes**: Frontend and backend run separately
- **Proxy**: Vite proxies API requests
- **Hot Reload**: Both support hot reload

### Production
- **Static Files**: Frontend built to `frontend/dist/`
- **Serving Options**:
  - Backend serves static files (FastAPI static files)
  - Separate web server (Nginx) serves static files
  - CDN for static assets
- **API**: Backend runs on configured port (4242 in production)

## Monitoring Integration

### Logging
- **Backend**: Structured logging to `data/logs/`
- **Frontend**: Errors sent to backend via `/api/v1/logs/frontend`
- **Request IDs**: Tracked across frontend/backend

### Metrics
- **Prometheus**: Backend metrics (if configured)
- **Usage Tracking**: LLM usage tracked and exposed via API

## Game Systems Preview Flow (FR94)

Deterministic evaluation of dialogue conditions and affordances — **not** LLM-backed.

```
DialoguePreviewPanel / DialogueNode
        │  previewGameSystemsState (graphViewStore)
        ▼
frontend/src/utils/{skillChecks,effortPreview,reputationFr94,previewSimulationLimits}.ts
        │  postDocumentPreview (optional server round-trip)
        ▼
POST /api/v1/documents/{id}/preview
        │  DialoguePreviewRequest.game_systems_state
        ▼
services/game_systems_{skill_checks,effort,reputation}.py
        ▼
DialoguePreviewResponse (masking + simulation_limits)
```

**Catalogue UI:** `getGameSystemsIntegrationCatalog()` → `GET /mechanics/systems/integration`.

**Reste à faire:** runtime stats feed from Unity (today `runtime_source.status` is always `disconnected` locally).

Guide: [`docs/guides/game-systems-integration.md`](../guides/game-systems-integration.md)

---

## Future Integration Points

### Potential Enhancements
- **WebSocket**: Real-time updates (if needed)
- **Server-Sent Events**: Progress updates for long operations
- **GraphQL**: Alternative to REST (if complexity grows)
- **gRPC**: High-performance inter-service communication (if needed)
