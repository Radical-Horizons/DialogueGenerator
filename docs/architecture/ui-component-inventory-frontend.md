# UI Component Inventory - Frontend

## Component Organization

Components are organized by feature domain in `frontend/src/components/`.

## Component Categories

### Authentication (`auth/`)
- **LoginForm.tsx**: User login form with email/password

### Configuration (`config/`)
- **UnityConfigDialog.tsx**: Configuration dialog for Unity export settings

### Context Selection (`context/`)
- **ContextSelector.tsx**: Main context selection interface
- **ContextList.tsx**: List view of context elements
- **ContextDetail.tsx**: Detailed view of selected context element
- **SelectedContextSummary.tsx**: Summary of selected context
- **RegionSelector.tsx**: Region selection component
- **ContinuityTab.tsx**: Continuity management tab

### Dialogue Generation (`generation/`)
- **GenerationPanel.tsx**: Main generation interface
- **GenerationOptionsModal.tsx**: Generation options configuration
- **ContextFieldSelector.tsx**: Field selection for context
- **DialogueStructureWidget.tsx**: Dialogue structure configuration
- **EstimatedPromptPanel.tsx**: Prompt estimation display
- **PromptsTab.tsx**: Prompt preview and editing
- **StructuredPromptView.tsx**: Structured prompt visualization
- **SystemPromptEditor.tsx**: System prompt editor
- **SceneSelectionWidget.tsx**: Scene selection interface
- **UnityDialogueEditor.tsx**: Unity dialogue node editor
- **UnityDialogueViewer.tsx**: Unity dialogue viewer
- **GraphView.tsx**: Graph visualization
- **InGameFlagsModal.tsx**: Game flags selection modal
- **InGameFlagsSummary.tsx**: Selected flags summary
- **ReasoningTraceViewer.tsx**: LLM reasoning trace viewer
- **VocabularyGuidesTab.tsx**: Vocabulary guides interface

### Graph Editor (`graph/`)
- **GraphEditor.tsx**: Main graph editor component
- **GraphCanvas.tsx**: Graph canvas with ReactFlow
- **NodeEditorPanel.tsx**: Node editing panel
- **ChoiceEditor.tsx**: Choice editing interface
- **AIGenerationPanel.tsx**: AI-assisted generation panel
- **nodes/DialogueNode.tsx**: Dialogue node component
- **nodes/EndNode.tsx**: End node component
- **nodes/TestNode.tsx**: Test node component

### Layout (`layout/`)
- **MainLayout.tsx**: Main application layout
- **Dashboard.tsx**: Dashboard page
- **Header.tsx**: Application header

### Shared Components (`shared/`)
- **ActionBar.tsx**: Action toolbar
- **Combobox.tsx**: Combobox input component
- **CommandPalette.tsx**: Command palette (Cmd+K)
- **ConfirmDialog.tsx**: Confirmation dialog
- **ContextSummaryChips.tsx**: Context summary chips
- **ErrorBoundary.tsx**: React error boundary
- **FormField.tsx**: Form field wrapper
- **KeyboardShortcutsHelp.tsx**: Keyboard shortcuts help
- **ResizablePanels.tsx**: Resizable panel layout
- **SaveStatusIndicator.tsx**: Save status indicator
- **Select.tsx**: Select dropdown component
- **Tabs.tsx**: Tab component
- **Toast.tsx**: Toast notification
- **Tooltip.tsx**: Tooltip component

### Unity Dialogues (`unityDialogues/`)
- **UnityDialoguesPage.tsx**: Unity dialogues list page
- **UnityDialogueList.tsx**: Dialogue file list
- **UnityDialogueItem.tsx**: Dialogue file item
- **UnityDialogueDetails.tsx**: Dialogue file details

### Usage Tracking (`usage/`)
- **UsageDashboard.tsx**: Usage statistics dashboard
- **UsageStatsCard.tsx**: Usage statistics card
- **UsageStatsModal.tsx**: Detailed usage modal
- **UsageHistoryTable.tsx**: Usage history table

## Component Patterns

### State Management
- Components use Zustand stores for global state
- Local state via React hooks for component-specific state
- React Query for server state caching

### Styling
- CSS modules or inline styles (to be verified)
- Theme system via `theme.ts`

### Testing
- Components with `.test.tsx` files use Vitest + React Testing Library
- Test files co-located with components

### Type Safety
- All components use TypeScript
- Props typed with interfaces
- API types in `types/api.ts`

## Component Hierarchy

```
MainLayout
├── Header
├── Dashboard
│   ├── ContextSelector
│   │   ├── ContextList
│   │   ├── ContextDetail
│   │   └── SelectedContextSummary
│   ├── GenerationPanel
│   │   ├── ContextFieldSelector
│   │   ├── SceneSelectionWidget
│   │   ├── SystemPromptEditor
│   │   ├── PromptsTab
│   │   └── UnityDialogueEditor
│   └── GraphEditor
│       ├── GraphCanvas
│       └── NodeEditorPanel
└── UnityDialoguesPage
    └── UnityDialogueList
```

## Reusable Components

Most reusable components are in `shared/`:
- Form components (FormField, Select, Combobox)
- Feedback components (Toast, ConfirmDialog)
- Layout components (ResizablePanels, Tabs)
- Utility components (CommandPalette, ErrorBoundary)
