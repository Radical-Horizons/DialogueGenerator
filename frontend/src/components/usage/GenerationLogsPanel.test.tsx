/**
 * Tests unitaires pour GenerationLogsPanel (Story 1.15).
 * Rendu liste vide, rendu avec entrées, clic sur entrée affiche détail, résumé.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { GenerationLogsPanel } from './GenerationLogsPanel'
import type { GenerationLogsResponse } from '../../api/llmUsage'

vi.mock('../../api/llmUsage', () => ({
  getGenerationLogs: vi.fn(),
}))

import { getGenerationLogs } from '../../api/llmUsage'
const mockGetGenerationLogs = getGenerationLogs as ReturnType<typeof vi.fn>

function makeQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } })
}

function renderPanel(dialogueId: string) {
  const qc = makeQueryClient()
  return render(
    <QueryClientProvider client={qc}>
      <GenerationLogsPanel dialogueId={dialogueId} />
    </QueryClientProvider>
  )
}

const emptyResponse: GenerationLogsResponse = {
  entries: [],
  total_count: 0,
  total_cost_eur: 0,
}

const twoEntriesResponse: GenerationLogsResponse = {
  entries: [
    {
      request_id: 'req_1',
      timestamp: '2026-03-06T12:00:00.000Z',
      node_id: 'NODE_1',
      model_name: 'gpt-5.6-terra',
      prompt_tokens: 100,
      completion_tokens: 50,
      total_tokens: 150,
      estimated_cost: 0.001,
      cost_eur: 0.00092,
      duration_ms: 500,
      success: true,
      prompt: 'System: Write.',
      response: '{"node": {}}',
    },
    {
      request_id: 'req_2',
      timestamp: '2026-03-06T11:00:00.000Z',
      node_id: 'NODE_2',
      model_name: 'mistral-small',
      prompt_tokens: 80,
      completion_tokens: 40,
      total_tokens: 120,
      estimated_cost: 0.0008,
      cost_eur: 0.000736,
      duration_ms: 300,
      success: false,
      error_message: 'API Error',
    },
  ],
  total_count: 2,
  total_cost_eur: 0.001656,
}

describe('GenerationLogsPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('affiche un message quand dialogueId est vide', () => {
    renderPanel('')
    expect(screen.getByText(/Sélectionnez un dialogue/)).toBeInTheDocument()
  })

  it('affiche liste vide quand aucun log', async () => {
    mockGetGenerationLogs.mockResolvedValue(emptyResponse)
    renderPanel('my_dialogue')
    await waitFor(() => {
      expect(mockGetGenerationLogs).toHaveBeenCalledWith('my_dialogue', expect.any(Object))
    })
    await waitFor(() => {
      expect(screen.getByText(/Aucun log pour cette période/)).toBeInTheDocument()
    })
  })

  it('affiche N entrées et résumé X générations, Y€ total', async () => {
    mockGetGenerationLogs.mockResolvedValue(twoEntriesResponse)
    renderPanel('diag_1')
    await waitFor(() => {
      expect(screen.getByText(/2 générations/)).toBeInTheDocument()
    })
    expect(screen.getByText(/total/)).toBeInTheDocument()
    expect(screen.getByText('NODE_1')).toBeInTheDocument()
    expect(screen.getByText('NODE_2')).toBeInTheDocument()
    expect(screen.getByText('Succès')).toBeInTheDocument()
    expect(screen.getByText('Échec')).toBeInTheDocument()
  })

  it('clic sur une ligne affiche le détail (prompt, réponse)', async () => {
    mockGetGenerationLogs.mockResolvedValue(twoEntriesResponse)
    renderPanel('diag_1')
    await waitFor(() => {
      expect(screen.getByText('NODE_1')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByText('NODE_1'))
    await waitFor(() => {
      expect(screen.getByText('System: Write.')).toBeInTheDocument()
      expect(screen.getByText(/"node"/)).toBeInTheDocument()
    })
  })

  it('boutons Exporter JSON et CSV présents et désactivés quand liste vide', async () => {
    mockGetGenerationLogs.mockResolvedValue(emptyResponse)
    renderPanel('diag_1')
    await waitFor(() => {
      expect(screen.getByText('Exporter JSON')).toBeInTheDocument()
    })
    expect(screen.getByText('Exporter JSON')).toBeDisabled()
    expect(screen.getByText('Exporter CSV')).toBeDisabled()
  })

  it('Exporter JSON et CSV sont activés quand des entrées sont présentes', async () => {
    mockGetGenerationLogs.mockResolvedValue(twoEntriesResponse)
    renderPanel('diag_1')
    await waitFor(() => {
      expect(screen.getByText('NODE_1')).toBeInTheDocument()
    })
    expect(screen.getByText('Exporter JSON')).not.toBeDisabled()
    expect(screen.getByText('Exporter CSV')).not.toBeDisabled()
  })
})
