/**
 * Régression : après « Valider lore (explicite) », le panneau doit s’afficher même si
 * validationErrors est vide (résumé seul — ex. aucune contradiction).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { GraphEditor } from '../components/graph/GraphEditor'
import { useGraphStore } from '../store/graphStore'
import type { UseGraphToolbarReturn } from '../hooks/useGraphToolbar'

vi.mock('../components/graph/GraphCanvas', () => ({
  GraphCanvas: () => React.createElement('div', { 'data-testid': 'graph-canvas' }),
}))

vi.mock('../components/graph/AIGenerationPanel', () => ({
  AIGenerationPanel: () => null,
}))

vi.mock('../components/graph/DeleteNodeConfirmModal', () => ({
  DeleteNodeConfirmModal: () => null,
}))

vi.mock('../components/shared', () => ({
  useToast: () => vi.fn(),
  SaveStatusIndicator: () => React.createElement('div', { 'data-testid': 'save-status-indicator' }),
  ConfirmDialog: () => null,
  Badge: ({ children }: { children: React.ReactNode }) => React.createElement('span', null, children),
}))

vi.mock('../utils/graphExport', () => ({
  exportGraphToPNG: vi.fn(),
  exportGraphToSVG: vi.fn(),
}))

vi.mock('../hooks/useKeyboardShortcuts', () => ({
  useKeyboardShortcuts: () => undefined,
}))

vi.mock('../components/unityDialogues/UnityDialogueList', () => ({
  UnityDialogueList: React.forwardRef(function UnityDialogueListMock(_props, ref) {
    React.useImperativeHandle(ref, () => ({ refresh: () => undefined }))
    return React.createElement('div', { 'data-testid': 'unity-dialogue-list' })
  }),
}))

const mockToolbar = vi.hoisted((): UseGraphToolbarReturn => {
  const nullRef = { current: null }
  return {
    showAutoLayoutDropdown: false,
    setShowAutoLayoutDropdown: () => {},
    showActionsDropdown: false,
    setShowActionsDropdown: () => {},
    showValidationToolsDropdown: false,
    setShowValidationToolsDropdown: () => {},
    showAIGenerationPanel: false,
    setShowAIGenerationPanel: () => {},
    showExportFormatDialog: false,
    setShowExportFormatDialog: () => {},
    showValidationPanel: true,
    setShowValidationPanel: () => {},
    showQualityLlmPanel: false,
    setShowQualityLlmPanel: () => {},
    showAiSlopPanel: false,
    setShowAiSlopPanel: () => {},
    showContextDroppingPanel: false,
    setShowContextDroppingPanel: () => {},
    showFlowSimulationPanel: false,
    setShowFlowSimulationPanel: () => {},
    showSchemaValidationPanel: false,
    schemaValidationLoading: false,
    schemaValidationIsValid: true,
    schemaValidationErrors: [],
    schemaValidationErrorCount: 0,
    handleToggleSchemaValidation: () => {},
    handleSchemaErrorClick: () => {},
    showCostBreakdown: false,
    setShowCostBreakdown: () => {},
    showShortcutsTooltip: false,
    setShowShortcutsTooltip: () => {},
    showSearchBar: false,
    setShowSearchBar: () => {},
    showJumpToNodeModal: false,
    setShowJumpToNodeModal: () => {},
    showFiltersPanel: false,
    setShowFiltersPanel: () => {},
    layoutDirection: 'TB',
    layoutSpacingMode: 'normal',
    setLayoutSpacingMode: () => {},
    autoLayoutDropdownRef: nullRef,
    actionsDropdownRef: nullRef,
    actionsDropdownBtnRef: nullRef,
    validationToolsDropdownRef: nullRef,
    canvasWrapperRef: nullRef,
    reactFlowInstance: null,
    handleAutoLayout: async () => {},
    handleOpenExportDialog: () => {},
    handleExportPNG: async () => {},
    handleExportSVG: async () => {},
    undo: () => {},
    redo: () => {},
    canUndoNow: false,
    canRedoNow: false,
  }
})

vi.mock('../hooks/useGraphToolbar', () => ({
  useGraphToolbar: () => mockToolbar,
}))

vi.mock('../hooks/useDialogueLoader', () => ({
  useDialogueLoader: () => ({
    selectedDialogue: null,
    setSelectedDialogue: vi.fn(),
    isLoadingDialogue: false,
    activeDialogueFilename: 'test-dialogue.json',
    activeDialogueTitle: 'Test',
    hasActiveDialogue: true,
    handleSave: async () => {},
    dialogueListRef: { current: { refresh: vi.fn() } },
  }),
}))

const getUnityDialogueMock = vi.fn()
vi.mock('../api/unityDialogues', () => ({
  getUnityDialogue: (...args: unknown[]) => getUnityDialogueMock(...args),
}))

const baseGraphStoreState = useGraphStore.getState()

describe('GraphEditor — panneau validation + résumé lore seul', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useGraphStore.setState({ ...baseGraphStoreState }, true)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('affiche GraphValidationPanel quand loreExplicitValidationSummary est défini sans erreurs', () => {
    useGraphStore.setState({
      nodes: [
        {
          id: 'n1',
          type: 'dialogueNode',
          position: { x: 0, y: 0 },
          data: { id: 'n1', displayName: 'A', line: 'Hello' },
        },
      ],
      edges: [],
      validationErrors: [],
      loreExplicitValidationSummary: 'Aucune contradiction lore explicite (1 nœud dialogue analysé)',
    })

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={queryClient}>
        <GraphEditor />
      </QueryClientProvider>
    )

    expect(screen.getByTestId('lore-explicit-summary')).toBeInTheDocument()
    expect(screen.getByText(/Contradictions lore/)).toBeInTheDocument()
  })
})
