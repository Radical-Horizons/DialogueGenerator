import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { DialogueStructureWidget } from './DialogueStructureWidget'
import { GenerationPanelNarrowProvider } from './GenerationPanelNarrowContext'

describe('DialogueStructureWidget — responsive narrow', () => {
  it('grille 3 colonnes lorsque le panneau est étroit (context)', () => {
    render(
      <GenerationPanelNarrowProvider value={true}>
        <DialogueStructureWidget value={['PNJ', 'PJ', '', '', '', '']} onChange={() => {}} />
      </GenerationPanelNarrowProvider>
    )
    const grid = screen.getByTestId('dialogue-structure-grid')
    expect(grid.style.gridTemplateColumns).toContain('repeat(3')
  })

  it('grille 6 colonnes en mode confortable', () => {
    render(
      <GenerationPanelNarrowProvider value={false}>
        <DialogueStructureWidget />
      </GenerationPanelNarrowProvider>
    )
    expect(screen.getByTestId('dialogue-structure-grid').style.gridTemplateColumns).toContain(
      'repeat(6'
    )
  })
})
