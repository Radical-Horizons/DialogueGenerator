# Development Guide

## Prerequisites

### Backend
- **Python**: Version 3.10 or later
- **pip**: Python package manager
- **Virtual Environment**: Python venv module (included with Python 3.3+)

### Frontend
- **Node.js**: Version compatible with package.json
- **npm**: Node package manager

### System
- **Windows 10+**: Primary development platform
- **Git**: Version control

## Installation

### Initial Setup

**Recommended: Use the automated setup script**

```bash
npm run setup
```

This will:
- Create a Python virtual environment (`.venv/`)
- Install all Python dependencies from `requirements.txt`
- Verify the installation

**Manual steps (if preferred):**

1. **Create and activate Python virtual environment:**
   ```bash
   # Create venv
   python -m venv .venv
   
   # Activate venv
   # Windows PowerShell:
   .\.venv\Scripts\Activate.ps1
   
   # Windows Command Prompt:
   .venv\Scripts\activate.bat
   
   # Linux/Mac:
   source .venv/bin/activate
   ```

2. **Install Python dependencies:**
   ```bash
   pip install -r requirements.txt
   ```

3. **Install Frontend dependencies:**
   ```bash
   cd frontend
   npm install
   cd ..
   ```

**Note:** All npm scripts automatically use the virtual environment. You don't need to activate it manually unless you're running Python commands directly.

### Environment Configuration

1. **Copy environment template:**
   ```bash
   cp .env.example .env
   ```

2. **Configure required variables in `.env`:**
   - `OPENAI_API_KEY`: OpenAI API key (required for dialogue generation)
   - `JWT_SECRET_KEY`: Secret key for JWT tokens (change in production!)
   - `ENVIRONMENT`: `development` or `production`
   - See `README_API.md` and `docs/guides/SECURITY.md` for full list

### Authentication and SQLite (Epic 7)

Default: **`DISABLE_AUTH=false`** — JWT required; the UI opens a **guest** session automatically (`POST /api/v1/auth/guest`) for read-only demo access. Use **Connexion** (`/login`) for `admin` or `writer` accounts.

**Seed admin account** on first API boot:

```bash
# In .env
ADMIN_PASSWORD=your-secure-password
```

Login as username `admin` with that password. Without `ADMIN_PASSWORD`, no account is created (startup warning); guest access still works.

**Application database** (`data/app.db`): SQLite stores users, preferences, dialogue ownership index, shares, and audit logs. Migrations run automatically at startup. Unity JSON files remain the dialogue source of truth. Tests override via `APP_DATABASE` (see `tests/conftest.py`).

**Test bypass**: pytest sets `DISABLE_AUTH=true` automatically. Do not use in production.

Roles and security details: [`docs/guides/SECURITY.md`](SECURITY.md) · API contracts: [`docs/api/api-contracts-api.md`](../api/api-contracts-api.md).

### GDD Data Setup

The application requires Game Design Document (GDD) JSON files:

1. **Create symbolic link for GDD categories:**
   - Windows: `mklink /D data\GDD_categories <path_to_GDD_directory>`
   - Linux/Mac: `ln -s <path_to_GDD_directory> data/GDD_categories`

2. **Required GDD files:**
   - `personnages.json` (recommended)
   - `lieux.json` (recommended)
   - `objets.json` (optional)
   - `especes.json` (optional)
   - `communautes.json` (optional)
   - Other category files as needed

3. **Vision.json location:**
   - Must be at: `../import/Bible_Narrative/Vision.json` (parent directory)

### Verify Installation

Check that everything is correctly installed:

```bash
npm run verify:venv
```

This verifies:
- Virtual environment exists
- Python is correctly installed
- All required packages are installed

## Virtual Environment

### About the Virtual Environment

This project uses a Python virtual environment (`.venv/`) to isolate dependencies. This ensures:
- **Isolation**: Project dependencies don't conflict with system Python
- **Reproducibility**: Same versions across different machines
- **Cleanliness**: No pollution of global Python installation

### Automatic Usage

All npm scripts automatically use the virtual environment:
- `npm run dev` - Uses venv for backend
- `npm test` - Uses venv for pytest
- `npm start` - Uses venv for API

You don't need to activate the venv manually for these commands.

### Manual Activation

If you need to run Python commands directly (outside npm scripts):

**Windows PowerShell:**
```powershell
.\.venv\Scripts\Activate.ps1
```

**Windows Command Prompt:**
```cmd
.venv\Scripts\activate.bat
```

**Linux/Mac:**
```bash
source .venv/bin/activate
```

**Or use the activation script:**
```bash
.\scripts\activate-venv.ps1
```

### Deactivation

When done working with the venv:
```bash
deactivate
```

### Troubleshooting Virtual Environment

**Venv not found:**
- Run `npm run setup` to create it

**Dependencies missing:**
- Run `npm run setup` to reinstall
- Or manually: `.\.venv\Scripts\python.exe -m pip install -r requirements.txt`

**Venv corrupted:**
- Delete `.venv/` folder
- Run `npm run setup` to recreate

**Scripts using wrong Python:**
- Verify with `npm run verify:venv`
- Check that `.venv/Scripts/python.exe` exists

## Development Commands

### Start Development Servers

**Start both backend and frontend:**
```bash
npm run dev
```
- Backend: `http://localhost:4243`
- Frontend: `http://localhost:3000`
- Frontend proxies `/api` to backend

**Start with cache cleanup:**
```bash
npm run dev:clean
```

**Start backend only:**
```bash
npm run dev:back
```

**Start frontend only:**
```bash
npm run dev:front
```

**Stop all services:**
```bash
npm run dev:stop
```

### Development Utilities

