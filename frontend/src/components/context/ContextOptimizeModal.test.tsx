import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { ContextOptimizeModal } from './ContextOptimizeModal'
import { useContextStore } from '../../store/contextStore'
import { useContextConfigStore } from '../../store/contextConfigStore'
import type { OptimizeContextResponse, ContextSelection } from '../../types/api'

const emptySel: ContextSelection = {
  characters_full: ['A'],
  characters_excerpt: [],
  locations_full: [],
  locations_excerpt: [],
  items_full: [],
  items_excerpt: [],
  species_full: [],
  species_excerpt: [],
  communities_full: [],
  communities_excerpt: [],
  dialogues_examples: [],
  narrative_structures: [],
  chapters: [],
  scenes: [],
}

const mockResponse: OptimizeContextResponse = {
  proposed_context_selections: {
    ...emptySel,
    characters_full: [],
    characters_excerpt: ['A'],
  },
  selection_tokens_before: 2000,
  selection_tokens_after: 100,
  tokens_saved: 1900,
  changes: [{ entity_type: 'characters', entity_name: 'A', from_mode: 'full', to_mode: 'excerpt' }],
  effect_report: {
    changes_by_entity_type: { characters: 1 },
    pinned_entity_keys: [],
    tokens_before_by_entity_type: { characters: 2000 },
    tokens_after_by_entity_type: { characters: 100 },
  },
  pre_generation_context_fidelity_proxy_percent: 5,
  warnings: ['Proxy pré-génération faible'],
  no_op: false,
  budget_respected: true,
}

const { optimizeContextSelectionMock } = vi.hoisted(() => ({
  optimizeContextSelectionMock: vi.fn(),
}))

vi.mock('../../api/context', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/context')>()
  return {
    ...actual,
    optimizeContextSelection: (...args: unknown[]) => optimizeContextSelectionMock(...args),
  }
})

vi.mock('../../utils/buildContextOptimizeRequest', () => ({
  buildOptimizeContextRequest: vi.fn(() => ({ user_instructions: ' ', choices_mode: 'free' })),
}))

describe('ContextOptimizeModal', () => {
  beforeEach(() => {
    optimizeContextSelectionMock.mockImplementation(() => Promise.resolve(mockResponse))
    useContextStore.setState({ selections: emptySel })
    useContextConfigStore.setState({
      contextTokenBudgetMax: 10_000,
      contextOptimizationPinnedKeys: [],
      contextOptimizationStrategy: 'conservative',
      contextOptimizationProxyThreshold: 50,
    })
  })

  it('charge la proposition et applique la sélection sur Accepter', async () => {
    const onClose = vi.fn()
    const onApplied = vi.fn()
    render(<ContextOptimizeModal open onClose={onClose} onApplied={onApplied} />)

    await waitFor(() => {
      expect(screen.getByText(/Accepter/i)).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText(/Accepter/i))

    await waitFor(() => {
      expect(onApplied).toHaveBeenCalled()
      const sel = useContextStore.getState().selections
      expect(sel.characters_excerpt).toContain('A')
      expect(sel.characters_full).not.toContain('A')
    })

    fireEvent.click(screen.getByText(/Annuler \(restaurer la sélection\)/i))
    await waitFor(() => {
      expect(useContextStore.getState().selections.characters_full).toContain('A')
    })
    expect(onClose).toHaveBeenCalled()
  })

  it('désactive Accepter si budget_respected est false (hors no_op)', async () => {
    const overBudget: OptimizeContextResponse = {
      ...mockResponse,
      selection_tokens_after: 50_000,
      budget_respected: false,
      no_op: false,
    }
    optimizeContextSelectionMock.mockImplementation(() => Promise.resolve(overBudget))
    render(<ContextOptimizeModal open onClose={vi.fn()} onApplied={vi.fn()} />)

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument()
    })
    const accept = screen.getByRole('button', { name: /Accepter/i })
    expect(accept).toBeDisabled()
  })

  it('ajoute une épingle depuis un sélecteur de fiches actives', async () => {
    render(<ContextOptimizeModal open onClose={vi.fn()} onApplied={vi.fn()} />)

    await waitFor(() => {
      expect(screen.getByText(/Choisir une fiche active/i)).toBeInTheDocument()
    })

    fireEvent.change(screen.getByDisplayValue('Choisir une fiche active…'), {
      target: { value: 'characters:A' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Ajouter/i }))

    await waitFor(() => {
      expect(useContextConfigStore.getState().contextOptimizationPinnedKeys).toContain('characters:A')
    })
  })
})
