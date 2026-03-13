/**
 * Tests undo/redo store (Story 2.14 FR35).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { Node } from 'reactflow'
import { useGraphStore } from '../store/graphStore'

vi.mock('../api/graph', () => ({
  loadGraph: vi.fn().mockResolvedValue({
    nodes: [],
    edges: [],
    metadata: { title: 'Test', filename: 'test.json' },
  }),
}))

describe('graphStore - undo/redo', () => {
  beforeEach(() => {
    useGraphStore.getState().resetGraph()
  })

  describe('undo', () => {
    it('after addNode, undo() restores previous state (no node)', () => {
      const { addNode, undo, canUndo } = useGraphStore.getState()
      expect(canUndo()).toBe(false)
      const n: Node = {
        id: 'n1',
        type: 'dialogueNode',
        position: { x: 0, y: 0 },
        data: { id: 'n1', speaker: '', line: '', choices: [] },
      }
      addNode(n)
      expect(useGraphStore.getState().nodes).toHaveLength(1)
      expect(canUndo()).toBe(true)
      undo()
      expect(useGraphStore.getState().nodes).toHaveLength(0)
      expect(canUndo()).toBe(false)
    })

    it('after deleteNode, undo() restores deleted node', () => {
      const { addNode, deleteNode, undo, canUndo } = useGraphStore.getState()
      const n: Node = {
        id: 'n1',
        type: 'dialogueNode',
        position: { x: 0, y: 0 },
        data: { id: 'n1', speaker: '', line: '', choices: [] },
      }
      addNode(n)
      deleteNode('n1')
      expect(useGraphStore.getState().nodes).toHaveLength(0)
      expect(canUndo()).toBe(true)
      undo()
      expect(useGraphStore.getState().nodes).toHaveLength(1)
      expect(useGraphStore.getState().nodes[0].id).toBe('n1')
    })

    it('after connectNodes, undo() removes edge', () => {
      const { addNode, connectNodes, undo, canUndo } = useGraphStore.getState()
      addNode({
        id: 'a',
        type: 'dialogueNode',
        position: { x: 0, y: 0 },
        data: { id: 'a', speaker: '', line: '', choices: [{ text: 'Go', targetNode: undefined }] },
      })
      addNode({
        id: 'b',
        type: 'dialogueNode',
        position: { x: 100, y: 0 },
        data: { id: 'b', speaker: '', line: '', choices: [] },
      })
      connectNodes('a', 'b', 0)
      expect(useGraphStore.getState().edges.length).toBeGreaterThan(0)
      expect(canUndo()).toBe(true)
      undo()
      expect(useGraphStore.getState().edges).toHaveLength(0)
    })

    it('after disconnectNodes, undo() restores edge', () => {
      const { addNode, connectNodes, disconnectNodes, undo } = useGraphStore.getState()
      addNode({
        id: 'a',
        type: 'dialogueNode',
        position: { x: 0, y: 0 },
        data: { id: 'a', speaker: '', line: '', choices: [{ text: 'Go', targetNode: undefined }] },
      })
      addNode({
        id: 'b',
        type: 'dialogueNode',
        position: { x: 100, y: 0 },
        data: { id: 'b', speaker: '', line: '', choices: [] },
      })
      connectNodes('a', 'b', 0)
      const edgeId = useGraphStore.getState().edges[0]?.id
      expect(edgeId).toBeDefined()
      disconnectNodes(edgeId!)
      expect(useGraphStore.getState().edges).toHaveLength(0)
      undo()
      expect(useGraphStore.getState().edges.length).toBeGreaterThan(0)
    })

    it('after updateNodePosition (drag stop), undo() restores position', () => {
      const { addNode, updateNodePosition, undo } = useGraphStore.getState()
      addNode({
        id: 'n1',
        type: 'dialogueNode',
        position: { x: 10, y: 20 },
        data: { id: 'n1', speaker: '', line: '', choices: [] },
      })
      updateNodePosition('n1', { x: 100, y: 200 }, undefined, true)
      expect(useGraphStore.getState().nodes[0].position).toEqual({ x: 100, y: 200 })
      undo()
      expect(useGraphStore.getState().nodes[0].position).toEqual({ x: 10, y: 20 })
    })

    it('after updateChoiceEdgeLabel, undo() restores previous label', () => {
      const { addNode, connectNodes, updateChoiceEdgeLabel, undo } = useGraphStore.getState()
      addNode({
        id: 'a',
        type: 'dialogueNode',
        position: { x: 0, y: 0 },
        data: { id: 'a', speaker: '', line: '', choices: [{ text: 'Original', targetNode: undefined }] },
      })
      addNode({
        id: 'b',
        type: 'dialogueNode',
        position: { x: 100, y: 0 },
        data: { id: 'b', speaker: '', line: '', choices: [] },
      })
      connectNodes('a', 'b', 0)
      const edge = useGraphStore.getState().edges.find((e) => e.source === 'a' && e.target === 'b')
      expect(edge?.label).toBeDefined()
      updateChoiceEdgeLabel(edge!.id, 'Updated text')
      expect(useGraphStore.getState().edges.find((e) => e.id === edge!.id)?.label).not.toBe('Original')
      undo()
      const choice = (useGraphStore.getState().nodes.find((n) => n.id === 'a')?.data?.choices as { text?: string }[])?.[0]
      expect(choice?.text).toBe('Original')
    })
  })

  describe('redo', () => {
    it('after undo(), redo() restores state', () => {
      const { addNode, undo, redo, canRedo } = useGraphStore.getState()
      addNode({
        id: 'n1',
        type: 'dialogueNode',
        position: { x: 0, y: 0 },
        data: { id: 'n1', speaker: '', line: '', choices: [] },
      })
      undo()
      expect(canRedo()).toBe(true)
      redo()
      expect(useGraphStore.getState().nodes).toHaveLength(1)
      expect(useGraphStore.getState().nodes[0].id).toBe('n1')
      expect(canRedo()).toBe(false)
    })

    it('after new mutation post-undo, redoStack is cleared and redo() is no-op', () => {
      const { addNode, deleteNode, undo, redo, canRedo } = useGraphStore.getState()
      addNode({
        id: 'n1',
        type: 'dialogueNode',
        position: { x: 0, y: 0 },
        data: { id: 'n1', speaker: '', line: '', choices: [] },
      })
      addNode({
        id: 'n2',
        type: 'dialogueNode',
        position: { x: 50, y: 0 },
        data: { id: 'n2', speaker: '', line: '', choices: [] },
      })
      undo()
      expect(canRedo()).toBe(true)
      deleteNode('n1')
      expect(canRedo()).toBe(false)
      redo()
      expect(useGraphStore.getState().nodes).toHaveLength(0)
    })
  })

  describe('clear on load/reset', () => {
    it('after loadDialogue(), undoStack and redoStack are empty', async () => {
      const { addNode, loadDialogue, canUndo, canRedo } = useGraphStore.getState()
      addNode({
        id: 'n1',
        type: 'dialogueNode',
        position: { x: 0, y: 0 },
        data: { id: 'n1', speaker: '', line: '', choices: [] },
      })
      expect(canUndo()).toBe(true)
      await loadDialogue('[]')
      expect(canUndo()).toBe(false)
      expect(canRedo()).toBe(false)
      expect(useGraphStore.getState().undoStack).toHaveLength(0)
      expect(useGraphStore.getState().redoStack).toHaveLength(0)
    })

    it('after resetGraph(), undoStack and redoStack are empty', () => {
      const { addNode, resetGraph, canUndo, canRedo } = useGraphStore.getState()
      addNode({
        id: 'n1',
        type: 'dialogueNode',
        position: { x: 0, y: 0 },
        data: { id: 'n1', speaker: '', line: '', choices: [] },
      })
      expect(canUndo()).toBe(true)
      resetGraph()
      expect(canUndo()).toBe(false)
      expect(canRedo()).toBe(false)
      expect(useGraphStore.getState().undoStack).toHaveLength(0)
      expect(useGraphStore.getState().redoStack).toHaveLength(0)
    })
  })

  describe('batch delete', () => {
    it('after batchDeleteNodes, one undo() restores all deleted nodes', () => {
      const { addNode, batchDeleteNodes, undo, canUndo } = useGraphStore.getState()
      addNode({
        id: 'n1',
        type: 'dialogueNode',
        position: { x: 0, y: 0 },
        data: { id: 'n1', speaker: '', line: '', choices: [] },
      })
      addNode({
        id: 'n2',
        type: 'dialogueNode',
        position: { x: 50, y: 0 },
        data: { id: 'n2', speaker: '', line: '', choices: [] },
      })
      addNode({
        id: 'n3',
        type: 'dialogueNode',
        position: { x: 100, y: 0 },
        data: { id: 'n3', speaker: '', line: '', choices: [] },
      })
      expect(useGraphStore.getState().nodes).toHaveLength(3)
      batchDeleteNodes(['n1', 'n2', 'n3'])
      expect(useGraphStore.getState().nodes).toHaveLength(0)
      expect(canUndo()).toBe(true)
      undo()
      expect(useGraphStore.getState().nodes).toHaveLength(3)
      expect(useGraphStore.getState().nodes.map((n) => n.id).sort()).toEqual(['n1', 'n2', 'n3'])
    })
  })

  describe('max 50 snapshots', () => {
    it('after 51 mutations, oldest snapshot is dropped', () => {
      const { addNode, deleteNode } = useGraphStore.getState()
      for (let i = 0; i < 52; i++) {
        addNode({
          id: `n${i}`,
          type: 'dialogueNode',
          position: { x: i * 10, y: 0 },
          data: { id: `n${i}`, speaker: '', line: '', choices: [] },
        })
      }
      expect(useGraphStore.getState().undoStack.length).toBeLessThanOrEqual(50)
      for (let i = 0; i < 52; i++) {
        deleteNode(`n${i}`)
      }
      expect(useGraphStore.getState().undoStack.length).toBeLessThanOrEqual(50)
    })
  })
})
