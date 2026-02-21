/**
 * Tests unitaires pour createEmptyNode dans graphStore (Story 1.6 - FR6).
 * AC #1, #5 : nœud vide avec stableID unique, addNode + markDirty.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { useGraphStore } from '../store/graphStore'

describe('graphStore - createEmptyNode (Story 1.6)', () => {
  beforeEach(() => {
    const store = useGraphStore.getState()
    store.resetGraph()
  })

  describe('createEmptyNode()', () => {
    it('returns a Node with type dialogueNode and data id, speaker, line, choices', () => {
      const { createEmptyNode } = useGraphStore.getState()
      const node = createEmptyNode()

      expect(node.type).toBe('dialogueNode')
      expect(node.id).toBeDefined()
      expect(node.data).toEqual({
        id: node.id,
        speaker: '',
        line: '',
        choices: [],
      })
    })

    it('returns node with unique stableID (manual- + uuid format)', () => {
      const { createEmptyNode } = useGraphStore.getState()
      const node = createEmptyNode()

      expect(node.id).toMatch(/^manual-[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)
    })

    it('returns different ids for two calls', () => {
      const { createEmptyNode } = useGraphStore.getState()
      const node1 = createEmptyNode()
      const node2 = createEmptyNode()

      expect(node1.id).not.toBe(node2.id)
    })

    it('addNode(createEmptyNode()) adds one node and markDirty sets hasUnsavedChanges', () => {
      const { createEmptyNode, addNode, nodes, hasUnsavedChanges } = useGraphStore.getState()
      expect(nodes).toHaveLength(0)
      expect(hasUnsavedChanges).toBe(false)

      const node = createEmptyNode()
      addNode(node)

      const state = useGraphStore.getState()
      expect(state.nodes).toHaveLength(1)
      expect(state.nodes[0].id).toBe(node.id)
      expect(state.nodes[0].data).toEqual({
        id: node.id,
        speaker: '',
        line: '',
        choices: [],
      })
      expect(state.hasUnsavedChanges).toBe(true)
    })

    it('accepts optional position', () => {
      const { createEmptyNode } = useGraphStore.getState()
      const node = createEmptyNode({ x: 100, y: 200 })

      expect(node.position).toEqual({ x: 100, y: 200 })
    })

    it('defaults position to 0,0 when not provided', () => {
      const { createEmptyNode } = useGraphStore.getState()
      const node = createEmptyNode()

      expect(node.position).toEqual({ x: 0, y: 0 })
    })
  })
})
