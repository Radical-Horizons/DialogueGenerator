import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ContextSelectionBudgetBar } from './ContextSelectionBudgetBar'
import { useContextConfigStore } from '../../store/contextConfigStore'
import { useGenerationStore } from '../../store/generationStore'

vi.mock('../../store/generationActionsStore', () => ({
  useGenerationActionsStore: (selector: (s: { actions: { estimateTokens: () => void } }) => unknown) =>
    selector({ actions: { estimateTokens: vi.fn() } }),
}))

describe('ContextSelectionBudgetBar', () => {
  beforeEach(() => {
    useContextConfigStore.setState({ contextTokenBudgetMax: 10_000 })
    useGenerationStore.setState({
      tokenCount: 25_000,
      isEstimating: false,
      contextEstimationError: null,
      contextTokenBreakdown: [{ entity_type: 'characters', mode: 'full', token_count: 80 }],
      contextBreakdownNote: 'Note test breakdown.',
    })
  })

  it('affiche le dépassement de budget et le CTA optimisation actif quand l’API FR21 est activée', async () => {
    render(<ContextSelectionBudgetBar visible />)

    expect(await screen.findByTestId('context-token-budget-warning')).toBeInTheDocument()
    const cta = screen.getByTestId('context-optimize-cta')
    expect(cta).not.toBeDisabled()
    expect(cta.getAttribute('title')).toContain('FR21')
  })

  it('avertit quand le plafond configuré dépasse 100k', async () => {
    useContextConfigStore.setState({ contextTokenBudgetMax: 150_000 })

    render(<ContextSelectionBudgetBar visible />)

    expect(await screen.findByTestId('context-token-budget-high-cap-warning')).toBeInTheDocument()
  })
})
