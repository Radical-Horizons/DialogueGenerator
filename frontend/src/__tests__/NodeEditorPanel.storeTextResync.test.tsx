/**
 * Story 18.3 : le formulaire suit les champs texte du store tant qu'il n'a pas de saisie en attente,
 * sinon le flush (debounce ou changement de sélection) réécrit l'ancien texte par-dessus.
 * Store réel : le bug n'existe que parce que le store re-rend le panneau sans changer la sélection.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, act, screen, fireEvent } from '@testing-library/react'
import type { Node } from 'reactflow'
import { ReactFlowProvider } from 'reactflow'
import { NodeEditorPanel } from '../components/graph/NodeEditorPanel'
import { useGraphStore } from '../store/graphStore'
import { useContextStore } from '../store/contextStore'

vi.mock('../store/contextStore', () => ({
  useContextStore: vi.fn(),
}))

vi.mock('../api/config', () => ({
  listLLMModels: vi.fn().mockResolvedValue({ models: [] }),
}))

vi.mock('../components/shared', () => ({
  useToast: () => vi.fn(),
}))

vi.mock('../hooks/useEstimation', () => ({
  useEstimation: () => ({
    result: null, state: 'idle', error: null,
    runEstimate: vi.fn(), budgetExceeded: false, budgetWarning90: false,
  }),
}))

function dialogueNode(id: string, line: string): Node {
  return {
    id,
    type: 'dialogueNode',
    position: { x: 0, y: 0 },
    data: { id, title: '', speaker: 'PNJ', line, choices: [], nextNode: '' },
  }
}

const lineOf = (nodeId: string) =>
  useGraphStore.getState().nodes.find((n) => n.id === nodeId)?.data.line

/** Écriture externe au panneau (undo, génération) sur le nœud sélectionné. */
function writeLineFromOutside(nodeId: string, line: string) {
  useGraphStore.setState((s) => ({
    nodes: s.nodes.map((n) => (n.id === nodeId ? { ...n, data: { ...n.data, line } } : n)),
  }))
}

const waitDebounce = () => act(() => new Promise((r) => setTimeout(r, 200)))

describe('NodeEditorPanel - store → form resync of text fields (story 18.3)', () => {
  beforeEach(() => {
    useGraphStore.getState().resetGraph()
    useGraphStore.setState({
      nodes: [dialogueNode('n1', 'Bonjour'), dialogueNode('n2', 'Au revoir')],
      edges: [],
      selectedNodeId: 'n1',
    })
    vi.mocked(useContextStore).mockReturnValue({ selections: {} } as ReturnType<typeof useContextStore>)
  })

  const renderPanel = () =>
    render(
      <ReactFlowProvider>
        <NodeEditorPanel />
      </ReactFlowProvider>
    )
  const lineField = () => screen.getByPlaceholderText('Texte du dialogue...') as HTMLTextAreaElement

  it('reloads the form when the selected node text changes in the store, without writing it back', async () => {
    renderPanel()
    await waitDebounce()
    expect(lineField().value).toBe('Bonjour')

    act(() => writeLineFromOutside('n1', 'Texte restauré'))
    await waitDebounce()

    expect(lineField().value).toBe('Texte restauré')
    expect(lineOf('n1')).toBe('Texte restauré')
  })

  it('does not write the stale text back when the selection changes afterwards', async () => {
    renderPanel()
    await waitDebounce()

    act(() => writeLineFromOutside('n1', 'Texte restauré'))
    act(() => useGraphStore.getState().setSelectedNode('n2'))
    await waitDebounce()

    expect(lineOf('n1')).toBe('Texte restauré')
    expect(lineField().value).toBe('Au revoir')
  })

  it('keeps unflushed user input when the store changes underneath', async () => {
    renderPanel()
    await waitDebounce()

    fireEvent.change(lineField(), { target: { value: 'Ma saisie' } })
    act(() => writeLineFromOutside('n1', 'Autre écriture'))
    expect(lineField().value).toBe('Ma saisie')

    await waitDebounce()
    expect(lineOf('n1')).toBe('Ma saisie')
  })
})
