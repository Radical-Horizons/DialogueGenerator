import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ContextRelevancePanel } from './ContextRelevancePanel'

const mockGetNode = vi.fn()
const mockGetHistory = vi.fn()

vi.mock('../../api/llmUsage', () => ({
  getNodeContextRelevance: (...args: unknown[]) => mockGetNode(...args),
  getContextRelevanceHistory: (...args: unknown[]) => mockGetHistory(...args),
}))

const storeState = {
  documentId: 'd.json' as string | null,
  dialogueMetadata: {
    filename: 'd.json',
    title: '',
    node_count: 0,
    edge_count: 0,
  },
  selectedNodeId: 'NODE_1' as string | null,
}

vi.mock('../../store/graphStore', () => ({
  useGraphStore: (selector: (s: typeof storeState) => unknown) => selector(storeState),
}))

describe('ContextRelevancePanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    storeState.documentId = 'd.json'
    storeState.selectedNodeId = 'NODE_1'
  })

  it('affiche le score et l’avertissement si faible', async () => {
    mockGetNode.mockResolvedValue({
      dialogue_id: 'd.json',
      node_id: 'NODE_1',
      request_id: 'r1',
      score_percent: 12,
      breakdown_by_type: { characters: 10, locations: 5 },
      reflected_types: [],
      weak_types: ['characters', 'locations'],
      low_context_warning: true,
      low_threshold_percent: 30,
      method: 'keyword_overlap_v2',
      computation_ms: 2,
      computed_at: '2020-01-01T00:00:00+00:00',
      suggestions_hints: ['Enrichir les instructions'],
    })
    mockGetHistory.mockResolvedValue({
      entries: [],
      total_count: 0,
      dialogue_id: 'd.json',
    })

    render(<ContextRelevancePanel />)
    await waitFor(() => {
      expect(screen.getByTestId('context-relevance-score')).toBeInTheDocument()
    })
    expect(screen.getByTestId('context-relevance-warning')).toBeInTheDocument()
    expect(screen.getByText(/Enrichir les instructions/)).toBeInTheDocument()
    expect(screen.getByTestId('context-relevance-weak')).toHaveTextContent(/Peu ou pas détectés/)
  })

  it('affiche un score élevé sans bandeau d’avertissement', async () => {
    mockGetNode.mockResolvedValue({
      dialogue_id: 'd.json',
      node_id: 'NODE_1',
      score_percent: 82,
      breakdown_by_type: { other: 80 },
      reflected_types: ['other'],
      weak_types: [],
      low_context_warning: false,
      low_threshold_percent: 30,
      method: 'keyword_overlap_v2',
      computation_ms: 1,
      computed_at: '2020-01-01T00:00:00+00:00',
      suggestions_hints: [],
    })
    mockGetHistory.mockResolvedValue({
      entries: [],
      total_count: 0,
      dialogue_id: 'd.json',
    })

    render(<ContextRelevancePanel />)
    await waitFor(() => {
      expect(screen.getByTestId('context-relevance-score')).toBeInTheDocument()
    })
    expect(screen.queryByTestId('context-relevance-warning')).not.toBeInTheDocument()
    expect(screen.getByTestId('context-relevance-reflected')).toHaveTextContent(/Bien reflétés/)
  })

  it('affiche l’historique quand présent', async () => {
    mockGetNode.mockResolvedValue({
      dialogue_id: 'd.json',
      node_id: 'NODE_1',
      score_percent: 50,
      breakdown_by_type: {},
      reflected_types: [],
      weak_types: [],
      low_context_warning: false,
      low_threshold_percent: 30,
      method: 'keyword_overlap_v2',
      computation_ms: 1,
      computed_at: '2020-01-01T00:00:00+00:00',
      suggestions_hints: [],
    })
    mockGetHistory.mockResolvedValue({
      entries: [
        {
          request_id: 'a',
          node_id: 'NODE_1',
          timestamp: '2020-01-01T10:00:00+00:00',
          score_percent: 40,
          low_context_warning: false,
          breakdown_by_type: {},
        },
      ],
      total_count: 1,
      dialogue_id: 'd.json',
    })

    render(<ContextRelevancePanel />)
    await waitFor(() => {
      expect(screen.getByTestId('context-relevance-history-details')).toBeInTheDocument()
    })
    const historyBlock = screen.getByTestId('context-relevance-history-details')
    await userEvent.click(within(historyBlock).getByText(/Historique \(1\)/))
    await waitFor(() => {
      expect(within(historyBlock).getByTestId('context-relevance-history')).toBeInTheDocument()
    })
    expect(within(historyBlock).getByText(/req a/)).toBeInTheDocument()
  })

  it('traite record_present false comme absence de mesure (200)', async () => {
    mockGetNode.mockResolvedValue({
      record_present: false,
      dialogue_id: 'd.json',
      node_id: 'NODE_1',
      request_id: null,
      score_percent: 0,
      breakdown_by_type: {},
      reflected_types: [],
      weak_types: [],
      low_context_warning: false,
      low_threshold_percent: 30,
      method: 'none',
      computation_ms: 0,
      computed_at: '',
      suggestions_hints: [],
    })
    mockGetHistory.mockResolvedValue({
      entries: [],
      total_count: 0,
      dialogue_id: 'd.json',
    })
    render(<ContextRelevancePanel />)
    await waitFor(() => {
      expect(
        screen.getByText(/Aucune mesure pour ce nœud \(pas encore de génération LLM enregistrée\)/)
      ).toBeInTheDocument()
    })
    expect(screen.queryByTestId('context-relevance-score')).not.toBeInTheDocument()
  })

  it('affiche une erreur si l’API échoue (hors 404)', async () => {
    mockGetNode.mockRejectedValue(new Error('Erreur serveur simulée'))
    mockGetHistory.mockResolvedValue({
      entries: [],
      total_count: 0,
      dialogue_id: 'd.json',
    })

    render(<ContextRelevancePanel />)
    await waitFor(() => {
      expect(screen.getByText(/Erreur serveur simulée/)).toBeInTheDocument()
    })
  })
})
