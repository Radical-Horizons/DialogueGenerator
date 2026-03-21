/**
 * Régression : quand le store met à jour les connexions d’un TestNode sans changement
 * de sélection, le formulaire doit refléter les nouveaux IDs (resync par empreinte).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, act, waitFor, within } from '@testing-library/react'
import { NodeEditorPanel } from '../components/graph/NodeEditorPanel'
import { useGraphStore } from '../store/graphStore'
import { useContextStore } from '../store/contextStore'
import { ReactFlowProvider } from 'reactflow'

vi.mock('../store/graphStore', () => ({
  useGraphStore: vi.fn(),
}))

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
    result: null,
    state: 'idle',
    error: null,
    runEstimate: vi.fn(),
    budgetExceeded: false,
    budgetWarning90: false,
  }),
}))

describe('NodeEditorPanel - connection resync when store updates same selected TestNode', () => {
  const testNodeId = 'test-node-START-choice-0'

  const targetNode = {
    id: 'node-resync-cf',
    type: 'dialogueNode' as const,
    position: { x: 100, y: 0 },
    data: { id: 'node-resync-cf', line: 'Cible CF' },
  }

  const makeTestNode = (criticalFailureNode: string) => ({
    id: testNodeId,
    type: 'testNode' as const,
    position: { x: 0, y: 0 },
    data: {
      id: testNodeId,
      test: 'Raison+Diplomatie:8',
      line: '',
      criticalFailureNode,
      failureNode: '',
      successNode: '',
      criticalSuccessNode: '',
    },
  })

  let mockState: Record<string, unknown>

  beforeEach(() => {
    mockState = {
      selectedNodeId: testNodeId,
      nodes: [makeTestNode(''), targetNode],
      edges: [],
      updateNode: vi.fn(),
      deleteNode: vi.fn(),
      generateFromNode: vi.fn(),
      isGenerating: false,
      setSelectedNode: vi.fn(),
      setShowDeleteNodeConfirm: vi.fn(),
      createEmptyNode: vi.fn(),
      addNode: vi.fn(),
      connectNodes: vi.fn(),
      disconnectNodes: vi.fn(),
      duplicateNode: vi.fn(),
      validationErrors: [],
      highlightedNodeIds: [],
      selectedNode: makeTestNode(''),
    }
    vi.mocked(useGraphStore).mockImplementation((selector?: (s: typeof mockState) => unknown) => {
      if (typeof selector === 'function') return selector(mockState)
      return mockState
    })
    ;(useGraphStore as unknown as { getState: () => typeof mockState }).getState = vi.fn(
      () => mockState
    )
    vi.mocked(useContextStore).mockReturnValue({ selections: {} } as ReturnType<typeof useContextStore>)
  })

  it('updates Échec critique input when store gains criticalFailureNode without reselection', async () => {
    const { rerender } = render(
      <ReactFlowProvider>
        <NodeEditorPanel />
      </ReactFlowProvider>
    )

    const filled = makeTestNode('node-resync-cf')
    mockState = {
      ...mockState,
      nodes: [filled, targetNode],
      selectedNode: filled,
    }
    vi.mocked(useGraphStore).mockImplementation((selector?: (s: typeof mockState) => unknown) => {
      if (typeof selector === 'function') return selector(mockState)
      return mockState
    })
    ;(useGraphStore as unknown as { getState: () => typeof mockState }).getState = vi.fn(
      () => mockState
    )

    await act(async () => {
      rerender(
        <ReactFlowProvider key={filled.data.criticalFailureNode}>
          <NodeEditorPanel />
        </ReactFlowProvider>
      )
    })

    await waitFor(() => {
      expect(
        within(screen.getByTestId('panel-test-cf')).getByText(/Cible CF \(node-resync-cf\)/)
      ).toBeInTheDocument()
    })
  })
})
