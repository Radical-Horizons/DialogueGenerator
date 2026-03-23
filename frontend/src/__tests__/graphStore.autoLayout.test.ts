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

    it('keeps generous vertical spacing between ranks for readability', async () => {
      addDialogueNode('root', { x: 0, y: 0 })
      addDialogueNode('child', { x: 0, y: 0 })
      addDialogueNode('grandchild', { x: 0, y: 0 })
      const { connectNodes, applyAutoLayout } = useGraphStore.getState()
      connectNodes('root', 'child', 0, 'choice')
      connectNodes('child', 'grandchild', 0, 'choice')

      await applyAutoLayout('dagre', 'TB')

      const state = useGraphStore.getState()
      const root = state.nodes.find((n) => n.id === 'root')
      const child = state.nodes.find((n) => n.id === 'child')
      const grandchild = state.nodes.find((n) => n.id === 'grandchild')
      expect(root).toBeDefined()
      expect(child).toBeDefined()
      expect(grandchild).toBeDefined()
      expect(child!.position.y - root!.position.y).toBeGreaterThanOrEqual(300)
      expect(grandchild!.position.y - child!.position.y).toBeGreaterThanOrEqual(300)
    })

    it('adapts spacing when switching between compact and large modes', async () => {
      addDialogueNode('root', { x: 0, y: 0 })
      addDialogueNode('child', { x: 0, y: 0 })
      addDialogueNode('grandchild', { x: 0, y: 0 })
      const store = useGraphStore.getState()
      store.connectNodes('root', 'child', 0, 'choice')
      store.connectNodes('child', 'grandchild', 0, 'choice')

      store.setLayoutSpacingMode('compact')
      await store.applyAutoLayout('dagre', 'TB')
      const compactState = useGraphStore.getState()
      const compactRoot = compactState.nodes.find((n) => n.id === 'root')!
      const compactChild = compactState.nodes.find((n) => n.id === 'child')!
      const compactDelta = compactChild.position.y - compactRoot.position.y

      store.setLayoutSpacingMode('large')
      await store.applyAutoLayout('dagre', 'TB')
      const largeState = useGraphStore.getState()
      const largeRoot = largeState.nodes.find((n) => n.id === 'root')!
      const largeChild = largeState.nodes.find((n) => n.id === 'child')!
      const largeDelta = largeChild.position.y - largeRoot.position.y

      expect(largeDelta).toBeGreaterThan(compactDelta)
      expect(largeState.layoutSpacingMode).toBe('large')
    })

    it('uses measured node heights to keep tall parents from overlapping descendants', async () => {
      useGraphStore.getState().addNode({
        id: 'tall-root',
        type: 'dialogueNode',
        position: { x: 0, y: 0 },
        measured: { width: 280, height: 420 },
        width: 280,
        height: 420,
        data: { id: 'tall-root', speaker: '', line: 'Parent', choices: [] },
      })
      useGraphStore.getState().addNode({
        id: 'child',
        type: 'dialogueNode',
        position: { x: 0, y: 0 },
        measured: { width: 280, height: 180 },
        width: 280,
        height: 180,
        data: { id: 'child', speaker: '', line: 'Child', choices: [] },
      })
      useGraphStore.getState().connectNodes('tall-root', 'child', 0, 'choice')

      await useGraphStore.getState().applyAutoLayout('dagre', 'TB')

      const state = useGraphStore.getState()
      const root = state.nodes.find((n) => n.id === 'tall-root')!
      const child = state.nodes.find((n) => n.id === 'child')!
      expect(child.position.y).toBeGreaterThan(root.position.y + 420)
    })
  })
})
