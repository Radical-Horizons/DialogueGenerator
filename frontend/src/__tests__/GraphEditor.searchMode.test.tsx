import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import * as dialogueLoader from '../hooks/useDialogueLoader'
import * as graphToolbar from '../hooks/useGraphToolbar'
import * as batchOps from '../hooks/useBatchOperations'
import * as narrowHook from '../hooks/useNarrowInlineSize'
import { GraphEditor } from '../components/graph/GraphEditor'
import { makeMockGraphToolbar } from '../testFixtures/graphToolbar'

describe('GraphEditor - Search mode by container width', () => {
  it('renders canvas overlay search bar only in comfortable', () => {
    vi.spyOn(dialogueLoader, 'useDialogueLoader').mockReturnValue({
      selectedDialogue: null,
      setSelectedDialogue: () => {},
      isLoadingDialogue: false,
      activeDialogueFilename: 'test.json',
      activeDialogueTitle: 'Test',
      hasActiveDialogue: true,
      handleSave: async () => {},
      dialogueListRef: { current: null },
    })

    vi.spyOn(graphToolbar, 'useGraphToolbar').mockReturnValue(
      makeMockGraphToolbar({ showSearchBar: true })
    )
    vi.spyOn(batchOps, 'useBatchOperations').mockReturnValue({
      selectedNodeIdsToDelete: null,
      handleBatchDeleteSelection: () => {},
      handleConfirmBatchDelete: () => {},
      handleCancelBatchDelete: () => {},
      handleBatchTagSelection: () => {},
      handleBatchValidateSelection: async () => {},
      showValidationReportForSelection: false,
      setShowValidationReportForSelection: () => {},
    })

    // First call in GraphEditor: workspace measurement. Return "comfortable" (not narrow).
    vi.spyOn(narrowHook, 'useNarrowInlineSize').mockReturnValue({
      ref: () => {},
      isNarrow: false,
    })

    const qc = new QueryClient()
    render(
      <QueryClientProvider client={qc}>
        <GraphEditor mode="embedded" />
      </QueryClientProvider>
    )

    expect(screen.getByRole('search')).toBeInTheDocument()
  })
})

