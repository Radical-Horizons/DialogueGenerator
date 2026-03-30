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
    expect(getGddEntityHistory).toHaveBeenCalledWith('personnages', 'A', {
      includeSnapshots: true,
    })
  })

  it('affiche le diff et le snapshot pour une entrée sélectionnée', async () => {
    vi.mocked(getGddEntityHistory).mockResolvedValue({
      category: 'lieux',
      name: 'L',
      events: [
        {
          at: '2026-01-01',
          source: 'notion_sync',
          summary: 'v1',
          snapshot: { Nom: 'L', v: 1 },
          diff_from_previous: null,
        },
        {
          at: '2026-01-02',
          source: 'notion_sync',
          summary: 'v2',
          snapshot: { Nom: 'L', v: 2 },
          diff_from_previous: '--- avant\n+++ après\n@@ -1 +1 @@\n-v: 1\n+v: 2',
        },
      ],
      diff_hint: null,
      previous_snapshot: null,
      current_snapshot: null,
    })
    render(<GddEntityHistoryViewer categoryStem="lieux" entityName="L" />)
    await userEvent.click(screen.getByRole('button', { name: /Historique des modifications/i }))
    expect(await screen.findByText(/Diff vs version précédente/i)).toBeInTheDocument()
    expect(screen.getByText(/\+v: 2/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /2026-01-01/ }))
    expect(screen.getByText(/"v": 1/)).toBeInTheDocument()
  })
})
