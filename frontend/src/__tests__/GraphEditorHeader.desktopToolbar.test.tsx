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
 * Mocks `useNarrowInlineSize` for the toolbar narrow threshold.
 */
function mockNarrowToolbar(narrowToolbar: boolean): void {
  vi.spyOn(narrowHook, 'useNarrowInlineSize')
    .mockImplementationOnce(() => ({ ref: () => {}, isNarrow: narrowToolbar }) as NarrowHookReturn)
}

describe('GraphEditorHeader - Desktop toolbar density', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('desktop full: 1 ligne, flex-wrap nowrap, overflow visible, pas de structure 2 rangées', () => {
    mockNarrowToolbar(false)

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

  it('desktop large: conserve la toolbar confortable avec labels, même si la zone outils est spacieuse', () => {
    mockNarrowToolbar(false)

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
    expect(tools.style.flexDirection).toBe('row')
    expect(tools.dataset.graphToolbarCompactDesktop).toBe('false')
    expect(screen.queryByTestId('graph-toolbar-row-status')).toBeNull()
    expect(screen.queryByTestId('graph-toolbar-row-tools')).toBeNull()

    expect(screen.getByRole('button', { name: 'Annuler' })).toHaveTextContent('↩')
    expect(screen.getByRole('button', { name: 'Annuler' })).not.toHaveTextContent('Undo')
    expect(screen.getByRole('button', { name: 'Refaire' })).toHaveTextContent('↪')
    expect(screen.getByRole('button', { name: 'Refaire' })).not.toHaveTextContent('Redo')

    const autoLayout = screen.getByRole('button', { name: /auto-layout/i })
    expect(autoLayout).toHaveTextContent('📐')
    expect(autoLayout).toHaveTextContent('normal')
    expect(autoLayout).not.toHaveTextContent('Auto-layout')

    expect(screen.getByTestId('btn-actions-dropdown')).toHaveTextContent('Actions')
    expect(screen.getByTestId('btn-quality-dropdown')).toHaveTextContent('Qualités')
    expect(screen.queryByTitle(/breakdown des coûts/i)).toBeNull()

    const qualityDropdown = screen.getByTestId('btn-quality-dropdown')
    const graphHealthBadge = screen.getByTestId('graph-health-badge')
    expect(qualityDropdown.compareDocumentPosition(graphHealthBadge) & Node.DOCUMENT_POSITION_FOLLOWING)
      .toBeTruthy()
  })

  it('narrow: layout grid (existant), sans état compact desktop intermédiaire', () => {
    mockNarrowToolbar(true)

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
    // En narrow, on n'active pas un état compact desktop séparé.
    expect(tools.dataset.graphToolbarCompactDesktop).toBe('false')
    // En narrow, on rend 2 rangées (actions puis status/options) dans la zone tools.
    expect(screen.getByTestId('graph-toolbar-row-actions')).toBeInTheDocument()
    expect(screen.getByTestId('graph-toolbar-row-status')).toBeInTheDocument()
    // Les rangées de l'ancien compact desktop ne doivent pas apparaitre en narrow.
    expect(screen.queryByTestId('graph-toolbar-row-tools')).toBeNull()
  })
})
