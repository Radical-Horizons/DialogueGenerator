/**
 * Export Unity : même pipeline que graphToDocument (full-review remediation).
 */
import { describe, it, expect, beforeEach } from 'vitest'
import type { Node } from 'reactflow'
import { useGraphStore } from '../store/graphStore'
import { graphToDocument } from '../utils/documentToGraph'

describe('exportToUnity', () => {
  beforeEach(() => {
    useGraphStore.getState().resetGraph()
  })

  it('matches graphToDocument when keepStatusForDraft is false', () => {
    const n1: Node = {
      id: 'a',
      type: 'dialogueNode',
      position: { x: 0, y: 0 },
      data: { id: 'a', speaker: 'S', line: 'L', choices: [] },
    }
    useGraphStore.getState().addNode(n1)
    const { nodes, edges } = useGraphStore.getState()
    const doc = graphToDocument(nodes, edges)
    const exported = useGraphStore.getState().exportToUnity()
    expect(JSON.parse(exported)).toEqual(doc)
  })

  it('keepStatusForDraft preserves status on nodes', () => {
    const n1: Node = {
      id: 'a',
      type: 'dialogueNode',
      position: { x: 0, y: 0 },
      data: { id: 'a', speaker: 'S', line: 'L', choices: [], status: 'pending' },
    }
    useGraphStore.getState().addNode(n1)
    const withStatus = useGraphStore.getState().exportToUnity({ keepStatusForDraft: true })
    const parsed = JSON.parse(withStatus) as { nodes: Array<{ status?: string }> }
    expect(parsed.nodes[0]?.status).toBe('pending')
    const stripped = useGraphStore.getState().exportToUnity()
    const parsed2 = JSON.parse(stripped) as { nodes: Array<{ status?: string }> }
    expect(parsed2.nodes[0]?.status).toBeUndefined()
  })
})
