/**
 * Story 2.14 FR35: Undo/Redo buttons in GraphEditorHeader.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { useGraphStore } from '../store/graphStore'
import { GraphEditorHeader } from '../components/graph/GraphEditorHeader'
import type { UseGraphToolbarReturn } from '../hooks/useGraphToolbar'
import {
  GRAPH_TOOLBAR_DROPDOWN_Z_INDEX,
  GRAPH_TOOL_FLOATING_PANEL_Z_INDEX,
} from '../components/graph/graphToolbarConstants'

function makeMockToolbar(overrides: Partial<UseGraphToolbarReturn> = {}): UseGraphToolbarReturn {
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
    showValidationPanel: false,
    setShowValidationPanel: () => {},
    showQualityLlmPanel: false,
    setShowQualityLlmPanel: () => {},
    showAiSlopPanel: false,
    setShowAiSlopPanel: () => {},
    showContextDroppingPanel: false,
    setShowContextDroppingPanel: () => {},
    showFlowSimulationPanel: false,
    setShowFlowSimulationPanel: () => {},
    showDialoguePreviewPanel: false,
    setShowDialoguePreviewPanel: () => {},
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
    autoLayoutDropdownRef: { current: null },
    actionsDropdownRef: { current: null },
    actionsDropdownBtnRef: { current: null },
    validationToolsDropdownRef: { current: null },
    canvasWrapperRef: { current: null },
    reactFlowInstance: null,
    handleAutoLayout: async () => {},
    handleOpenExportDialog: () => {},
    handleExportPNG: async () => {},
    handleExportSVG: async () => {},
    undo: () => useGraphStore.getState().undo(),
    redo: () => useGraphStore.getState().redo(),
    canUndoNow: false,
    canRedoNow: false,
    ...overrides,
  }
}

describe('GraphEditorHeader - Undo/Redo (Story 2.14)', () => {
  beforeEach(() => {
    useGraphStore.getState().resetGraph()
  })

  it('renders Undo and Redo buttons when canEditGraph is true', () => {
    const toolbar = makeMockToolbar()
    render(
      <GraphEditorHeader
        toolbar={toolbar}
        isLoadingDialogue={false}
        hasActiveDialogue={true}
        activeDialogueFilename="test.json"
        handleSave={async () => {}}
        onBatchTagApply={() => {}}
        handleBatchValidateSelection={() => {}}
        handleBatchDeleteSelection={() => {}}
        canEditGraph={true}
        isStandalone={false}
      />
    )
    expect(screen.getByTestId('btn-undo')).toBeInTheDocument()
    expect(screen.getByTestId('btn-redo')).toBeInTheDocument()
  })

  it('Undo button is disabled when undo stack is empty', () => {
    const toolbar = makeMockToolbar()
    render(
      <GraphEditorHeader
        toolbar={toolbar}
        isLoadingDialogue={false}
        hasActiveDialogue={true}
        activeDialogueFilename="test.json"
        handleSave={async () => {}}
        onBatchTagApply={() => {}}
        handleBatchValidateSelection={() => {}}
        handleBatchDeleteSelection={() => {}}
        canEditGraph={true}
        isStandalone={false}
      />
    )
    expect(screen.getByTestId('btn-undo')).toBeDisabled()
    expect(screen.getByTestId('btn-redo')).toBeDisabled()
  })

  it('Undo button is enabled after a mutation, Redo disabled; after undo Redo enabled', () => {
    const toolbar = makeMockToolbar()
    const props = {
      toolbar,
      isLoadingDialogue: false,
      hasActiveDialogue: true,
      activeDialogueFilename: 'test.json',
      handleSave: async () => {},
      onBatchTagApply: () => {},
      handleBatchValidateSelection: () => {},
      handleBatchDeleteSelection: () => {},
      canEditGraph: true,
      isStandalone: false,
    }
    const { rerender } = render(<GraphEditorHeader {...props} />)
    act(() => {
      useGraphStore.getState().addNode({
        id: 'n1',
        type: 'dialogueNode',
        position: { x: 0, y: 0 },
        data: { id: 'n1', speaker: '', line: '', choices: [] },
      })
    })
    rerender(<GraphEditorHeader {...props} />)
    expect(screen.getByTestId('btn-undo')).not.toBeDisabled()
    expect(screen.getByTestId('btn-redo')).toBeDisabled()

    act(() => {
      screen.getByTestId('btn-undo').click()
    })
    rerender(<GraphEditorHeader {...props} />)
    expect(screen.getByTestId('btn-redo')).not.toBeDisabled()
  })

  it('allows changing spacing mode from auto-layout dropdown', async () => {
    const setLayoutSpacingMode = vi.fn()
    const handleAutoLayout = vi.fn().mockResolvedValue(undefined)
    const toolbar = makeMockToolbar({
      setLayoutSpacingMode,
      handleAutoLayout,
      showAutoLayoutDropdown: true,
    })

    render(
      <GraphEditorHeader
        toolbar={toolbar}
        isLoadingDialogue={false}
        hasActiveDialogue={true}
        activeDialogueFilename="test.json"
        handleSave={async () => {}}
        onBatchTagApply={() => {}}
        handleBatchValidateSelection={() => {}}
        handleBatchDeleteSelection={() => {}}
        canEditGraph={true}
        isStandalone={false}
      />
    )

    const largeButton = screen.getByRole('option', { name: /large/i })
    largeButton.click()

    expect(setLayoutSpacingMode).toHaveBeenCalledWith('large')
    expect(handleAutoLayout).toHaveBeenCalledWith('TB')
  })

  it('keeps toolbar dropdowns above graph side and floating panels', () => {
    const toolbar = makeMockToolbar({
      showActionsDropdown: true,
      showDialoguePreviewPanel: true,
      showGameSystemsIntegrationPanel: true,
      showQualityLlmPanel: true,
    })

    render(
      <GraphEditorHeader
        toolbar={toolbar}
        isLoadingDialogue={false}
        hasActiveDialogue={true}
        activeDialogueTitle="Test"
        activeDialogueFilename="test.json"
        handleSave={async () => {}}
        onBatchTagApply={() => {}}
        handleBatchValidateSelection={() => {}}
        handleBatchDeleteSelection={() => {}}
        canEditGraph={true}
        isStandalone={false}
      />
    )

    const actionsMenu = screen.getByRole('menu')
    expect(GRAPH_TOOLBAR_DROPDOWN_Z_INDEX).toBeGreaterThan(
      GRAPH_TOOL_FLOATING_PANEL_Z_INDEX
    )
    expect(actionsMenu).toHaveStyle({
      zIndex: String(GRAPH_TOOLBAR_DROPDOWN_Z_INDEX),
    })
  })

  it('compresses disconnected warning noise into disconnected branches in the badge', () => {
    const toolbar = makeMockToolbar()
    useGraphStore.setState({
      ...useGraphStore.getState(),
      nodes: [
        {
          id: 'orphan-root',
          type: 'dialogueNode',
          position: { x: 0, y: 0 },
          data: { id: 'orphan-root', speaker: '', line: '', choices: [] },
        },
        {
          id: 'dangling-test',
          type: 'testNode',
          position: { x: 0, y: 0 },
          data: { id: 'dangling-test', test: 'Esprit:8' },
        },
      ],
      edges: [
        {
          id: 'orphan-edge',
          source: 'orphan-root',
          target: 'dangling-test',
          type: 'smoothstep',
          data: { edgeType: 'choice', choiceIndex: 0 },
        },
      ],
      validationErrors: [
        {
          type: 'orphan_node',
          node_id: 'orphan-root',
          message: 'Orphelin',
          severity: 'warning',
        },
        {
          type: 'unreachable_node',
          node_id: 'orphan-root',
          message: 'Inatteignable',
          severity: 'warning',
        },
        {
          type: 'unreachable_node',
          node_id: 'dangling-test',
          message: 'Inatteignable',
          severity: 'warning',
        },
      ],
    })

    render(
      <GraphEditorHeader
        toolbar={toolbar}
        isLoadingDialogue={false}
        hasActiveDialogue={true}
        activeDialogueFilename="test.json"
        handleSave={async () => {}}
        onBatchTagApply={() => {}}
        handleBatchValidateSelection={() => {}}
        handleBatchDeleteSelection={() => {}}
        canEditGraph={true}
        isStandalone={false}
      />
    )

    expect(screen.getByRole('button', { name: /1 branche déconnectée/i })).toBeInTheDocument()
    expect(screen.queryByText(/3 avertissements/i)).not.toBeInTheDocument()
  })
})
