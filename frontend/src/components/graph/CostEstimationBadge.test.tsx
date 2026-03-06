/**
 * Tests unitaires pour CostEstimationBadge (Story 1.11 — M4).
 * Couvre : idle, loading, success, error, warning 90%, warning 100%,
 *          comparaison inter-providers (AC #3), breakdown expandable (AC #4),
 *          recalcul auto debounce (AC #2), callback onBudgetExceeded (AC #5).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { CostEstimationBadge } from './CostEstimationBadge'
import type { EstimateCostRequest, EstimateCostResponse } from '../../types/graph'

vi.mock('../../api/graph', () => ({
  estimateCost: vi.fn(),
}))
vi.mock('../../api/costs', () => ({
  getBudget: vi.fn(),
}))

import { estimateCost } from '../../api/graph'
import { getBudget } from '../../api/costs'

const mockEstimateCost = estimateCost as ReturnType<typeof vi.fn>
const mockGetBudget = getBudget as ReturnType<typeof vi.fn>

const baseRequest: EstimateCostRequest = {
  parent_node_id: 'NODE_1',
  parent_node_content: { id: 'NODE_1', speaker: 'PNJ', line: 'Bonjour.' },
  user_instructions: 'Continue.',
  context_selections: {},
  generate_all_choices: false,
  llm_model_identifier: 'gpt-4o',
}

const baseResponse: EstimateCostResponse = {
  estimated_cost_eur: 0.0023,
  prompt_tokens: 120,
  completion_tokens: 350,
  model_id: 'gpt-4o',
  provider: 'openai',
  alternative_provider: 'mistral',
  alternative_model_id: 'mistral-small-latest',
  alternative_cost_eur: 0.0001,
  cost_difference_pct: -95.7,
}

const budgetOk = { amount: 0.01, quota: 1.0 }
const budget90 = { amount: 0.91, quota: 1.0 }
const budget100 = { amount: 0.99, quota: 1.0 }

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers()
})

describe('CostEstimationBadge', () => {
  it('rend le bouton "Estimer le coût" à l\'état idle', () => {
    mockEstimateCost.mockResolvedValue(baseResponse)
    mockGetBudget.mockResolvedValue(budgetOk)
    render(<CostEstimationBadge estimateRequest={baseRequest} />)
    expect(screen.getByRole('button', { name: /estimer le coût/i })).toBeInTheDocument()
  })

  it('retourne null si estimateRequest est null', () => {
    const { container } = render(<CostEstimationBadge estimateRequest={null} />)
    expect(container.firstChild).toBeNull()
  })

  it('affiche "Estimation…" pendant le chargement', async () => {
    let resolve: (v: EstimateCostResponse) => void
    mockEstimateCost.mockReturnValue(new Promise(r => { resolve = r }))
    mockGetBudget.mockResolvedValue(budgetOk)
    render(<CostEstimationBadge estimateRequest={baseRequest} />)
    // Le debounce déclenche automatiquement l'estimation
    await act(async () => { vi.advanceTimersByTime(400) })
    expect(screen.getByRole('button', { name: /estimation/i })).toBeDisabled()
    resolve!(baseResponse)
  })

  it('affiche le coût, tokens et provider après succès', async () => {
    mockEstimateCost.mockResolvedValue(baseResponse)
    mockGetBudget.mockResolvedValue(budgetOk)
    render(<CostEstimationBadge estimateRequest={baseRequest} />)
    await act(async () => { vi.advanceTimersByTime(400) })
    await waitFor(() => {
      expect(screen.getByText(/0\.0023/)).toBeInTheDocument()
      expect(screen.getByText(/openai/)).toBeInTheDocument()
    })
  })

  it('affiche le message d\'erreur en cas d\'échec API', async () => {
    mockEstimateCost.mockRejectedValue(new Error('Réseau indisponible'))
    render(<CostEstimationBadge estimateRequest={baseRequest} />)
    await act(async () => { vi.advanceTimersByTime(400) })
    await waitFor(() => {
      expect(screen.getByText('Réseau indisponible')).toBeInTheDocument()
    })
  })

  it('AC #3 — affiche la comparaison inter-providers', async () => {
    mockEstimateCost.mockResolvedValue(baseResponse)
    mockGetBudget.mockResolvedValue(budgetOk)
    render(<CostEstimationBadge estimateRequest={baseRequest} />)
    await act(async () => { vi.advanceTimersByTime(400) })
    await waitFor(() => {
      expect(screen.getByText(/mistral.*-95\.7%/i)).toBeInTheDocument()
    })
  })

  it('AC #4 — affiche le lien "Voir détail" pour un batch et déplie le breakdown', async () => {
    const batchResponse: EstimateCostResponse = {
      ...baseResponse,
      batch_count: 2,
      per_node_breakdown: [
        { choice_index: 0, prompt_tokens: 120, completion_tokens: 350, estimated_cost_eur: 0.0022 },
        { choice_index: 1, prompt_tokens: 0, completion_tokens: 350, estimated_cost_eur: 0.0001 },
      ],
    }
    mockEstimateCost.mockResolvedValue(batchResponse)
    mockGetBudget.mockResolvedValue(budgetOk)
    render(<CostEstimationBadge estimateRequest={baseRequest} />)
    await act(async () => { vi.advanceTimersByTime(400) })
    await waitFor(() => {
      expect(screen.getByText(/voir détail/i)).toBeInTheDocument()
    })
    fireEvent.click(screen.getByText(/voir détail/i))
    expect(screen.getByText(/nœud 0/i)).toBeInTheDocument()
    expect(screen.getByText(/nœud 1/i)).toBeInTheDocument()
  })

  it('AC #5 — affiche warning 90% quand le budget est proche', async () => {
    mockEstimateCost.mockResolvedValue(baseResponse)
    mockGetBudget.mockResolvedValue(budget90)
    render(<CostEstimationBadge estimateRequest={baseRequest} />)
    await act(async () => { vi.advanceTimersByTime(400) })
    await waitFor(() => {
      expect(screen.getByText(/90%/i)).toBeInTheDocument()
    })
  })

  it('AC #5 — affiche warning 100% et appelle onBudgetExceeded(true)', async () => {
    const onBudgetExceeded = vi.fn()
    mockEstimateCost.mockResolvedValue(baseResponse)
    mockGetBudget.mockResolvedValue(budget100)
    render(<CostEstimationBadge estimateRequest={baseRequest} onBudgetExceeded={onBudgetExceeded} />)
    await act(async () => { vi.advanceTimersByTime(400) })
    await waitFor(() => {
      expect(screen.getByText(/génération bloquée/i)).toBeInTheDocument()
      expect(onBudgetExceeded).toHaveBeenCalledWith(true)
    })
  })

  it('AC #2 — le recalcul auto est déclenché après le debounce (400ms)', async () => {
    mockEstimateCost.mockResolvedValue(baseResponse)
    mockGetBudget.mockResolvedValue(budgetOk)
    render(<CostEstimationBadge estimateRequest={baseRequest} />)
    // Avant le debounce : pas encore appelé
    expect(mockEstimateCost).not.toHaveBeenCalled()
    await act(async () => { vi.advanceTimersByTime(400) })
    expect(mockEstimateCost).toHaveBeenCalledTimes(1)
  })

  it('AC #2 — un changement de request annule le debounce précédent', async () => {
    mockEstimateCost.mockResolvedValue(baseResponse)
    mockGetBudget.mockResolvedValue(budgetOk)
    const { rerender } = render(<CostEstimationBadge estimateRequest={baseRequest} />)
    await act(async () => { vi.advanceTimersByTime(200) })
    const updatedRequest = { ...baseRequest, user_instructions: 'Nouvelle instruction' }
    rerender(<CostEstimationBadge estimateRequest={updatedRequest} />)
    await act(async () => { vi.advanceTimersByTime(200) })
    // Pas encore déclenché (le 2ème debounce n'est pas encore écoulé)
    expect(mockEstimateCost).not.toHaveBeenCalled()
    await act(async () => { vi.advanceTimersByTime(400) })
    expect(mockEstimateCost).toHaveBeenCalledTimes(1)
    expect(mockEstimateCost).toHaveBeenCalledWith(updatedRequest)
  })
})
