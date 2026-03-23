/**
 * Story 2.14 FR35: Undo/Redo buttons in GraphEditorHeader.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { useGraphStore } from '../store/graphStore'
import { GraphEditorHeader } from '../components/graph/GraphEditorHeader'
import type { UseGraphToolbarReturn } from '../hooks/useGraphToolbar'

function makeMockToolbar(overrides: Partial<UseGraphToolbarReturn> = {}): UseGraphToolbarReturn {
  return {
    showAutoLayoutDropdown: false,
    setShowAutoLayoutDropdown: () => {},
    showActionsDropdown: false,
    setShowActionsDropdown: () => {},
    showAIGenerationPanel: false,
    setShowAIGenerationPanel: () => {},
    showExportFormatDialog: false,
    setShowExportFormatDialog: () => {},
    showValidationPanel: false,
    setShowValidationPanel: () => {},
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
    canvasWrapperRef: { current: null },
    reactFlowInstance: null,
    handleAutoLayout: async () => {},
    handleOpenExportDialog: () => {},
    handleExportPNG: async () => {},
    handleExportSVG: async () => {},
    undo: () => useGraphStore.getState().undo(),
    redo: () => useGraphStore.getState().redo(),
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
    expect(screen.getByTestId('btn-undo')).toBeDisabled()
    expect(screen.getByTestId('btn-redo')).toBeDisabled()
  })

  it('Undo button is enabled after a mutation, Redo disabled; after undo Redo enabled', () => {
    const toolbar = makeMockToolbar()
    const props = {
      toolbar,
      isLoadingDialogue: false,
      hasActiveDialogue: true,
      activeDialogueTitle: 'Test',
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

    const largeButton = screen.getByRole('option', { name: /large/i })
    largeButton.click()

    expect(setLayoutSpacingMode).toHaveBeenCalledWith('large')
    expect(handleAutoLayout).toHaveBeenCalledWith('TB')
  })
})
