/**
 * Tests pour NodeEditorPanel avec TestNode et 4 résultats de test.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { NodeEditorPanel } from '../components/graph/NodeEditorPanel'
import { useGraphStore } from '../store/graphStore'
import { useContextStore } from '../store/contextStore'
import { ReactFlowProvider } from 'reactflow'

// Mock stores
vi.mock('../store/graphStore', () => ({
  useGraphStore: vi.fn(),
}))

vi.mock('../store/contextStore', () => ({
  useContextStore: vi.fn(),
}))

vi.mock('../api/config', () => ({
  listLLMModels: vi.fn().mockResolvedValue({ models: [] }),
}))

describe('NodeEditorPanel - TestNode avec 4 résultats', () => {
  const mockNodes = [
    { id: 'START', type: 'dialogueNode', data: {} },
    { id: 'NODE_CRITICAL_FAILURE', type: 'dialogueNode', data: {} },
    { id: 'NODE_FAILURE', type: 'dialogueNode', data: {} },
    { id: 'NODE_SUCCESS', type: 'dialogueNode', data: {} },
    { id: 'NODE_CRITICAL_SUCCESS', type: 'dialogueNode', data: {} },
  ]

  const mockTestNode = {
    id: 'test-node-1',
    type: 'testNode' as const,
    data: {
      test: 'Raison+Diplomatie:8',
      criticalFailureNode: 'NODE_CRITICAL_FAILURE',
      failureNode: 'NODE_FAILURE',
      successNode: 'NODE_SUCCESS',
      criticalSuccessNode: 'NODE_CRITICAL_SUCCESS',
    },
  }

  let mockState: ReturnType<typeof useGraphStore>

  beforeEach(() => {
    mockState = {
      selectedNodeId: 'test-node-1',
      nodes: [mockTestNode, ...mockNodes],
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
    } as ReturnType<typeof useGraphStore>
    vi.mocked(useGraphStore).mockImplementation((selector?: (s: typeof mockState) => unknown) => {
      if (typeof selector === 'function') return selector(mockState)
      return mockState
    })
    ;(useGraphStore as { getState: () => typeof mockState }).getState = vi.fn(() => mockState)

    vi.mocked(useContextStore).mockReturnValue({
      selections: {},
    } as ReturnType<typeof useContextStore>)
  })

  it('devrait afficher les 4 champs de connexion pour un TestNode', async () => {
    // WHEN: Rendu du NodeEditorPanel avec un TestNode sélectionné
    render(
      <ReactFlowProvider>
        <NodeEditorPanel />
      </ReactFlowProvider>
    )

    // THEN: Les 4 champs de connexion doivent être visibles
    await waitFor(() => {
      expect(screen.getByLabelText('Échec critique')).toBeInTheDocument()
      expect(screen.getByLabelText('Échec')).toBeInTheDocument()
      expect(screen.getByLabelText('Réussite')).toBeInTheDocument()
      expect(screen.getByLabelText('Réussite critique')).toBeInTheDocument()
    })
  })

  it('devrait afficher les valeurs existantes des 4 champs de connexion', async () => {
    // WHEN: Rendu du NodeEditorPanel avec un TestNode ayant les 4 connexions définies
    render(
      <ReactFlowProvider>
        <NodeEditorPanel />
      </ReactFlowProvider>
    )

    // THEN: Les valeurs doivent être affichées dans les champs
    await waitFor(() => {
      const criticalFailureField = screen.getByLabelText('Échec critique') as HTMLInputElement
      const failureField = screen.getByLabelText('Échec') as HTMLInputElement
      const successField = screen.getByLabelText('Réussite') as HTMLInputElement
      const criticalSuccessField = screen.getByLabelText('Réussite critique') as HTMLInputElement

      expect(criticalFailureField.value).toBe('NODE_CRITICAL_FAILURE')
      expect(failureField.value).toBe('NODE_FAILURE')
      expect(successField.value).toBe('NODE_SUCCESS')
      expect(criticalSuccessField.value).toBe('NODE_CRITICAL_SUCCESS')
    })
  })

  it('devrait afficher les 4 champs même si seulement 2 sont définis (rétrocompatibilité)', async () => {
    // GIVEN: Un TestNode avec seulement successNode et failureNode
    const testNodeWith2Results = {
      id: 'test-node-2',
      type: 'testNode' as const,
      data: {
        test: 'Raison+Diplomatie:8',
        successNode: 'NODE_SUCCESS',
        failureNode: 'NODE_FAILURE',
      },
    }

    const state2 = {
      selectedNodeId: 'test-node-2',
      nodes: [testNodeWith2Results, ...mockNodes],
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
    } as ReturnType<typeof useGraphStore>
    vi.mocked(useGraphStore).mockImplementation((selector?: (s: typeof state2) => unknown) => {
      if (typeof selector === 'function') return selector(state2)
      return state2
    })
    ;(useGraphStore as { getState: () => typeof state2 }).getState = vi.fn(() => state2)

    // WHEN: Rendu du NodeEditorPanel
    render(
      <ReactFlowProvider>
        <NodeEditorPanel />
      </ReactFlowProvider>
    )

    // THEN: Les 4 champs doivent être visibles (même si seulement 2 ont des valeurs)
    await waitFor(() => {
      expect(screen.getByLabelText('Échec critique')).toBeInTheDocument()
      expect(screen.getByLabelText('Échec')).toBeInTheDocument()
      expect(screen.getByLabelText('Réussite')).toBeInTheDocument()
      expect(screen.getByLabelText('Réussite critique')).toBeInTheDocument()
    })
  })
})
