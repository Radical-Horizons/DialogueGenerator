/**
 * Tiroir bas « Ce qui part au modèle » (écran 2d).
 */
import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import {
  PROMPT_DRAWER_MAX_HEIGHT,
  PromptBudgetBottomDrawer,
} from './PromptBudgetBottomDrawer'

describe('PromptBudgetBottomDrawer', () => {
  it('garde le total visible même replié', () => {
    render(
      <PromptBudgetBottomDrawer totalTokens={31240}>
        <div>détail</div>
      </PromptBudgetBottomDrawer>
    )
    expect(screen.getByTestId('prompt-budget-bottom-drawer')).toHaveAttribute('data-open', 'false')
    expect(screen.getByTestId('prompt-budget-drawer-total')).toHaveTextContent(/31\s?240/)
    // Le détail, lui, n'est pas monté tant qu'on ne l'a pas demandé.
    expect(screen.queryByTestId('prompt-budget-drawer-detail')).toBeNull()
  })

  it('déplie et replie le détail', () => {
    render(
      <PromptBudgetBottomDrawer totalTokens={100}>
        <div>détail du prompt</div>
      </PromptBudgetBottomDrawer>
    )
    fireEvent.click(screen.getByTestId('prompt-budget-drawer-toggle'))
    expect(screen.getByText('détail du prompt')).toBeInTheDocument()
    expect(screen.getByTestId('prompt-budget-drawer-detail')).toHaveStyle({
      maxHeight: PROMPT_DRAWER_MAX_HEIGHT,
    })

    fireEvent.click(screen.getByTestId('prompt-budget-drawer-toggle'))
    expect(screen.queryByTestId('prompt-budget-drawer-detail')).toBeNull()
  })

  it('plafonne le détail à 60vh — il ne mange jamais tout l’écran', () => {
    expect(PROMPT_DRAWER_MAX_HEIGHT).toBe('60vh')
  })

  it('affiche un tiret quand le total n’est pas encore estimé', () => {
    render(
      <PromptBudgetBottomDrawer totalTokens={null}>
        <div />
      </PromptBudgetBottomDrawer>
    )
    expect(screen.getByTestId('prompt-budget-drawer-total')).toHaveTextContent('—')
  })
})
