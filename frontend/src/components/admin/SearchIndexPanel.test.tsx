/**
 * Tests SearchIndexPanel (Story 8.6).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import * as dialogueSearchAPI from '../../api/dialogueSearch'
import { SearchIndexPanel } from './SearchIndexPanel'

vi.mock('../../api/dialogueSearch', () => ({
  getDialogueSearchStats: vi.fn(),
  startDialogueReindex: vi.fn(),
}))

const mockStats = vi.mocked(dialogueSearchAPI.getDialogueSearchStats)
const mockReindex = vi.mocked(dialogueSearchAPI.startDialogueReindex)

describe('SearchIndexPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockStats.mockResolvedValue({
      indexed_count: 12,
      last_rebuild_at: '2026-08-04T00:00:00+00:00',
      last_search_ms: 4.2,
      rebuild_status: 'done',
      rebuild_error: null,
      index_bytes: 4096,
    })
    mockReindex.mockResolvedValue({ status: 'running' })
  })

  it('affiche les stats et lance une réindexation', async () => {
    const user = userEvent.setup()
    render(<SearchIndexPanel />)
    await waitFor(() => {
      expect(screen.getByTestId('search-index-stats')).toBeInTheDocument()
    })
    expect(screen.getByText('12')).toBeInTheDocument()
    await user.click(screen.getByTestId('search-index-reindex'))
    await waitFor(() => {
      expect(mockReindex).toHaveBeenCalled()
    })
  })
})
