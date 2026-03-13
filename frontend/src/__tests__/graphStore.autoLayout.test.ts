/**
 * Story 2.13 FR34: auto-layout (Dagre) réorganise les nœuds et persiste (markDirty).
 * AC #1, #2: applyAutoLayout('dagre', 'TB') met à jour les positions et déclenche persistance.
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

function addDialogueNode(id: string, position: { x: number; y: number }): void {
  const node: Node = {
    id,
    type: 'dialogueNode',
    position,
    data: { id, speaker: '', line: '', choices: [] },
  }
  useGraphStore.getState().addNode(node)
}

describe('graphStore - Auto-layout (Story 2.13 FR34)', () => {
  beforeEach(() => {
    useGraphStore.getState().resetGraph()
  })

  describe('applyAutoLayout(dagre, TB)', () => {
    it('updates node positions and store reflects layouted nodes (AC #1, #2)', async () => {
      addDialogueNode('n1', { x: 0, y: 0 })
      addDialogueNode('n2', { x: 100, y: 0 })
      addDialogueNode('n3', { x: 200, y: 0 })
      const { connectNodes, applyAutoLayout } = useGraphStore.getState()
      connectNodes('n1', 'n2', 0, 'choice')
      connectNodes('n2', 'n3', 0, 'choice')

      const stateBefore = useGraphStore.getState()
      const positionsBefore = stateBefore.nodes.map((n) => ({ id: n.id, ...n.position }))

      await applyAutoLayout('dagre', 'TB')

      const stateAfter = useGraphStore.getState()
      const positionsAfter = stateAfter.nodes.map((n) => ({ id: n.id, ...n.position }))
      expect(stateAfter.nodes).toHaveLength(3)
      expect(positionsAfter).not.toEqual(positionsBefore)

      const n1 = stateAfter.nodes.find((n) => n.id === 'n1')
      const n2 = stateAfter.nodes.find((n) => n.id === 'n2')
      const n3 = stateAfter.nodes.find((n) => n.id === 'n3')
      expect(n1?.position).toBeDefined()
      expect(n2?.position).toBeDefined()
      expect(n3?.position).toBeDefined()
      expect(n1!.position.y).toBeLessThanOrEqual(n2!.position.y + 150)
      expect(n2!.position.y).toBeLessThanOrEqual(n3!.position.y + 150)

      const positions = stateAfter.nodes.map((n) => n.position)
      for (let i = 0; i < positions.length; i++) {
        for (let j = i + 1; j < positions.length; j++) {
          const dx = Math.abs(positions[i].x - positions[j].x)
          const dy = Math.abs(positions[i].y - positions[j].y)
          expect(dx >= 50 || dy >= 50).toBe(true)
        }
      }
    })

    it('calls markDirty after layout so changes are persisted (AC #1, ADR-006)', async () => {
      addDialogueNode('a', { x: 0, y: 0 })
      addDialogueNode('b', { x: 50, y: 50 })
      useGraphStore.getState().connectNodes('a', 'b', 0, 'choice')

      const store = useGraphStore.getState()
      const markDirtySpy = vi.spyOn(store, 'markDirty')
      markDirtySpy.mockClear()

      await store.applyAutoLayout('dagre', 'TB')

      expect(markDirtySpy).toHaveBeenCalledTimes(1)
      expect(useGraphStore.getState().hasUnsavedChanges).toBe(true)
    })
  })
})
