/**
 * « Nouveau nœud » sélectionne le nœud avant qu'il n'existe dans le store : le formulaire, resté sur
 * le nœud précédent, ne doit pas lui transmettre ses choix (choix fantôme `x>undefined`).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, act, screen } from '@testing-library/react'
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

const waitDebounce = () => act(() => new Promise((r) => setTimeout(r, 200)))

describe('NodeEditorPanel - nouveau nœud sélectionné avant son ajout au store', () => {
  beforeEach(() => {
    useGraphStore.getState().resetGraph()
    const withChoice = dialogueNode('n1', 'Bonjour')
    withChoice.data.choices = [{ text: 'Partir', targetNode: 'n2' }]
    useGraphStore.setState({
      nodes: [withChoice, dialogueNode('n2', 'Au revoir')],
      edges: [],
      selectedNodeId: 'n1',
    })
    vi.mocked(useContextStore).mockReturnValue({ selections: {} } as ReturnType<typeof useContextStore>)
  })

  it("n'hérite pas des choix ni du texte du nœud précédent", async () => {
    render(
      <ReactFlowProvider>
        <NodeEditorPanel />
      </ReactFlowProvider>
    )
    await waitDebounce()

    act(() => useGraphStore.setState({ selectedNodeId: 'n3' }))
    await waitDebounce()
    act(() =>
      useGraphStore.setState((s) => ({ nodes: [...s.nodes, dialogueNode('n3', '')] }))
    )
    await waitDebounce()

    const created = useGraphStore.getState().nodes.find((n) => n.id === 'n3')
    expect(created?.data.choices).toEqual([])
    expect(created?.data.line).toBe('')
    expect((screen.getByPlaceholderText('Texte du dialogue...') as HTMLTextAreaElement).value).toBe('')
  })
})
