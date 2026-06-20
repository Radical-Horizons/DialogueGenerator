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
      promptTokenCount: 28_000,
      isEstimating: false,
      contextEstimationError: null,
    })
  })

  it('affiche le total prompt et la sous-ligne GDD', async () => {
    render(<ContextSelectionBudgetBar visible />)

    expect(await screen.findByTestId('prompt-token-total')).toHaveTextContent('~28')
    expect(screen.getByTestId('context-gdd-token-subline')).toHaveTextContent('~25')
  })

  it('affiche le dépassement de budget et le CTA optimisation actif quand l’API FR21 est activée', async () => {
    render(<ContextSelectionBudgetBar visible />)

    expect(await screen.findByTestId('context-token-budget-warning')).toBeInTheDocument()
    const cta = screen.getByTestId('context-optimize-cta')
    expect(cta).not.toBeDisabled()
    expect(cta.getAttribute('title')).toContain('FR21')
  })

  it('affiche « Contexte élevé » quand la sélection dépasse 100k tokens', async () => {
    useContextConfigStore.setState({ contextTokenBudgetMax: 200_000 })
    useGenerationStore.setState({ tokenCount: 120_000, promptTokenCount: 125_000 })

    render(<ContextSelectionBudgetBar visible />)

    expect(await screen.findByTestId('context-token-high-context-warning')).toHaveTextContent('Contexte élevé')
  })

  it('n’affiche pas « Contexte élevé » quand seul le plafond dépasse 100k', () => {
    useContextConfigStore.setState({ contextTokenBudgetMax: 150_000 })
    useGenerationStore.setState({ tokenCount: 25_000 })

    render(<ContextSelectionBudgetBar visible />)

    expect(screen.queryByTestId('context-token-high-context-warning')).not.toBeInTheDocument()
  })
})
