import { describe, it, expect, vi, beforeEach } from 'vitest'
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

/**
 * Mocks `useNarrowInlineSize` for the tri-state toolbar (called twice):
 *  1) toolbar narrow (threshold 640 px) — `narrowToolbar`.
 *  2) compact desktop (threshold 1100 px) — `narrowCompact`.
 */
function mockNarrowSequence(narrowToolbar: boolean, narrowCompact: boolean): void {
  vi.spyOn(narrowHook, 'useNarrowInlineSize')
    .mockImplementationOnce(() => ({ ref: () => {}, isNarrow: narrowToolbar }) as NarrowHookReturn)
    .mockImplementationOnce(() => ({ ref: () => {}, isNarrow: narrowCompact }) as NarrowHookReturn)
}

describe('GraphEditorHeader - Desktop toolbar tri-state mode', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('desktop full: 1 ligne, flex-wrap nowrap, overflow visible, pas de structure 2 rangées', () => {
    mockNarrowSequence(false, false)

    render(
      <GraphEditorHeader
        toolbar={makeMockToolbar()}
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

    const root = screen.getByTestId('graph-editor-toolbar')
    expect(root.style.flexWrap).toBe('nowrap')

    const tools = screen.getByTestId('graph-editor-toolbar-tools')
    expect(tools.style.flexWrap).toBe('nowrap')
    expect(tools.style.overflowX).toBe('visible')
    expect(tools.style.flexDirection).toBe('row')
    expect(tools.dataset.graphToolbarCompactDesktop).toBe('false')

    expect(screen.queryByTestId('graph-toolbar-row-status')).toBeNull()
    expect(screen.queryByTestId('graph-toolbar-row-tools')).toBeNull()
  })

  it('desktop compact: 2 rangées explicites (status au-dessus de tools), labels courts pour Undo/Redo et icones', () => {
    mockNarrowSequence(false, true)

    render(
      <GraphEditorHeader
        toolbar={makeMockToolbar()}
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

    const tools = screen.getByTestId('graph-editor-toolbar-tools')
    expect(tools.style.flexDirection).toBe('column')
    expect(tools.dataset.graphToolbarCompactDesktop).toBe('true')

    const rowStatus = screen.getByTestId('graph-toolbar-row-status')
    const rowTools = screen.getByTestId('graph-toolbar-row-tools')
    expect(rowStatus).toBeInTheDocument()
    expect(rowTools).toBeInTheDocument()

    // Status doit apparaitre AVANT tools dans le DOM (DOCUMENT_POSITION_FOLLOWING = 0x04).
    const FOLLOWING = Node.DOCUMENT_POSITION_FOLLOWING
    expect(rowStatus.compareDocumentPosition(rowTools) & FOLLOWING).toBeTruthy()

    expect(screen.getByTestId('btn-undo')).toHaveTextContent('↩')
    expect(screen.getByTestId('btn-undo')).not.toHaveTextContent('Undo')
    expect(screen.getByTestId('btn-redo')).toHaveTextContent('↪')
    expect(screen.getByTestId('btn-redo')).not.toHaveTextContent('Redo')

    const autoLayout = screen.getByRole('button', { name: /auto-layout/i })
    expect(autoLayout).toHaveTextContent('📐')

    expect(screen.getByTestId('btn-actions-dropdown')).toHaveTextContent('⋯')

    expect(screen.getByTitle(/breakdown des coûts/i)).toHaveTextContent('💰')
  })

  it('narrow: layout grid (existant), pas de bascule compact desktop', () => {
    mockNarrowSequence(true, true)

    render(
      <GraphEditorHeader
        toolbar={makeMockToolbar()}
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

    const root = screen.getByTestId('graph-editor-toolbar')
    expect(root.dataset.graphToolbarNarrow).toBe('true')

    const tools = screen.getByTestId('graph-editor-toolbar-tools')
    // En narrow, on n'active pas le mode compact desktop.
    expect(tools.dataset.graphToolbarCompactDesktop).toBe('false')
    // En narrow, on rend 2 rangées (actions puis status/options) dans la zone tools.
    expect(screen.getByTestId('graph-toolbar-row-actions')).toBeInTheDocument()
    expect(screen.getByTestId('graph-toolbar-row-status')).toBeInTheDocument()
    // Les rangées desktop compact ne doivent pas apparaitre en narrow.
    expect(screen.queryByTestId('graph-toolbar-row-tools')).toBeNull()
  })
})
