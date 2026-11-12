/**
 * Story 18.4 (revue) : ouvrir un nœud dans le panneau n'est pas une saisie. Le flush du panneau
 * ajoute des valeurs par défaut aux choix bruts (influenceDelta, visibilityConditions, title…) :
 * il ne doit ni pousser d'étape d'undo, ni vider le redo, ni marquer le document modifié.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, act } from '@testing-library/react'
import { ReactFlowProvider } from 'reactflow'
import { NodeEditorPanel } from '../components/graph/NodeEditorPanel'
import { useGraphStore } from '../store/graphStore'
import { useContextStore } from '../store/contextStore'
import { documentToGraph } from '../utils/documentToGraph'

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

function rawDocument() {
  return {
    schemaVersion: '1.1.0',
    nodes: [
      { id: 'd1', speaker: 'PNJ', line: 'Bonjour', choices: [{ choiceId: 'c1', text: 'Oui', targetNode: 'd2' }] },
      { id: 'd2', speaker: 'PNJ', line: 'Suite' },
      { id: 'd3', speaker: 'PNJ', line: 'À supprimer' },
    ],
  }
}

function loadGraph(withDocumentSoT: boolean) {
  const document = rawDocument()
  const layout = { nodes: {} }
  const { nodes, edges } = documentToGraph(document, layout)
  useGraphStore.getState().resetGraph()
  useGraphStore.setState({
    nodes,
    edges,
    document: withDocumentSoT ? document : null,
    layout: withDocumentSoT ? layout : null,
    selectedNodeId: null,
    undoStack: [],
    redoStack: [],
    hasUnsavedChanges: false,
  })
}

const hasNode = (id: string) => useGraphStore.getState().nodes.some((n) => n.id === id)
const waitDebounce = () => act(() => new Promise((r) => setTimeout(r, 250)))

function renderPanel() {
  return render(
    <ReactFlowProvider>
      <NodeEditorPanel />
    </ReactFlowProvider>
  )
}

describe.each([
  ['document SoT', true],
  ['direct', false],
])('NodeEditorPanel - opening a node is not an undoable edit (%s)', (_mode, withDocumentSoT) => {
  beforeEach(() => {
    vi.mocked(useContextStore).mockReturnValue({ selections: {} } as ReturnType<typeof useContextStore>)
    loadGraph(withDocumentSoT)
  })

  it('undo still restores a node deleted before the panel was opened', async () => {
    useGraphStore.getState().deleteNode('d3')
    expect(useGraphStore.getState().undoStack).toHaveLength(1)

    renderPanel()
    act(() => useGraphStore.getState().setSelectedNode('d1'))
    await waitDebounce()

    expect(useGraphStore.getState().undoStack).toHaveLength(1)
    act(() => useGraphStore.getState().undo())
    await waitDebounce()
    expect(hasNode('d3')).toBe(true)
    expect(useGraphStore.getState().undoStack).toHaveLength(0)
  })

  it('opening the panel keeps the redo stack and does not mark the document dirty', async () => {
    useGraphStore.getState().deleteNode('d3')
    useGraphStore.getState().undo()
    useGraphStore.setState({ hasUnsavedChanges: false })
    expect(useGraphStore.getState().redoStack).toHaveLength(1)

    renderPanel()
    act(() => useGraphStore.getState().setSelectedNode('d1'))
    await waitDebounce()

    expect(useGraphStore.getState().undoStack).toHaveLength(0)
    expect(useGraphStore.getState().redoStack).toHaveLength(1)
    expect(useGraphStore.getState().hasUnsavedChanges).toBe(false)
  })
})
