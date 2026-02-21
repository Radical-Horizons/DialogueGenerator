/**
 * Tests de régression pour le mode controlled React Flow (ADR-007 / Story 1.17).
 * Vérifient que la sélection et les positions ne corrompent pas nodes/edges dans le store.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useGraphStore } from '../store/graphStore'
import type { Node, NodeChange } from 'reactflow'

vi.mock('../api/graph', () => ({
  loadGraph: vi.fn(),
  saveGraph: vi.fn(),
  saveGraphAndWrite: vi.fn(),
  generateNode: vi.fn(),
  validateGraph: vi.fn(),
  calculateLayout: vi.fn(),
}))

describe('graphStore - Controlled mode (ADR-007)', () => {
  beforeEach(() => {
    useGraphStore.getState().resetGraph()
  })

  describe('Regression: edges remain visible after selection', () => {
    it('setSelectedNode does not alter nodes or edges', () => {
      const { addNode, connectNodes, setSelectedNode } = useGraphStore.getState()
      const n1: Node = {
        id: 'n1',
        type: 'dialogueNode',
        position: { x: 0, y: 0 },
        data: { text: 'A' },
      }
      const n2: Node = {
        id: 'n2',
        type: 'dialogueNode',
        position: { x: 100, y: 0 },
        data: { text: 'B' },
      }
      addNode(n1)
      addNode(n2)
      connectNodes('n1', 'n2', 0, 'choice')

      let state = useGraphStore.getState()
      expect(state.nodes).toHaveLength(2)
      expect(state.edges).toHaveLength(1)
      const edgesBefore = state.edges

      setSelectedNode('n1')

      state = useGraphStore.getState()
      expect(state.selectedNodeId).toBe('n1')
      expect(state.nodes).toHaveLength(2)
      expect(state.edges).toHaveLength(1)
      expect(state.edges[0].source).toBe('n1')
      expect(state.edges[0].target).toBe('n2')
      expect(state.edges).toEqual(edgesBefore)
    })

    it('setSelectedNode(null) does not alter nodes or edges', () => {
      const { addNode, setSelectedNode } = useGraphStore.getState()
      const n1: Node = { id: 'n1', type: 'dialogueNode', position: { x: 0, y: 0 }, data: {} }
      addNode(n1)
      setSelectedNode('n1')
      const stateBefore = useGraphStore.getState()
      const edgesBefore = stateBefore.edges
      const nodesBefore = stateBefore.nodes

      setSelectedNode(null)

      const state = useGraphStore.getState()
      expect(state.selectedNodeId).toBeNull()
      expect(state.nodes).toEqual(nodesBefore)
      expect(state.edges).toEqual(edgesBefore)
    })
  })

  describe('Regression: positions in store after drag', () => {
    it('updateNodePosition updates node position in store', () => {
      const { addNode, updateNodePosition } = useGraphStore.getState()
      const n1: Node = {
        id: 'n1',
        type: 'dialogueNode',
        position: { x: 10, y: 20 },
        data: {},
      }
      addNode(n1)

      updateNodePosition('n1', { x: 50, y: 60 })

      const state = useGraphStore.getState()
      const node = state.nodes.find((n) => n.id === 'n1')
      expect(node?.position).toEqual({ x: 50, y: 60 })
    })
  })

  describe('Selection updated in store (onNodesChange type select)', () => {
    it('setSelectedNode updates selectedNodeId', () => {
      const { addNode, setSelectedNode } = useGraphStore.getState()
      const n1: Node = { id: 'n1', type: 'dialogueNode', position: { x: 0, y: 0 }, data: {} }
      addNode(n1)

      expect(useGraphStore.getState().selectedNodeId).toBeNull()
      setSelectedNode('n1')
      expect(useGraphStore.getState().selectedNodeId).toBe('n1')
      setSelectedNode(null)
      expect(useGraphStore.getState().selectedNodeId).toBeNull()
    })

    it('onNodesChange([{ type: "select", id, selected }]) updates store (React Flow event shape)', () => {
      const { addNode, setSelectedNode } = useGraphStore.getState()
      const n1: Node = { id: 'n1', type: 'dialogueNode', position: { x: 0, y: 0 }, data: {} }
      addNode(n1)
      expect(useGraphStore.getState().selectedNodeId).toBeNull()

      // Simulate GraphCanvas onNodesChange handler for select (same payload shape as React Flow)
      const changes: NodeChange[] = [{ type: 'select', id: 'n1', selected: true }]
      for (const change of changes) {
        if (change.type === 'select' && change.id !== undefined) {
          setSelectedNode(change.selected ? change.id : null)
        }
      }
      expect(useGraphStore.getState().selectedNodeId).toBe('n1')

      // Deselect
      const deselectChanges: NodeChange[] = [{ type: 'select', id: 'n1', selected: false }]
      for (const change of deselectChanges) {
        if (change.type === 'select' && change.id !== undefined) {
          setSelectedNode(change.selected ? change.id : null)
        }
      }
      expect(useGraphStore.getState().selectedNodeId).toBeNull()
    })
  })
})
