/**
 * Story 2.10 FR31: multi-sélection (selectedNodeIds, setSelectedNodes, clearSelection).
 * Cohérence avec selectedNodeId (single vs multi).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useGraphStore } from '../store/graphStore'

vi.mock('../api/graph', () => ({
  loadGraph: vi.fn(),
  saveGraph: vi.fn(),
  saveGraphAndWrite: vi.fn(),
  generateNode: vi.fn(),
  validateGraph: vi.fn(),
  calculateLayout: vi.fn(),
}))

describe('graphStore - Multi-selection (Story 2.10)', () => {
  beforeEach(() => {
    useGraphStore.getState().resetGraph()
  })

  describe('setSelectedNodes and clearSelection', () => {
    it('setSelectedNodes([a, b]) sets selectedNodeIds to [a, b] and selectedNodeId to first', () => {
      const { setSelectedNodes } = useGraphStore.getState()
      setSelectedNodes(['a', 'b'])
      const state = useGraphStore.getState()
      expect(state.selectedNodeIds).toEqual(['a', 'b'])
      expect(state.selectedNodeId).toBe('a')
    })

    it('clearSelection() sets selectedNodeIds to [] and selectedNodeId to null', () => {
      const { setSelectedNodes, clearSelection } = useGraphStore.getState()
      setSelectedNodes(['a', 'b'])
      clearSelection()
      const state = useGraphStore.getState()
      expect(state.selectedNodeIds).toEqual([])
      expect(state.selectedNodeId).toBeNull()
    })

    it('setSelectedNodes([]) clears selection and selectedNodeId', () => {
      const { setSelectedNodes } = useGraphStore.getState()
      setSelectedNodes(['a', 'b'])
      setSelectedNodes([])
      const state = useGraphStore.getState()
      expect(state.selectedNodeIds).toEqual([])
      expect(state.selectedNodeId).toBeNull()
    })

    it('single node: setSelectedNodes([x]) keeps selectedNodeId and selectedNodeIds in sync', () => {
      const { setSelectedNodes } = useGraphStore.getState()
      setSelectedNodes(['x'])
      const state = useGraphStore.getState()
      expect(state.selectedNodeIds).toEqual(['x'])
      expect(state.selectedNodeId).toBe('x')
    })
  })

  describe('coherence selectedNodeId vs selectedNodeIds', () => {
    it('setSelectedNode(id) updates selectedNodeId and selectedNodeIds to [id]', () => {
      const { setSelectedNode } = useGraphStore.getState()
      setSelectedNode('n1')
      const state = useGraphStore.getState()
      expect(state.selectedNodeId).toBe('n1')
      expect(state.selectedNodeIds).toEqual(['n1'])
    })

    it('setSelectedNode(null) clears selectedNodeId and selectedNodeIds', () => {
      const { setSelectedNodes, setSelectedNode } = useGraphStore.getState()
      setSelectedNodes(['a', 'b'])
      setSelectedNode(null)
      const state = useGraphStore.getState()
      expect(state.selectedNodeId).toBeNull()
      expect(state.selectedNodeIds).toEqual([])
    })
  })
})
