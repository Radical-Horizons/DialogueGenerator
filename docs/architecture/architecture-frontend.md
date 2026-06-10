# Architecture - Frontend

## Executive Summary

The frontend is a **React 18 + TypeScript** single-page application (SPA) built with **Vite** for fast development and optimized production builds. It uses **Zustand** for state management and **React Query** for server state caching. The application provides a modern, responsive interface for dialogue generation with real-time preview and editing capabilities.

## Technology Stack

See `technology-stack.md` for detailed technology breakdown.

**Key Technologies:**
- React 18.2.0
- TypeScript 5.2.0
- Vite 4.4.0
- Zustand 4.4.0
- React Query 5.90.12
- React Router 6.20.0
- ReactFlow 11.11.4 (graph editor)

## Architecture Pattern

### Component-Based Architecture

The frontend follows a **component-based architecture** with clear separation of concerns:

```
┌─────────────────────────────────────────┐
│           Presentation Layer             │
│  ┌──────────┐  ┌──────────┐           │
│  │Components│  │  Pages   │           │
│  └────┬─────┘  └────┬─────┘           │
└───────┼─────────────┼─────────────────┘
        │             │
┌───────▼─────────────▼─────────────────┐
│         State Management                │
│  ┌──────────┐  ┌──────────┐           │
│  │ Zustand  │  │React Query│          │
│  │  Stores  │  │  Cache    │           │
│  └────┬─────┘  └────┬─────┘           │
└───────┼─────────────┼─────────────────┘
        │             │
┌───────▼─────────────▼─────────────────┐
│          API Client Layer              │
│  ┌──────────┐  ┌──────────┐           │
│  │  Axios   │  │  Types   │           │
│  │  Client  │  │ (TS)     │           │
│  └────┬─────┘  └────┬─────┘           │
└───────┼─────────────┼─────────────────┘
        │             │
        └──────┬──────┘
               │
        ┌──────▼──────┐
        │  Backend API│
        │  (FastAPI)  │
        └─────────────┘
```

### Data Flow

**Unidirectional Data Flow:**
1. User interaction → Component
2. Component → Store action or API call
3. Store/API → State update
4. State change → Component re-render

**Server State:**
- React Query manages server state (API responses)
- Automatic caching and background refetching
- Optimistic updates where applicable

**Client State:**
- Zustand stores manage UI state and selections
- Local state for component-specific data
- URL state for filters/selections (query params)

## Component Structure

### Organization

Components are organized by feature domain:

- **`auth/`**: Authentication components
- **`context/`**: Context selection and management
- **`generation/`**: Dialogue generation interface
- **`graph/`**: Graph editor for dialogue flows
- **`layout/`**: Application layout components
- **`shared/`**: Reusable shared components
- **`unityDialogues/`**: Unity dialogue file management
- **`usage/`**: Usage tracking and statistics

### Component Patterns

**Container/Presentational Pattern:**
- Container components: Manage state and logic
- Presentational components: Display data

**Custom Hooks:**
- Reusable logic extracted to hooks
- API integration hooks
- State management hooks

## State Management

### Zustand Stores

**Store Architecture:**
- **`contextStore`**: Context/GDD element selections
- **`generationStore`**: Dialogue generation state
- **`graphStore`**: Graph editor state
- **`authStore`**: Authentication state
- **`flagsStore`**: Game mechanics flags
- **`vocabularyStore`**: Vocabulary entries
- **`narrativeGuidesStore`**: Narrative guides
- **`contextConfigStore`**: Context configuration
- **`generationActionsStore`**: Action history (undo/redo)
- **`syncStore`**: Synchronization state
- **`commandPaletteStore`**: Command palette state

**Store Patterns:**
- Immutable updates
- Computed selectors
- Action-based updates
- Type-safe with TypeScript

### React Query Integration

**Server State Caching:**
- Automatic caching of API responses
- Background refetching
- Stale-while-revalidate pattern
- Optimistic updates for mutations

## API Client Architecture

### Centralized Client

**Core Client** (`client.ts`):
- Axios instance with base configuration
- Request interceptor: Adds JWT token
- Response interceptor: Handles 401 and token refresh
- Error handling and logging

