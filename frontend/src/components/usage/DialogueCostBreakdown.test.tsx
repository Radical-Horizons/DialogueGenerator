/**
 * Tests unitaires pour DialogueCostBreakdown (Story 1.12 — FR73).
 * Couvre : rendu données vides, données valides, clic barre → tooltip,
 *          indicateurs couleur, état chargement, état erreur.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { DialogueCostBreakdown } from './DialogueCostBreakdown'
import type { DialogueCostResponse } from '../../api/llmUsage'

vi.mock('../../api/llmUsage', () => ({
  getDialogueCosts: vi.fn(),
}))

import { getDialogueCosts } from '../../api/llmUsage'
const mockGetDialogueCosts = getDialogueCosts as ReturnType<typeof vi.fn>

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
}

function renderComponent(dialogueId: string) {
  const qc = makeQueryClient()
  return render(
    <QueryClientProvider client={qc}>
      <DialogueCostBreakdown dialogueId={dialogueId} />
    </QueryClientProvider>
  )
}

const emptyResponse: DialogueCostResponse = {
  dialogue_id: 'diag_empty',
  total_cost_eur: 0,
  node_count: 0,
  avg_cost_per_node_eur: 0,
  breakdown: [],
}

const fullResponse: DialogueCostResponse = {
  dialogue_id: 'diag_full',
  total_cost_eur: 0.0276,
  node_count: 3,
  avg_cost_per_node_eur: 0.0092,
  breakdown: [
    {
      node_id: 'node_aaa111',
      timestamp: '2026-03-06T10:00:00.000Z',
      model_name: 'gpt-5.6-terra',
      prompt_tokens: 400,
      completion_tokens: 80,
      cost_eur: 0.0092,
      success: true,
      deleted: false,
    },
    {
      node_id: 'node_bbb222',
      timestamp: '2026-03-06T10:05:00.000Z',
      model_name: 'gpt-5.6-terra',
      prompt_tokens: 450,
      completion_tokens: 90,
      cost_eur: 0.0092,
      success: true,
      deleted: false,
    },
    {
      node_id: 'node_ccc333',
      timestamp: '2026-03-06T10:10:00.000Z',
      model_name: 'gpt-5.6-terra',
      prompt_tokens: 500,
      completion_tokens: 100,
      cost_eur: 0.0092,
      success: false,
      deleted: true,
    },
  ],
}

const expensiveResponse: DialogueCostResponse = {
  dialogue_id: 'diag_exp',
  total_cost_eur: 0.3,
  node_count: 1,
  avg_cost_per_node_eur: 0.3,
  breakdown: [
    {
      node_id: 'node_exp',
      timestamp: '2026-03-06T12:00:00.000Z',
      model_name: 'gpt-4o',
      prompt_tokens: 10000,
      completion_tokens: 5000,
      cost_eur: 0.3,
      success: true,
      deleted: false,
    },
  ],
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('DialogueCostBreakdown', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('affiche "Chargement" en attente', () => {
    mockGetDialogueCosts.mockReturnValue(new Promise(() => {}))
    renderComponent('diag_any')
    expect(screen.getByRole('status')).toBeInTheDocument()
    expect(screen.getByText(/chargement/i)).toBeInTheDocument()
  })

  it('affiche le message "Aucun nœud" quand breakdown vide', async () => {
    mockGetDialogueCosts.mockResolvedValue(emptyResponse)
    renderComponent('diag_empty')
    await waitFor(() => {
      expect(screen.getByText(/aucun nœud/i)).toBeInTheDocument()
    })
  })

  it('affiche les stats de résumé (coût total, nœuds, coût moyen)', async () => {
    mockGetDialogueCosts.mockResolvedValue(fullResponse)
    renderComponent('diag_full')
    await waitFor(() => {
      expect(screen.getByText(/coût total/i)).toBeInTheDocument()
      expect(screen.getByText(/nœuds générés/i)).toBeInTheDocument()
      expect(screen.getByText(/coût moyen/i)).toBeInTheDocument()
      expect(screen.getByText('3')).toBeInTheDocument()
    })
  })

  it('affiche les barres du graphique', async () => {
    mockGetDialogueCosts.mockResolvedValue(fullResponse)
    renderComponent('diag_full')
    await waitFor(() => {
      const bars = screen.getAllByTestId(/^dcb-bar-/)
      expect(bars).toHaveLength(3)
    })
  })

  it('affiche le tooltip au clic sur une barre', async () => {
    mockGetDialogueCosts.mockResolvedValue(fullResponse)
    renderComponent('diag_full')
    await waitFor(() => screen.getAllByTestId(/^dcb-bar-/))
    
    const firstBar = screen.getByTestId('dcb-bar-0')
    const barElement = firstBar.querySelector('[role="button"]')!
    fireEvent.click(barElement)
    
    await waitFor(() => {
      expect(screen.getByTestId('dcb-tooltip')).toBeInTheDocument()
    })
    // Vérifier les informations présentes dans le tooltip
    expect(screen.getByText(/gpt-5.6-terra/i)).toBeInTheDocument()
    expect(screen.getByText(/400/)).toBeInTheDocument()
  })

  it('ferme le tooltip au second clic sur la même barre', async () => {
    mockGetDialogueCosts.mockResolvedValue(fullResponse)
    renderComponent('diag_full')
    await waitFor(() => screen.getAllByTestId(/^dcb-bar-/))

    const barButton = screen.getByTestId('dcb-bar-0').querySelector('[role="button"]')!
    fireEvent.click(barButton)
    await waitFor(() => screen.getByTestId('dcb-tooltip'))
    fireEvent.click(barButton)
    await waitFor(() => {
      expect(screen.queryByTestId('dcb-tooltip')).not.toBeInTheDocument()
    })
  })

  it('affiche "Nœud supprimé" pour un nœud deleted=true', async () => {
    mockGetDialogueCosts.mockResolvedValue(fullResponse)
    renderComponent('diag_full')
    await waitFor(() => screen.getAllByTestId(/^dcb-bar-/))

    const deletedBar = screen.getByTestId('dcb-bar-2').querySelector('[role="button"]')!
    fireEvent.click(deletedBar)
    await waitFor(() => {
      expect(screen.getByTestId('dcb-tooltip')).toBeInTheDocument()
      expect(screen.getByText(/nœud supprimé/i)).toBeInTheDocument()
    })
  })

  it('affiche la couleur rouge pour un coût > 0.05€', async () => {
    mockGetDialogueCosts.mockResolvedValue(expensiveResponse)
    renderComponent('diag_exp')
    await waitFor(() => screen.getAllByTestId(/^dcb-bar-/))

    const bar = screen.getByTestId('dcb-bar-0').querySelector('[role="button"]')!
    // La couleur de la barre doit être rouge (#ef4444)
    expect((bar as HTMLElement).style.background).toBe('rgb(239, 68, 68)')
  })

  it('affiche la couleur verte pour un coût < 0.01€', async () => {
    const cheapResponse: DialogueCostResponse = {
      dialogue_id: 'diag_cheap',
      total_cost_eur: 0.005,
      node_count: 1,
      avg_cost_per_node_eur: 0.005,
      breakdown: [
        {
          node_id: 'node_cheap',
          timestamp: '2026-03-06T12:00:00.000Z',
          model_name: 'gpt-3.5-turbo',
          prompt_tokens: 100,
          completion_tokens: 20,
          cost_eur: 0.005,
          success: true,
          deleted: false,
        },
      ],
    }
    mockGetDialogueCosts.mockResolvedValue(cheapResponse)
    renderComponent('diag_cheap')
    await waitFor(() => screen.getAllByTestId(/^dcb-bar-/))

    const bar = screen.getByTestId('dcb-bar-0').querySelector('[role="button"]')!
    expect((bar as HTMLElement).style.background).toBe('rgb(34, 197, 94)')
  })

  it("affiche un message d'erreur si l'API échoue", async () => {
    mockGetDialogueCosts.mockRejectedValue(new Error('Network Error'))
    renderComponent('diag_fail')
    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument()
      expect(screen.getByText(/impossible de charger/i)).toBeInTheDocument()
    })
  })

  it("n'appelle pas l'API si dialogueId est vide", () => {
    renderComponent('')
    expect(mockGetDialogueCosts).not.toHaveBeenCalled()
  })
})
