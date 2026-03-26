import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GddEntityHistoryViewer } from './GddEntityHistoryViewer'

vi.mock('../../api/gddContextStale', () => ({
  getGddEntityHistory: vi.fn(),
}))

import { getGddEntityHistory } from '../../api/gddContextStale'

describe('GddEntityHistoryViewer', () => {
  beforeEach(() => {
    vi.mocked(getGddEntityHistory).mockReset()
  })

  it('affiche la timeline après ouverture', async () => {
    vi.mocked(getGddEntityHistory).mockResolvedValue({
      category: 'personnages',
      name: 'A',
      events: [{ at: '2026-01-01', source: 'notion_sync', summary: 'ok' }],
      diff_hint: null,
      previous_snapshot: null,
      current_snapshot: null,
    })
    render(<GddEntityHistoryViewer categoryStem="personnages" entityName="A" />)
    await userEvent.click(screen.getByRole('button', { name: /Historique des modifications/i }))
    expect(await screen.findByText(/notion_sync/)).toBeInTheDocument()
    expect(getGddEntityHistory).toHaveBeenCalledWith('personnages', 'A')
  })
})
