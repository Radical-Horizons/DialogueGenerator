# State Management - Frontend

## Overview
The frontend uses **Zustand** for state management with multiple specialized stores.

## Store Architecture

### `contextStore.ts`
Manages context/GDD element selections.

**State:**
- `selections`: Current context selection (characters, locations, items, etc.)
- `selectedRegion`: Currently selected region
- `selectedSubLocations`: Selected sub-locations
- Element lists: `characters`, `locations`, `items`, `species`, `communities`

**Actions:**
- `setSelections()`: Set full selection state
- `setElementLists()`: Load available elements from API
- `toggleCharacter/Location/Item/Species/Community()`: Toggle element selection
- `setElementMode()`: Set element mode (full/excerpt)
- `getElementMode()`: Get element mode
- `isElementSelected()`: Check if element is selected
- `setRegion()`: Set selected region
- `toggleSubLocation()`: Toggle sub-location
- `applyLinkedElements()`: Apply linked elements
- `clearSelections()`: Clear all selections
- `restoreState()`: Restore saved state

### `generationStore.ts`
Manages dialogue generation state.

**State:**
- Generation parameters
- Generated variants
- Current generation status

**Actions:**
- Generation control (start, cancel, etc.)
- Variant management

### `graphStore.ts`
Manages graph editor state.

**State:**
- Graph nodes and edges
- Current selection
- Layout information

**Actions:**
- Graph manipulation
- Node/edge operations
- Layout calculations

**Graph save/sync (ADR-006):**  
Le store est la source de vérité du document (pas de mode draft/save). À chaque modification : mutation dans le store, journal local IndexedDB (par documentId), envoi vers le serveur en micro-batch 100 ms max avec **seq** monotone. UI statut : "Synced (seq …)" / "Offline, N changes queued" / "Error" ; pas de bouton "Sauvegarder". Détails : `_bmad-output/planning-artifacts/architecture/v10-architectural-decisions-adrs.md` (ADR-006).

**React Flow controlled (ADR-007):**  
Le canvas graphe utilise React Flow en **mode controlled** : les `nodes` et `edges` affichés proviennent uniquement du store (aucun `useNodesState` / `useEdgesState`). Les handlers `onNodesChange` / `onEdgesChange` ne font qu’appeler des actions du store. Le viewport (zoom/pan) reste en état local à React Flow. Une seule source de vérité pour le document affiché → cohérence autosave, undo/redo, synchro. Undo/redo (zundo) restaure l'état du store ; avec le canvas en controlled, l'affichage suit automatiquement. Détails : `_bmad-output/planning-artifacts/architecture/v10-architectural-decisions-adrs.md` (ADR-007).

### `authStore.ts`
Manages authentication state.

**State:**
- Current user
- Authentication status
- Token information

**Actions:**
- Login/logout
- Token refresh
- User info updates

### `flagsStore.ts`
Manages game mechanics flags.

**State:**
- Available flags
- Selected flags
- Flag combinations

**Actions:**
- Flag selection
- Validation
- Combination management

### `vocabularyStore.ts`
Manages vocabulary entries.

**State:**
- Vocabulary list
- Selected terms

**Actions:**
- Load vocabulary
- Search terms

### `narrativeGuidesStore.ts`
Manages narrative guides.

**State:**
- Available guides
- Selected guide

**Actions:**
- Load guides
- Guide selection

### `contextConfigStore.ts`
Manages context configuration.

**State:**
- Field definitions
- Configuration settings

**Actions:**
- Load config
- Update settings

### `generationActionsStore.ts`
Manages generation action history.

**State:**
- Action history
- Undo/redo stack

**Actions:**
- Record actions
- Undo/redo

### `syncStore.ts`
Manages synchronization state.

**State:**
- Sync status
- Pending changes

**Actions:**
- Sync operations
- Conflict resolution

### `commandPaletteStore.ts`
Manages command palette state.

**State:**
- Available commands
- Command history

**Actions:**
- Command execution
- History management

## Data Flow

1. **User Action** → Component
2. **Component** → Store action
3. **Store** → API call (via React Query or direct)
4. **API Response** → Store update
5. **Store Update** → Component re-render

## Integration with React Query

Some stores integrate with React Query (`@tanstack/react-query`) for:
- Automatic caching
- Background refetching
- Optimistic updates
- Error handling

## State Persistence

- **LocalStorage**: Auth tokens, user preferences, positions des nœuds (graph) par fichier. Pour le graphe, les positions sont fusionnées avec localStorage **uniquement au chargement** ; en cours de session, la source pour les positions est le store.
- **Session Storage**: Temporary UI state
- **URL State**: Some filters/selections in query params
- **IndexedDB (graph, ADR-006)**: Journal local par document pour résilience (fermeture onglet, crash) ; dernier snapshot + mutations en attente, sync avec serveur au chargement