**API Modules:**
- Modular API client functions
- Type-safe request/response types
- Timeout configuration per endpoint type

### Authentication Flow

1. **Login**: `POST /api/v1/auth/login`
2. **Store Token**: Save access token to localStorage
3. **Automatic Refresh**: On 401, refresh token via cookie
4. **Retry Request**: Retry original request with new token

## Routing

### React Router

**Route Structure:**
- `/`: Dashboard (main interface)
- `/graph`: Graph editor
- `/unity-dialogues`: Unity dialogue file management
- `/usage`: Usage statistics

**Navigation:**
- Programmatic navigation via `useNavigate()`
- Link components for declarative navigation
- Protected routes (if authentication required)

## UI/UX Patterns

### Design System

**Components:**
- Reusable components in `shared/`
- Consistent styling (CSS modules or theme)
- Responsive design

**User Feedback:**
- Toast notifications for actions
- Loading states for async operations
- Error boundaries for error handling
- Confirm dialogs for destructive actions

### Accessibility

- Keyboard navigation support
- Command palette (Cmd+K)
- Screen reader considerations
- Focus management

## Build and Deployment

### Development

- **Dev Server**: Vite dev server on port 3000
- **HMR**: Hot Module Replacement for fast updates
- **Proxy**: Proxies `/api` to backend on port 4243

### Production

- **Build**: `npm run build` → `frontend/dist/`
- **Optimization**: Code splitting, minification, tree-shaking
- **Static Assets**: Served by backend or separate web server

## Testing Strategy

### Unit Tests

- **Framework**: Vitest
- **Library**: React Testing Library
- **Location**: Co-located with components (`.test.tsx`)

### E2E Tests

- **Framework**: Playwright
- **Scope**: Full user flows
- **Location**: `e2e/` directory

## Performance Optimization

### Code Splitting

- **Route-based**: Each route loads independently
- **Component-based**: Large components lazy-loaded
- **Vite**: Automatic code splitting

### Asset Optimization

- **Images**: Optimized formats
- **Fonts**: Web font optimization
- **Bundling**: Vite optimizes bundle size

### Runtime Performance

- **React.memo**: Prevent unnecessary re-renders
- **useMemo/useCallback**: Memoize expensive computations
- **Virtual Scrolling**: For large lists (react-window)

## Security

### Client-Side Security

- **Token Storage**: Access tokens in localStorage (consider httpOnly cookies for production)
- **XSS Protection**: React escapes by default
- **CSRF Protection**: SameSite cookies
- **Input Validation**: Zod schemas for form validation

## Development Tools

### Debugging

- **React DevTools**: Component inspection
- **Redux DevTools**: Zustand store inspection (via middleware)
- **Browser DevTools**: Network, console, performance

### Code Quality

- **TypeScript**: Strict type checking
- **ESLint**: Code linting
- **Prettier**: Code formatting (if configured)

## Responsive UI and PWA (Epic 17)

The shell adapts below **1024px** viewport width (overlay drawers instead of fixed side columns) and individual panels/toolbars adapt to **container width** via `useNarrowInlineSize` and tokens in `frontend/src/theme/responsiveChrome.ts`.

**Full reference**: [Responsive UI and PWA](./responsive-ui.md) — thresholds, `Dashboard` narrow mode, graph toolbar tri-state, PWA manifest/workbox, tests, and pitfalls.

**Key hooks:**

| Hook | Role |
|------|------|
| `useViewportMode()` | `mobile` (&lt;768px), `tablet` (&lt;1024px), `desktop` |
| `useNarrowInlineSize(thresholdPx)` | Container-width narrow detection (`ResizeObserver`) |
| `useMobileShellKeyboardComfort` | Keyboard inset on narrow shell |

**PWA** (story 17.5): installable via `vite-plugin-pwa`; manifest at `frontend/public/manifest.webmanifest`; service worker disabled in dev; `/api` excluded from Workbox cache. Verify with `npm run test:e2e:pwa`.

## Future Considerations

### Potential Improvements

- **Server Components**: If migrating to React Server Components
- **Offline-first PWA**: Current PWA targets installability only; offline asset/API caching is intentionally not enabled
