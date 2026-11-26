import { describe, expect, it } from 'vitest'
import type { Edge, Node } from 'reactflow'
import { buildGraphApiPayload } from './buildGraphApiPayload'

describe('buildGraphApiPayload', () => {
  it('recopie le sourceHandle des arêtes, sans lequel save-and-write perd les issues des tests', () => {
    const nodes: Node[] = [
      { id: 'node-a', type: 'dialogueNode', position: { x: 0, y: 0 }, data: {} },
      { id: 'test-node-node-a-choice-0', type: 'testNode', position: { x: 0, y: 0 }, data: {} },
      { id: 'node-b', type: 'dialogueNode', position: { x: 0, y: 0 }, data: {} },
    ]
    const edges: Edge[] = [
      {
        id: 'e-choice',
        source: 'node-a',
        target: 'test-node-node-a-choice-0',
        sourceHandle: 'choice:c0',
        data: { edgeType: 'choice', choiceIndex: 0 },
      },
      { id: 'e-success', source: 'test-node-node-a-choice-0', target: 'node-b', sourceHandle: 'success' },
      { id: 'e-plain', source: 'node-b', target: 'node-a', sourceHandle: null },
    ]

    const payload = buildGraphApiPayload(nodes, edges)

    expect(payload.edges.map((e) => e.sourceHandle)).toEqual(['choice:c0', 'success', undefined])
    expect(JSON.parse(JSON.stringify(payload.edges[2]))).not.toHaveProperty('sourceHandle')
  })
})
