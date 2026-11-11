import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { ReactFlowProvider } from 'reactflow'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useGraphViewStore } from '../../../store/graphViewStore'
import { DialogueNode } from './DialogueNode'

const apiPost = vi.hoisted(() => vi.fn())

vi.mock('../../../api/client', () => ({
  default: {
    post: (...args: unknown[]) => apiPost(...args),
    get: vi.fn(),
    interceptors: {
      request: { use: vi.fn(), eject: vi.fn(), clear: vi.fn() },
      response: { use: vi.fn(), eject: vi.fn(), clear: vi.fn() },
    },
  },
}))

const renderDialogueNode = () =>
  render(
    <ReactFlowProvider>
      <DialogueNode
        id="node-1"
        type="dialogue"
        selected={false}
        isConnectable
        dragging={false}
        xPos={0}
        yPos={0}
        zIndex={0}
        data={{
          id: 'node-1',
          speaker: 'PNJ',
          line: 'Test',
          choices: [
            {
              text: 'Mentir',
              choiceId: 'choice-1',
              effortCost: 12,
              skillCheck: {
                attributeId: 'sociabilite',
                attributeLabel: 'Sociabilité',
                skillId: 'tromperie',
                skillLabel: 'Tromperie',
                dc: 7,
                branches: {
                  succès: 'SUCCESS',
                  échec_critique: 'CRIT_FAILURE',
                },
              },
            },
          ],
        }}
      />
    </ReactFlowProvider>,
  )

function renderPendingNode(
  overrides: { selected?: boolean; data?: Record<string, unknown> } = {},
) {
  return render(
    <ReactFlowProvider>
      <DialogueNode
        id="node-2"
        type="dialogue"
        selected={overrides.selected ?? false}
        isConnectable
        dragging={false}
        xPos={0}
        yPos={0}
        zIndex={0}
        data={{
          id: 'node-2',
          speaker: 'Personnage au nom très long pour remplir l’en-tête',
          line: 'Réplique',
          status: 'pending',
          choices: [],
          ...overrides.data,
        }}
      />
    </ReactFlowProvider>,
  )
}

describe('DialogueNode — actions d’un nœud à valider', () => {
  beforeEach(() => {
    useGraphViewStore.setState({ dialoguePreviewActive: false })
    apiPost.mockReset()
  })

  it('range Rejeter, Régénérer et Accepter dans une seule rangée en flux', () => {
    renderPendingNode({ selected: true })

    const row = screen.getByTestId('graph-node-pending-actions')
    expect(row).toHaveStyle({ display: 'flex' })
    const buttons = within(row).getAllByRole('button')
    expect(buttons.map((b) => b.title)).toEqual([
      'Rejeter le nœud',
      'Régénérer avec d\'autres instructions',
      'Accepter le nœud',
    ])
    for (const button of buttons) {
      expect(button.style.position).toBe('')
    }
  })

  it('réserve la même hauteur avec ou sans boutons : le texte ne saute pas au survol', () => {
    renderPendingNode()

    const content = screen.getByTestId('graph-node-content')
    const row = screen.getByTestId('graph-node-pending-actions')
    const heightAtRest = row.style.height
    const textBlock = screen.getByText(/Réplique/)
    const paddingAtRest = textBlock.style.paddingTop
    expect(within(row).queryAllByRole('button')).toHaveLength(0)

    fireEvent.mouseEnter(content)

    expect(within(row).getAllByRole('button')).toHaveLength(3)
    expect(row.style.height).toBe(heightAtRest)
    expect(textBlock.style.paddingTop).toBe(paddingAtRest)
  })

  it('garde le texte hors de la zone de « Voir le prompt », même sans choix', () => {
    renderPendingNode({ selected: true })

    const link = screen.getByRole('button', { name: 'Voir le prompt' })
    const footer = screen.getByText('', { selector: 'div > span:empty' }).parentElement!
    expect(parseInt(link.style.bottom, 10)).toBeLessThan(parseInt(footer.style.paddingBottom, 10))
  })

  it('n’affiche pas de rangée sur un nœud validé', () => {
    renderPendingNode({ selected: true, data: { status: 'accepted' } })

    expect(screen.queryByTestId('graph-node-pending-actions')).not.toBeInTheDocument()
  })
})

describe('DialogueNode — badge GDD↑', () => {
  beforeEach(() => {
    useGraphViewStore.setState({ dialoguePreviewActive: false })
    apiPost.mockReset()
  })

  const staleData = {
    status: 'accepted',
    contextGddContentFingerprint: 'v2:ancienne',
    gddContextSelectionsSnapshot: { characters_full: ['X'] },
    validationWarnings: [{ type: 'orphan', message: 'Isolé', severity: 'warning' }],
  }

  it('s’aligne dans l’en-tête à côté du libellé d’état, sans le couvrir', async () => {
    apiPost.mockResolvedValue({ data: { fingerprint: 'v2:nouvelle' } })
    renderPendingNode({ selected: true, data: staleData })

    const badge = await screen.findByTestId('gdd-stale-badge', undefined, { timeout: 4000 })
    const label = screen.getByTestId('graph-node-state-label')
    expect(label).toHaveTextContent('Sélectionné')
    expect(badge.parentElement).toBe(label.parentElement)
    expect(badge.style.position).toBe('')
    expect(screen.getByTestId('graph-node-warning-count').style.position).toBe('')
  })

  it('reste absent quand l’empreinte n’a pas bougé', async () => {
    apiPost.mockResolvedValue({ data: { fingerprint: 'v2:ancienne' } })
    renderPendingNode({ data: staleData })

    await waitFor(() => expect(apiPost).toHaveBeenCalled(), { timeout: 4000 })
    await act(async () => {
      await Promise.resolve()
    })
    expect(screen.queryByTestId('gdd-stale-badge')).not.toBeInTheDocument()
  })
})

describe('DialogueNode FR94 preview affordances', () => {
  beforeEach(() => {
    useGraphViewStore.setState({
      dialoguePreviewActive: true,
      previewGameSystemsState: {
        attributes: { sociabilite: 0 },
        skills: { tromperie: 1 },
        effortPool: 10,
        reputationValues: {},
        factionTitles: {},
        simulationLimits: [],
      },
      visibilityEvalState: { flags: {}, reputation: {} },
      previewEffectHistory: [],
    })
  })

  it('expose skill check tentable et effort insuffisant sur le choix', () => {
    renderDialogueNode()

    expect(
      screen.getByLabelText(
        /Mentir — Sociabilité \+ Tromperie vs DD 7 : score 1, échec_critique — branche CRIT_FAILURE — Effort insuffisant : 10 PE disponibles, coût 12 PE\./,
      ),
    ).toBeInTheDocument()
  })
})
