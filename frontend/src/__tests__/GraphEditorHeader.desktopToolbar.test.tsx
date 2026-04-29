import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { UseGraphToolbarReturn } from '../hooks/useGraphToolbar'
import { GraphEditorHeader } from '../components/graph/GraphEditorHeader'
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
    undo: () => {},
    redo: () => {},
    canUndoNow: true,
    canRedoNow: true,
    ...overrides,
  }
}

describe('GraphEditorHeader - Desktop toolbar one-line + compact mode', () => {
  it('desktop: root/tools are nowrap and tools scroll horizontally instead of wrapping', () => {
    vi.spyOn(narrowHook, 'useNarrowInlineSize')
      // 1) toolbarRef: desktop (not narrow)
      .mockImplementationOnce(() => ({ ref: () => {}, isNarrow: false }) as NarrowHookReturn)
      // 2) compactToolsRef: not compact
      .mockImplementationOnce(() => ({ ref: () => {}, isNarrow: false }) as NarrowHookReturn)

    render(
      <GraphEditorHeader
        toolbar={makeMockToolbar()}
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

    const root = screen.getByTestId('graph-editor-toolbar')
    expect(root.style.flexWrap).toBe('nowrap')
    const tools = screen.getByTestId('graph-editor-toolbar-tools')
    expect(tools.style.flexWrap).toBe('nowrap')
    expect(tools.style.overflowX).toBe('auto')
  })

  it('desktop compact: uses short labels for Undo/Redo and icon-only Actions/Coûts/Auto-layout', () => {
    vi.spyOn(narrowHook, 'useNarrowInlineSize')
      // 1) toolbarRef: desktop (not narrow)
      .mockImplementationOnce(() => ({ ref: () => {}, isNarrow: false }) as NarrowHookReturn)
      // 2) compactToolsRef: compact
      .mockImplementationOnce(() => ({ ref: () => {}, isNarrow: true }) as NarrowHookReturn)

    render(
      <GraphEditorHeader
        toolbar={makeMockToolbar()}
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

    // Undo/Redo buttons still exist but text labels are shortened.
    expect(screen.getByTestId('btn-undo')).toHaveTextContent('↩')
    expect(screen.getByTestId('btn-undo')).not.toHaveTextContent('Undo')
    expect(screen.getByTestId('btn-redo')).toHaveTextContent('↪')
    expect(screen.getByTestId('btn-redo')).not.toHaveTextContent('Redo')

    // Auto-layout: icon-only in compact desktop (label absent).
    const autoLayout = screen.getByRole('button', { name: /auto-layout/i })
    expect(autoLayout).toHaveTextContent('📐')

    // Actions: icon-only when GraphActionsDropdown isNarrow=true.
    expect(screen.getByTestId('btn-actions-dropdown')).toHaveTextContent('⋯')

    // Coûts: icon-only.
    expect(screen.getByTitle(/breakdown des coûts/i)).toHaveTextContent('💰')
  })
})

