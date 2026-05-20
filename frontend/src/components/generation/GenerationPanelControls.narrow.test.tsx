import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { GenerationPanelControls } from './GenerationPanelControls'
import { GenerationPanelNarrowProvider } from './GenerationPanelNarrowContext'

const defaultProps = {
  maxContextTokens: 69_000,
  maxCompletionTokens: 30_000,
  maxChoices: null,
  narrativeTags: [],
  availableNarrativeTags: ['tension'],
  validationErrors: {},
  tokenCount: null,
  onMaxContextTokensChange: vi.fn(),
  onMaxCompletionTokensChange: vi.fn(),
  onMaxChoicesChange: vi.fn(),
  onNarrativeTagsChange: vi.fn(),
  onDirty: vi.fn(),
}

describe('GenerationPanelControls — responsive narrow', () => {
  it('empile les sliders tokens en colonne (narrow)', () => {
    render(
      <GenerationPanelNarrowProvider value={true}>
        <GenerationPanelControls {...defaultProps} />
      </GenerationPanelNarrowProvider>,
    )
    const row = screen.getByTestId('generation-token-sliders-row')
    expect(row.style.flexDirection).toBe('column')
    expect(screen.getAllByTestId('generation-token-slider-control-narrow')).toHaveLength(2)
    expect(screen.getByText('69K')).toBeInTheDocument()
    expect(screen.getByText('30K')).toBeInTheDocument()
  })

  it('affiche les sliders côte à côte en confortable', () => {
    render(
      <GenerationPanelNarrowProvider value={false}>
        <GenerationPanelControls {...defaultProps} />
      </GenerationPanelNarrowProvider>,
    )
    expect(screen.getByTestId('generation-token-sliders-row').style.flexDirection).toBe('row')
  })
})
