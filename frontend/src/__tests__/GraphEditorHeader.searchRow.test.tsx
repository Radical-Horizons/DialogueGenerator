import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { UseGraphToolbarReturn } from '../hooks/useGraphToolbar'
import { GraphEditorHeader } from '../components/graph/GraphEditorHeader'
import { useGraphStore } from '../store/graphStore'
import * as narrowHook from '../hooks/useNarrowInlineSize'

type NarrowHookReturn = ReturnType<typeof narrowHook.useNarrowInlineSize>

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
    canUndoNow: false,
    canRedoNow: false,
    ...overrides,
  }
}

describe('GraphEditorHeader - SearchRow', () => {
  it('renders SearchRow when showSearchBar is true and hides legacy search button', () => {
    vi.spyOn(narrowHook, 'useNarrowInlineSize')
      // 1) toolbarRef: narrow -> active SearchRow layout
      .mockImplementationOnce(() => ({ ref: () => {}, isNarrow: true }) as NarrowHookReturn)
      // 2) compactToolsRef: irrelevant for this test
      .mockImplementationOnce(() => ({ ref: () => {}, isNarrow: false }) as NarrowHookReturn)
    const toolbar = makeMockToolbar({ showSearchBar: true })
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

    expect(screen.getByRole('search')).toBeInTheDocument()
    expect(screen.queryByTestId('btn-search-graph')).not.toBeInTheDocument()
  })
})

