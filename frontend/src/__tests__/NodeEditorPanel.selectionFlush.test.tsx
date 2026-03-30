/**
 * Test de régression : le flush au changement de sélection NE doit PAS écraser
 * les champs de connexion (targetNode) gérés par les edges.
 *
 * Bug : { ...prevNode.data, ...formValues } écrasait choices[N].targetNode avec
 * undefined (valeur du formulaire) juste après qu'une génération IA venait de
 * créer la connexion.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, act } from '@testing-library/react'
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
    result: null, state: 'idle', error: null,
    runEstimate: vi.fn(), budgetExceeded: false, budgetWarning90: false,
  }),
}))

describe('NodeEditorPanel - flush on selection change preserves targetNode', () => {
  const choiceWithTarget = {
    text: 'Choix 2',
    targetNode: 'GENERATED_NODE',
    choiceId: '__idx_2',
  }
  const parentNode = {
    id: 'START',
    type: 'dialogueNode' as const,
    position: { x: 0, y: 0 },
    data: {
      id: 'START',
      speaker: 'NPC',
      line: 'Hello',
      choices: [
        { text: 'Choix 0', targetNode: undefined, choiceId: '__idx_0' },
        { text: 'Choix 1', targetNode: undefined, choiceId: '__idx_1' },
        choiceWithTarget,
      ],
      nextNode: '',
    },
  }
  const generatedNode = {
    id: 'GENERATED_NODE',
    type: 'dialogueNode' as const,
    position: { x: 200, y: 280 },
    data: { id: 'GENERATED_NODE', speaker: 'PNJ', line: 'Réponse', choices: [], nextNode: '' },
  }

  let updateNodeMock: ReturnType<typeof vi.fn>
  let mockState: Record<string, unknown>

  beforeEach(() => {
    updateNodeMock = vi.fn()
    mockState = {
      selectedNodeId: 'START',
      nodes: [parentNode, generatedNode],
      edges: [],
      updateNode: updateNodeMock,
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
      selectedNode: parentNode,
    }
    vi.mocked(useGraphStore).mockImplementation(((selector?: (s: unknown) => unknown) => {
      if (typeof selector === 'function') return selector(mockState)
      return mockState
    }) as typeof useGraphStore)
    ;(useGraphStore as unknown as { getState: () => typeof mockState }).getState = vi.fn(
      () => mockState
    )
    vi.mocked(useContextStore).mockReturnValue({ selections: {} } as ReturnType<typeof useContextStore>)
  })

  it('should NOT overwrite targetNode when flushing form on node deselection', async () => {
    const { rerender } = render(
      <ReactFlowProvider>
        <NodeEditorPanel />
      </ReactFlowProvider>
    )

    // Simuler le changement de sélection : l'utilisateur clique sur le nœud généré
    // (ce qui se passe après generateFromNode → setSelectedNode)
    await act(async () => {
      mockState = {
        ...mockState,
        selectedNodeId: 'GENERATED_NODE',
        selectedNode: generatedNode,
        nodes: [parentNode, generatedNode],
      }
      vi.mocked(useGraphStore).mockImplementation(((selector?: (s: unknown) => unknown) => {
        if (typeof selector === 'function') return selector(mockState)
        return mockState
      }) as typeof useGraphStore)
      ;(useGraphStore as unknown as { getState: () => typeof mockState }).getState = vi.fn(
        () => mockState
      )
      rerender(
        <ReactFlowProvider>
          <NodeEditorPanel />
        </ReactFlowProvider>
      )
    })

    // Le flush sur l'ancien nœud (START) doit avoir été appelé
    const callsForStart = updateNodeMock.mock.calls.filter(
      ([nodeId]) => nodeId === 'START'
    )
    expect(callsForStart.length).toBeGreaterThan(0)

    // Et dans chaque appel, choices[2].targetNode doit être préservé (pas undefined)
    for (const [, updates] of callsForStart) {
      const choices = (updates as { data: { choices: Array<{ targetNode?: string }> } }).data
        .choices
      if (choices && choices.length > 2) {
        expect(choices[2].targetNode).toBe('GENERATED_NODE')
      }
    }
  })
})

describe('NodeEditorPanel - flush on selection change preserves TestNode result connections', () => {
  const testNodeEmpty = {
    id: 'test-node-START-choice-0',
    type: 'testNode' as const,
    position: { x: 100, y: 50 },
    data: {
      id: 'test-node-START-choice-0',
      test: 'Raison+Architecture:8',
      line: '',
      criticalFailureNode: '',
      failureNode: '',
      successNode: '',
      criticalSuccessNode: '',
    },
  }
  const generatedNode = {
    id: 'node-gen-1',
    type: 'dialogueNode' as const,
    position: { x: 200, y: 200 },
    data: { id: 'node-gen-1', speaker: 'PNJ', line: 'Suite', choices: [], nextNode: '' },
  }

  let updateNodeMock: ReturnType<typeof vi.fn>
  let mockState: Record<string, unknown>

  beforeEach(() => {
    updateNodeMock = vi.fn()
    mockState = {
      selectedNodeId: testNodeEmpty.id,
      nodes: [testNodeEmpty, generatedNode],
      edges: [],
      updateNode: updateNodeMock,
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
      selectedNode: testNodeEmpty,
    }
    vi.mocked(useGraphStore).mockImplementation(((selector?: (s: unknown) => unknown) => {
      if (typeof selector === 'function') return selector(mockState)
      return mockState
    }) as typeof useGraphStore)
    ;(useGraphStore as unknown as { getState: () => typeof mockState }).getState = vi.fn(
      () => mockState
    )
    vi.mocked(useContextStore).mockReturnValue({ selections: {} } as ReturnType<typeof useContextStore>)
  })

  it('should NOT overwrite criticalFailureNode etc. when store was updated by generation but form is still empty', async () => {
    const { rerender } = render(
      <ReactFlowProvider>
        <NodeEditorPanel />
      </ReactFlowProvider>
    )

    // Simuler generateFromNode : le store Zustand a les IDs, le formulaire react-hook-form non resynchronisé
    const testNodeFilled = {
      ...testNodeEmpty,
      data: {
        ...testNodeEmpty.data,
        criticalFailureNode: 'node-cf',
        failureNode: 'node-f',
        successNode: 'node-s',
        criticalSuccessNode: 'node-cs',
      },
    }
    mockState = {
      ...mockState,
      nodes: [testNodeFilled, generatedNode],
    }

    await act(async () => {
      mockState = {
        ...mockState,
        selectedNodeId: generatedNode.id,
        selectedNode: generatedNode,
      }
      vi.mocked(useGraphStore).mockImplementation(((selector?: (s: unknown) => unknown) => {
        if (typeof selector === 'function') return selector(mockState)
        return mockState
      }) as typeof useGraphStore)
      ;(useGraphStore as unknown as { getState: () => typeof mockState }).getState = vi.fn(
        () => mockState
      )
      rerender(
        <ReactFlowProvider>
          <NodeEditorPanel />
        </ReactFlowProvider>
      )
    })

    const callsForTest = updateNodeMock.mock.calls.filter(
      ([nodeId]) => nodeId === testNodeEmpty.id
    )
    expect(callsForTest.length).toBeGreaterThan(0)

    for (const [, updates] of callsForTest) {
      const d = (updates as { data: Record<string, unknown> }).data
      expect(d.criticalFailureNode).toBe('node-cf')
      expect(d.failureNode).toBe('node-f')
      expect(d.successNode).toBe('node-s')
      expect(d.criticalSuccessNode).toBe('node-cs')
    }
  })
})
