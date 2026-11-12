/**
 * Recette 2026-11-03 : en mode étroit (téléphone, ou bureau avec le panneau GDD ouvert),
 * « Jouer » apparaissait deux fois et deux icônes ◎ restaient sans libellé.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, within } from '@testing-library/react'
import { renderGraphEditorHeader } from './graphEditorHeaderTestUtils'

function accessibleLabel(button: HTMLElement): string {
  return (button.getAttribute('aria-label') ?? button.getAttribute('title') ?? '').trim()
}

describe('GraphEditorHeader — barre étroite sans doublon', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('narrow : un seul « Jouer » et un seul recentrage', () => {
    renderGraphEditorHeader({ narrow: true, onToggleScenarioPlaythrough: () => {} })

    expect(screen.getAllByTestId('btn-scenario-playthrough')).toHaveLength(1)
    expect(screen.getAllByTestId('btn-focus-selected-node')).toHaveLength(1)
    const toolbar = screen.getByTestId('graph-editor-toolbar')
    expect(within(toolbar).getAllByText('Jouer')).toHaveLength(1)
  })

  it('narrow : le recentrage ◎ porte un libellé visible', () => {
    renderGraphEditorHeader({ narrow: true })

    expect(screen.getByTestId('btn-focus-selected-node')).toHaveTextContent('Nœud')
  })

  it.each([true, false])('narrow=%s : chaque bouton de la barre a un aria-label ou un title', (narrow) => {
    renderGraphEditorHeader({ narrow, onToggleScenarioPlaythrough: () => {} })

    const toolbar = screen.getByTestId('graph-editor-toolbar')
    const unlabeled = within(toolbar)
      .getAllByRole('button')
      .filter((button) => accessibleLabel(button) === '')
      .map((button) => button.getAttribute('data-testid') ?? button.textContent)
    expect(unlabeled).toEqual([])
  })
})
