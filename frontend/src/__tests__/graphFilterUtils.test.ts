/**
 * Story 2.9 FR30: tests unitaires applyNodeFilters / applyEdgeFilters.
 */
import { describe, it, expect } from 'vitest'
import type { Node, Edge } from 'reactflow'
import { applyNodeFilters, applyEdgeFilters } from '../components/graph/graphFilterUtils'

function node(id: string, type: string, speaker?: string): Node {
  return {
    id,
    type,
    position: { x: 0, y: 0 },
    data: speaker !== undefined ? { speaker } : {},
  }
}

function edge(id: string, source: string, target: string): Edge {
  return { id, source, target }
}

describe('applyNodeFilters', () => {
  it('returns all nodes when filters empty', () => {
    const nodes = [
      node('a', 'dialogueNode'),
      node('b', 'testNode'),
      node('c', 'endNode'),
    ]
    expect(applyNodeFilters(nodes, {})).toEqual(nodes)
    expect(applyNodeFilters(nodes, { hiddenTypes: [], allowedSpeakers: [] })).toEqual(nodes)
  })

  it('excludes test nodes when hiddenTypes contains "test"', () => {
    const nodes = [
      node('a', 'dialogueNode'),
      node('b', 'testNode'),
      node('c', 'endNode'),
    ]
    const result = applyNodeFilters(nodes, { hiddenTypes: ['test'] })
    expect(result.map((n) => n.id)).toEqual(['a', 'c'])
  })

  it('excludes dialogue and end when hiddenTypes has multiple', () => {
    const nodes = [
      node('a', 'dialogueNode'),
      node('b', 'testNode'),
      node('c', 'endNode'),
    ]
    const result = applyNodeFilters(nodes, { hiddenTypes: ['dialogue', 'end'] })
    expect(result.map((n) => n.id)).toEqual(['b'])
  })

  it('filters by allowedSpeakers', () => {
    const nodes = [
      node('a', 'dialogueNode', 'Akthar'),
      node('b', 'dialogueNode', 'Other'),
      node('c', 'dialogueNode', 'Akthar'),
    ]
    const result = applyNodeFilters(nodes, { allowedSpeakers: ['Akthar'] })
    expect(result.map((n) => n.id)).toEqual(['a', 'c'])
  })

  it('intersection: hiddenTypes + allowedSpeakers', () => {
    const nodes = [
      node('a', 'dialogueNode', 'Akthar'),
      node('b', 'testNode', 'Akthar'),
      node('c', 'dialogueNode', 'Other'),
    ]
    const result = applyNodeFilters(nodes, {
      hiddenTypes: ['test'],
      allowedSpeakers: ['Akthar'],
    })
    expect(result.map((n) => n.id)).toEqual(['a'])
  })
})

describe('applyEdgeFilters', () => {
  it('keeps only edges whose source and target are in visibleNodeIds', () => {
    const edges = [
      edge('e1', 'a', 'b'),
      edge('e2', 'b', 'c'),
      edge('e3', 'c', 'd'),
    ]
    const visible = new Set(['a', 'b', 'c'])
    const result = applyEdgeFilters(edges, visible)
    expect(result.map((e) => e.id)).toEqual(['e1', 'e2'])
  })

  it('returns empty when no visible nodes', () => {
    const edges = [edge('e1', 'a', 'b')]
    expect(applyEdgeFilters(edges, new Set())).toEqual([])
  })
})
