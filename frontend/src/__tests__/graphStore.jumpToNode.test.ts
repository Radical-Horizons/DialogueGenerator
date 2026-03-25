/**
 * Story 2.8 FR29: jumpToNode et findNodesByQuery.
 * - jumpToNode(nodeId): setSelectedNode + focusNode via graphViewStore ; no-op si nodeId absent.
 * - findNodesByQuery(query): match exact id, match partiel insensible casse sur nom (displayName ?? line ?? id).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useGraphStore } from '../store/graphStore'
import { useGraphViewStore } from '../store/graphViewStore'
import type { Node } from 'reactflow'

vi.mock('../api/graph', () => ({
  loadGraph: vi.fn(),
  saveGraph: vi.fn(),
  saveGraphAndWrite: vi.fn(),
  generateNode: vi.fn(),
  validateGraph: vi.fn(),
  calculateLayout: vi.fn(),
}))

function resetStores() {
  useGraphStore.getState().resetGraph()
  useGraphViewStore.getState().clearFocus()
}

describe('graphStore - jumpToNode (Story 2.8)', () => {
  beforeEach(() => resetStores())

  it('jumpToNode(nodeId) calls setSelectedNode and enqueue focus when node exists', () => {
    const { addNode, jumpToNode } = useGraphStore.getState()
    const n1: Node = {
      id: 'node_abc123',
      type: 'dialogueNode',
      position: { x: 0, y: 0 },
      data: {},
    }
    addNode(n1)

    jumpToNode('node_abc123')

    expect(useGraphStore.getState().selectedNodeId).toBe('node_abc123')
    expect(useGraphViewStore.getState().focusQueue).toEqual(['node_abc123'])
  })

  it('jumpToNode(nodeId) does not set focus when nodeId absent in nodes', () => {
    const { addNode, jumpToNode } = useGraphStore.getState()
    addNode({
      id: 'n1',
      type: 'dialogueNode',
      position: { x: 0, y: 0 },
      data: {},
    })

    jumpToNode('nonexistent_id')

    expect(useGraphStore.getState().selectedNodeId).toBeNull()
    expect(useGraphViewStore.getState().focusQueue).toEqual([])
  })
})

describe('graphStore - findNodesByQuery (Story 2.8)', () => {
  beforeEach(() => resetStores())

  it('returns exact id match first, then partial name matches (case insensitive)', () => {
    const { addNode, findNodesByQuery } = useGraphStore.getState()
    addNode({
      id: 'node_1',
      type: 'dialogueNode',
      position: { x: 0, y: 0 },
      data: { line: 'Opening Scene', displayName: 'Opening' },
    })
    addNode({
      id: 'node_2',
      type: 'dialogueNode',
      position: { x: 100, y: 0 },
      data: { line: 'Scene 1 dialogue', displayName: 'Scene 1' },
    })
    addNode({
      id: 'node_3',
      type: 'dialogueNode',
      position: { x: 200, y: 0 },
      data: { line: 'Scene 1 alternate' },
    })

    const exactId = findNodesByQuery('node_1')
    expect(exactId).toHaveLength(1)
    expect(exactId[0].id).toBe('node_1')
    expect(exactId[0].label).toBe('Opening')

    const byName = findNodesByQuery('scene 1')
    expect(byName.map((n) => n.id)).toContain('node_2')
    expect(byName.map((n) => n.id)).toContain('node_3')
    expect(byName[0].label.toLowerCase()).toMatch(/scene 1/)
  })

  it('uses title ?? displayName ?? first line of data.line ?? node.id for label', () => {
    const { addNode, findNodesByQuery } = useGraphStore.getState()
    addNode({
      id: 'id_a',
      type: 'dialogueNode',
      position: { x: 0, y: 0 },
      data: { displayName: 'Custom Name' },
    })
    addNode({
      id: 'id_b',
      type: 'dialogueNode',
      position: { x: 0, y: 0 },
      data: { line: 'First line\nSecond line' },
    })
    addNode({
      id: 'id_c',
      type: 'dialogueNode',
      position: { x: 0, y: 0 },
      data: {},
    })

    expect(findNodesByQuery('Custom Name')[0].label).toBe('Custom Name')
    expect(findNodesByQuery('First line')[0].label).toBe('First line')
    expect(findNodesByQuery('id_c')[0].label).toBe('id_c')
  })

  it('prefers title over displayName and line for label', () => {
    const { addNode, findNodesByQuery } = useGraphStore.getState()
    addNode({
      id: 'id_t',
      type: 'dialogueNode',
      position: { x: 0, y: 0 },
      data: { title: 'Scene Title', displayName: 'Other', line: 'Spoken line' },
    })
    expect(findNodesByQuery('Scene Title')[0].label).toBe('Scene Title')
  })

  it('returns empty array for empty query', () => {
    const { addNode, findNodesByQuery } = useGraphStore.getState()
    addNode({
      id: 'n1',
      type: 'dialogueNode',
      position: { x: 0, y: 0 },
      data: {},
    })
    expect(findNodesByQuery('')).toEqual([])
    expect(findNodesByQuery('   ')).toEqual([])
  })

  it('returns empty when no match', () => {
    const { addNode, findNodesByQuery } = useGraphStore.getState()
    addNode({
      id: 'n1',
      type: 'dialogueNode',
      position: { x: 0, y: 0 },
      data: { line: 'Hello' },
    })
    expect(findNodesByQuery('xyznone')).toEqual([])
  })
})
