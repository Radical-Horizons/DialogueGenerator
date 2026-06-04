import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import * as dialogueLoader from '../hooks/useDialogueLoader'
import * as graphToolbar from '../hooks/useGraphToolbar'
import * as batchOps from '../hooks/useBatchOperations'
import * as narrowHook from '../hooks/useNarrowInlineSize'
import { GraphEditor } from '../components/graph/GraphEditor'

type NarrowHookReturn = ReturnType<typeof narrowHook.useNarrowInlineSize>

describe('GraphEditor - Search mode by container width', () => {
  it('renders canvas overlay search bar only in comfortable', () => {
    vi.spyOn(dialogueLoader, 'useDialogueLoader').mockReturnValue({
      setSelectedDialogue: () => {},
      isLoadingDialogue: false,
      activeDialogueFilename: 'test.json',
      activeDialogueTitle: 'Test',
      hasActiveDialogue: true,
      handleSave: async () => {},
      dialogueListRef: { current: null },
    } satisfies ReturnType<typeof dialogueLoader.useDialogueLoader> as ReturnType<
      typeof dialogueLoader.useDialogueLoader
    >)

    const toolbarState = {
      showValidationPanel: false,
      showCostBreakdown: false,
      setShowCostBreakdown: () => {},
      showAIGenerationPanel: false,
      setShowAIGenerationPanel: () => {},
      showExportFormatDialog: false,
      setShowExportFormatDialog: () => {},
      showSearchBar: true,
      setShowSearchBar: () => {},
      showJumpToNodeModal: false,
      setShowJumpToNodeModal: () => {},
      showFiltersPanel: false,
      setShowFiltersPanel: () => {},
      actionsDropdownBtnRef: { current: null },
      reactFlowInstance: null,
      handleExportPNG: async () => {},
      handleExportSVG: async () => {},
    }
    vi.spyOn(graphToolbar, 'useGraphToolbar').mockReturnValue(
      toolbarState satisfies ReturnType<typeof graphToolbar.useGraphToolbar> as ReturnType<
        typeof graphToolbar.useGraphToolbar
      >
    )
    vi.spyOn(batchOps, 'useBatchOperations').mockReturnValue({
      selectedNodeIdsToDelete: null,
      handleBatchDeleteSelection: () => {},
      handleConfirmBatchDelete: () => {},
      handleCancelBatchDelete: () => {},
      handleBatchTagSelection: () => {},
      handleBatchValidateSelection: () => {},
      showValidationReportForSelection: false,
      setShowValidationReportForSelection: () => {},
    } satisfies ReturnType<typeof batchOps.useBatchOperations> as ReturnType<
      typeof batchOps.useBatchOperations
    >)

    // First call in GraphEditor: workspace measurement. Return "comfortable" (not narrow).
    vi.spyOn(narrowHook, 'useNarrowInlineSize').mockReturnValue({
      ref: () => {},
      isNarrow: false,
    } as NarrowHookReturn)

    const qc = new QueryClient()
    render(
      <QueryClientProvider client={qc}>
        <GraphEditor mode="embedded" />
      </QueryClientProvider>
    )

    expect(screen.getByRole('search')).toBeInTheDocument()
  })
})

