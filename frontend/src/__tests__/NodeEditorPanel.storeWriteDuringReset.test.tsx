/**
 * Une écriture du store arrivée avant que le `reset` du formulaire soit rendu (mesure d'un
 * nœud par React Flow) réenregistrait les choix encore montés : le nœud sélectionné en
 * héritait. Sans `act`, pour garder l'ordonnancement réel de React.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createRoot, type Root } from 'react-dom/client'
import type { Node } from 'reactflow'
import { ReactFlowProvider } from 'reactflow'
import { NodeEditorPanel } from '../components/graph/NodeEditorPanel'
import { useGraphStore } from '../store/graphStore'

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

const environment = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }

function dialogueNode(id: string, line: string, choices: Array<Record<string, unknown>>): Node {
  return {
    id,
    type: 'dialogueNode',
    position: { x: 0, y: 0 },
    data: { id, title: '', speaker: 'PNJ', line, choices, nextNode: '' },
  }
}

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

describe('NodeEditorPanel - écriture du store pendant le changement de nœud', () => {
  let container: HTMLDivElement
  let root: Root
  let previousActEnvironment: boolean | undefined

  beforeEach(() => {
    previousActEnvironment = environment.IS_REACT_ACT_ENVIRONMENT
    environment.IS_REACT_ACT_ENVIRONMENT = false
    useGraphStore.getState().resetGraph()
    useGraphStore.setState({
      nodes: [
        dialogueNode('n1', 'Bonjour', [{ text: 'Partir', choiceId: 'c0' }]),
        dialogueNode('n2', 'Au revoir', []),
      ],
      edges: [],
      selectedNodeId: 'n1',
    })
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    root.unmount()
    container.remove()
    environment.IS_REACT_ACT_ENVIRONMENT = previousActEnvironment
  })

  it('le nœud sélectionné n’hérite pas des choix du précédent', async () => {
    root.render(
      <ReactFlowProvider>
        <NodeEditorPanel />
      </ReactFlowProvider>,
    )
    await pause(250)
    expect(container.querySelector('[placeholder="Texte du choix..."]')).not.toBeNull()

    useGraphStore.getState().setSelectedNode('n2')
    // Rendu synchrone puis effet (`reset`) : ses mises à jour d'état ne sont pas encore rendues.
    await Promise.resolve()
    useGraphStore.getState().updateNodeDimensions('n2', { width: 321, height: 123 })
    await pause(350)

    const selected = useGraphStore.getState().nodes.find((n) => n.id === 'n2')
    expect(selected?.data.choices).toEqual([])
    expect(container.querySelector('[placeholder="Texte du choix..."]')).toBeNull()
  })
})
