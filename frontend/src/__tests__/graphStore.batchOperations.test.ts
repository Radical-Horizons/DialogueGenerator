/**
 * Story 2.11 FR32: opérations batch (batchDeleteNodes, batchTagNodes).
 * Vérifie un seul markDirty après la boucle et le retour deleted/failed.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useGraphStore } from '../store/graphStore'
import type { Node } from 'reactflow'

vi.mock('../api/graph', () => ({
  loadGraph: vi.fn(),
  saveGraph: vi.fn(),
  saveGraphAndWrite: vi.fn(),
  generateNode: vi.fn(),
  validateGraph: vi.fn(),
  calculateLayout: vi.fn(),
}))

function addDialogueNode(id: string, data: Record<string, unknown> = {}): void {
  const node: Node = {
    id,
    type: 'dialogueNode',
    position: { x: 0, y: 0 },
    data: { id, speaker: '', line: '', choices: [], ...data },
  }
  useGraphStore.getState().addNode(node)
}

describe('graphStore - Batch operations (Story 2.11)', () => {
  beforeEach(() => {
    useGraphStore.getState().resetGraph()
  })

  describe('batchDeleteNodes', () => {
    it('deletes all given nodes and calls markDirty once', () => {
      addDialogueNode('a')
      addDialogueNode('b')
      addDialogueNode('c')
      const store = useGraphStore.getState()
      const markDirtySpy = vi.spyOn(store, 'markDirty')
      markDirtySpy.mockClear()

      const result = store.batchDeleteNodes(['a', 'b', 'c'])

      expect(result).toEqual({ deleted: ['a', 'b', 'c'], failed: [] })
      expect(useGraphStore.getState().nodes).toHaveLength(0)
      expect(markDirtySpy).toHaveBeenCalledTimes(1)
    })

    it('returns failed for non-existent ids and does not call markDirty when nothing deleted', () => {
      const store = useGraphStore.getState()
      const markDirtySpy = vi.spyOn(store, 'markDirty')
      markDirtySpy.mockClear()

      const result = store.batchDeleteNodes(['ghost1', 'ghost2'])

      expect(result.deleted).toEqual([])
      expect(result.failed.map((f) => f.id)).toContain('ghost1')
      expect(result.failed.map((f) => f.id)).toContain('ghost2')
      expect(result.failed[0].reason).toBe('nœud introuvable')
      expect(markDirtySpy).not.toHaveBeenCalled()
    })

    it('deletes only existing nodes and returns failed for missing ids', () => {
      addDialogueNode('a')
      addDialogueNode('b')
      const store = useGraphStore.getState()

      const result = store.batchDeleteNodes(['a', 'ghost', 'b'])

      expect(result.deleted).toEqual(['a', 'b'])
      expect(result.failed).toEqual([{ id: 'ghost', reason: 'nœud introuvable' }])
      expect(useGraphStore.getState().nodes).toHaveLength(0)
    })
  })

  describe('batchTagNodes', () => {
    it('sets data.tag for each node and calls markDirty once', () => {
      addDialogueNode('n1', { tag: 'old' })
      addDialogueNode('n2')
      const store = useGraphStore.getState()
      const markDirtySpy = vi.spyOn(store, 'markDirty')
      markDirtySpy.mockClear()

      store.batchTagNodes(['n1', 'n2'], 'À réviser')

      const state = useGraphStore.getState()
      expect((state.nodes.find((n) => n.id === 'n1')!.data as Record<string, unknown>).tag).toBe(
        'À réviser'
      )
      expect((state.nodes.find((n) => n.id === 'n2')!.data as Record<string, unknown>).tag).toBe(
        'À réviser'
      )
      expect(markDirtySpy).toHaveBeenCalledTimes(1)
    })

    it('skips non-existent node ids and still calls markDirty once for updated nodes', () => {
      addDialogueNode('n1')
      const store = useGraphStore.getState()
      const markDirtySpy = vi.spyOn(store, 'markDirty')
      markDirtySpy.mockClear()

      store.batchTagNodes(['n1', 'ghost'], 'Tag')

      expect((useGraphStore.getState().nodes[0].data as Record<string, unknown>).tag).toBe('Tag')
      expect(markDirtySpy).toHaveBeenCalledTimes(1)
    })

    it('does not call markDirty when all node ids are non-existent', () => {
      const store = useGraphStore.getState()
      const markDirtySpy = vi.spyOn(store, 'markDirty')
      markDirtySpy.mockClear()

      store.batchTagNodes(['ghost1', 'ghost2'], 'Tag')

      expect(markDirtySpy).not.toHaveBeenCalled()
    })
  })
})
