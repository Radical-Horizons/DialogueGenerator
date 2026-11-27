/**
 * Story 20.2 : carte de 360 px par palier, ports et carte en écriture.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { ReactFlowProvider } from 'reactflow'
import { TextCardNode } from '../components/graph/nodes/TextCardNode'
import { useGraphStore } from '../store/graphStore'
import { useGraphViewStore } from '../store/graphViewStore'
import { useUiLayoutStore } from '../store/uiLayoutStore'
import { useAuthStore } from '../store/authStore'

// `Handle` exige le contexte d'un nœud React Flow : un témoin suffit pour lire ses ids.
vi.mock('reactflow', async (importOriginal) => {
  const mod = await importOriginal<typeof import('reactflow')>()
  return {
    ...mod,
    Handle: ({ id, type }: { id?: string; type: string }) => (
      <i data-testid="handle" data-handle-type={type} data-handle-id={id ?? ''} />
    ),
  }
})

const longLine = 'Une très longue réplique. '.repeat(93)
const data = {
  id: 'START',
  speaker: 'Grish',
  title: 'Ouverture',
  line: longLine,
  choices: [
    { choiceId: 'c0', text: 'Réponse testée entière', test: 'Raison+Artisanat:12', testSuccessNode: 'n1' },
    { text: 'Réponse simple entière', targetNode: 'n2' },
  ],
}

function renderCard(selected = false) {
  const props = { id: 'START', data, selected } as unknown as ComponentProps<typeof TextCardNode>
  return render(
    <ReactFlowProvider>
      <TextCardNode {...props} />
    </ReactFlowProvider>
  )
}

const card = () => screen.getByTestId('graph-node-content')
const handleIds = () =>
  screen
    .queryAllByTestId('handle')
    .filter((h) => h.dataset.handleType === 'source')
    .map((h) => h.dataset.handleId)
const EXPECTED_HANDLES = [
  'test:c0:critical-failure',
  'test:c0:failure',
  'test:c0:success',
  'test:c0:critical-success',
  'choice:__idx_1',
]

describe('TextCardNode (Story 20.2)', () => {
  beforeEach(() => {
    useGraphStore.getState().resetGraph()
    useGraphStore.setState({
      nodes: [{ id: 'START', type: 'dialogueNode', position: { x: 0, y: 0 }, data }],
    })
    useGraphViewStore.setState({ zoomTier: 'write', writingNodeId: null })
    useUiLayoutStore.setState({ inspectorTab: 'node', textCardsTestBars: false })
    useAuthStore.setState({ user: { id: '1', username: 'admin', role: 'admin' } as never })
  })

  it('palier écrire : 360 px, réplique bornée à 12 lignes, réponses entières', () => {
    renderCard()
    expect(card().style.width).toBe('360px')
    const line = screen.getByTestId('text-card-line')
    expect(line.style.maxHeight).toBe('273px')
    expect(line.style.overflowY).toBe('hidden')
    expect(line.textContent?.length).toBeGreaterThan(2300)
    expect(screen.getByText('Réponse testée entière')).toBeInTheDocument()
    expect(screen.getByText('Réponse simple entière')).toBeInTheDocument()
    expect(handleIds()).toEqual(EXPECTED_HANDLES)
  })

  it('carte sélectionnée : défilement interne de la réplique', () => {
    renderCard(true)
    expect(screen.getByTestId('text-card-line').style.overflowY).toBe('auto')
  })

  it.each(['read', 'situate'] as const)('palier %s : mêmes ids de ports', (tier) => {
    useGraphViewStore.setState({ zoomTier: tier })
    renderCard()
    expect(card().dataset.tier).toBe(tier)
    expect(screen.queryByTestId('text-card-line')).not.toBeInTheDocument()
    expect(handleIds()).toEqual(EXPECTED_HANDLES)
  })

  it('avec les nœuds de test affichés, la réponse testée garde son port de choix', () => {
    useUiLayoutStore.setState({ textCardsTestBars: true })
    renderCard()
    expect(handleIds()).toEqual(['choice:c0', 'choice:__idx_1'])
  })

  it('écrit le texte brut par updateNode, inspecteur replié, et reste à « écrire »', () => {
    renderCard()
    fireEvent.click(screen.getByTestId('text-card-line'))

    expect(useUiLayoutStore.getState().inspectorTab).toBeNull()
    expect(useGraphViewStore.getState().writingNodeId).toBe('START')
    const field = screen.getByTestId('text-card-editor') as HTMLTextAreaElement
    expect(field.value).toBe(longLine)

    fireEvent.change(field, { target: { value: '*Il hoche la tête.* Oui.' } })
    expect(useGraphStore.getState().nodes[0].data.line).toBe('*Il hoche la tête.* Oui.')

    act(() => useGraphViewStore.getState().setZoomTier('situate'))
    expect(card().dataset.tier).toBe('write')
    expect(screen.getByTestId('text-card-editor')).toBeInTheDocument()

    fireEvent.keyDown(screen.getByTestId('text-card-editor'), { key: 'Escape' })
    expect(useGraphViewStore.getState().writingNodeId).toBeNull()
    expect(card().dataset.tier).toBe('situate')
  })

  it("n'ouvre pas le champ pour un invité", () => {
    useAuthStore.setState({ user: { id: 'g', username: 'invité', role: 'guest' } as never })
    renderCard()
    fireEvent.click(screen.getByTestId('text-card-line'))
    expect(screen.queryByTestId('text-card-editor')).not.toBeInTheDocument()
  })
})