**Check service status:**
```bash
npm run dev:status
```

**Check for port conflicts and zombie processes:**
```bash
npm run dev:check
```

**Check with automatic cleanup:**
```bash
npm run dev:check --clean
```

**Debug mode:**
```bash
npm run dev:debug
```

**Verbose logging:**
```bash
npm run dev:verbose
```

**Quiet mode:**
```bash
npm run dev:quiet
```

## Build Commands

### Frontend Build

**Build for production:**
```bash
npm run build
```

**Build with type checking:**
```bash
npm run build:check
```

**Check build without building:**
```bash
npm run build:check
```

### Production Build

**Full production build:**
```bash
npm run deploy:build
```

**Check deployment readiness:**
```bash
npm run deploy:check
```

## Testing

### Backend Tests

**Run all tests:**
```bash
npm test
# or
pytest tests/
```

**Run API tests only:**
```bash
npm run test:api
# or
pytest tests/api/
```

**Run unit tests (non-API):**
```bash
pytest tests/ -k "not api"
```

**Run with coverage:**
```bash
pytest tests/ --cov=api --cov=services --cov-report=html
```

### Frontend Tests

**Run frontend tests:**
```bash
npm run test:frontend
```

**Run E2E tests:**
```bash
npm run test:e2e
```

**Run all tests:**
```bash
npm run test:all
```

## Running in Production

### Start Production Server

**Start production API:**
```bash
npm run start:prod
```

**Start API only:**
```bash
npm run start:api
# or
python -m api.main
```

**Start with debug:**
```bash
npm run start:debug
```

## Development Workflow

### Typical Development Session

1. **Start development servers:**
   ```bash
   npm run dev
   ```

2. **Make code changes:**
   - Frontend: Changes hot-reload automatically (HMR)
   - Backend: Auto-reloads with uvicorn (if configured)

3. **Run tests after changes:**
   ```bash
   # Backend
   pytest tests/
   
   # Frontend
   npm run test:frontend
   ```

4. **Check for issues:**
   ```bash
   npm run dev:check
   ```

### Troubleshooting Development Issues

**If changes not visible:**
1. Clear Vite cache: `npm run dev:clean`
2. Clear browser cache
3. Check HMR WebSocket connection in browser DevTools
4. Restart servers: `npm run dev:stop && npm run dev`

**If ports are blocked:**
```bash
npm run dev:check --clean
```

**If build fails:**
```bash
npm run build:check
```

## Code Organization

### Backend Structure
- `api/`: FastAPI application
- `core/`: Core business logic
- `services/`: Application services
- `models/`: Data models
- `tests/`: Test suite

### Frontend Structure
- `frontend/src/api/`: API client modules
- `frontend/src/components/`: React components
- `frontend/src/store/`: Zustand state stores
- `frontend/src/types/`: TypeScript types
- `frontend/src/hooks/`: Custom React hooks

## Testing Strategy

### Backend
- **Framework**: pytest with pytest-asyncio
- **Test Structure**: Mirrors code structure (`tests/api/`, `tests/services/`)
- **Mocking**: pytest-mock for external services
- **Coverage**: Aim for >80% on critical code

### Frontend
- **Unit Tests**: Vitest + React Testing Library
- **E2E Tests**: Playwright
- **Test Location**: Co-located with components (`.test.tsx`)

## Code Quality

### Backend
- **Type Hints**: All functions must have type annotations
- **Docstrings**: PEP 257 docstrings for all functions/classes
- **Linting**: Configure linter (if available)

### Frontend
- **TypeScript**: Strict mode enabled
- **Linting**: ESLint with React plugins
- **Formatting**: Consistent code style

## Common Development Tasks

### Adding a New API Endpoint

1. Create route handler in `api/routers/`
2. Define Pydantic schemas in `api/schemas/`
3. Add service logic in `services/` (if needed)
4. Add tests in `tests/api/`
5. Update API client in `frontend/src/api/`

### Adding a New Frontend Component

1. Create component in appropriate `frontend/src/components/` subdirectory
2. Add TypeScript types if needed
3. Add tests (`.test.tsx`)
4. Integrate with stores if needed

### Modifying Context Building

1. Update `core/context/context_builder.py`
2. Update related services in `services/`
3. Update tests in `tests/services/`

## Environment Variables

### Development
- `ENVIRONMENT=development`
- `OPENAI_API_KEY`: Your OpenAI API key
- `JWT_SECRET_KEY`: Default accepted in dev (change in production!)

### Production
- `ENVIRONMENT=production`
- `OPENAI_API_KEY`: Production OpenAI API key
- `JWT_SECRET_KEY`: **MUST be changed from default**
- `CORS_ORIGINS`: Allowed CORS origins

See `.env.example` for full list of variables.

## Debugging

### Backend Debugging
- Use Python debugger (pdb) or IDE debugger
- Check logs in `data/logs/` (if configured)
- Use `npm run start:debug` for debug mode

### Frontend Debugging
- Use React DevTools browser extension
- Check browser console for errors
- Use `npm run dev:debug` for verbose logging
- Check Vite HMR status in browser DevTools Network tab

### Common Issues
- **HMR not working**: Clear Vite cache, check WebSocket connection
- **API errors**: Check backend logs, verify CORS settings
- **Build errors**: Run `npm run build:check` for detailed errors

## Additional Resources

- **API Documentation**: `README_API.md`
- **Deployment Guide**: `docs/guides/DEPLOYMENT.md`
- **Security Guide**: `docs/guides/SECURITY.md`
- **Testing Guide**: `docs/guides/TESTING.md`
- **Development Troubleshooting**: `docs/guides/DEVELOPMENT.md`
