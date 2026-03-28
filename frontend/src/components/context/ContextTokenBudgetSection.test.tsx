import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { ContextTokenBudgetSection } from './ContextTokenBudgetSection'
import { useContextConfigStore } from '../../store/contextConfigStore'

vi.mock('../../hooks/useContextSelectionTokenEstimate', () => ({
  useContextSelectionTokenEstimate: () => ({
    data: {
      context_tokens: 10,
      selection_tokens: 25_000,
      context_token_breakdown: [
        { entity_type: 'characters', mode: 'full', token_count: 80 },
      ],
      context_breakdown_note: 'Note test breakdown.',
      token_count: 99,
      raw_prompt: '',
      prompt_hash: 'abc',
    },
    loading: false,
    error: null,
    refresh: vi.fn(),
  }),
}))

describe('ContextTokenBudgetSection', () => {
  beforeEach(() => {
    useContextConfigStore.setState({ contextTokenBudgetMax: 10_000 })
  })

  it('affiche le dépassement de budget et le CTA optimisation actif quand l’API FR21 est activée', async () => {
    render(<ContextTokenBudgetSection />)

    expect(await screen.findByTestId('context-token-budget-warning')).toBeInTheDocument()
    const cta = screen.getByTestId('context-optimize-cta')
    expect(cta).not.toBeDisabled()
    expect(cta.getAttribute('title')).toContain('FR21')
  })

  it('persiste le plafond via le store quand on modifie l’input', async () => {
    useContextConfigStore.setState({ contextTokenBudgetMax: 25_000 })
    render(<ContextTokenBudgetSection />)

    const input = screen.getByTestId('context-token-budget-input')
    fireEvent.change(input, { target: { value: '45000' } })

    await waitFor(() => {
      expect(useContextConfigStore.getState().contextTokenBudgetMax).toBe(45_000)
    })
  })
})
