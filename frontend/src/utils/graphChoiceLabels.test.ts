import { describe, it, expect } from 'vitest'
import type { Edge, Node } from 'reactflow'
import {
  choiceHasNonemptyTest,
  countExpandedBatchNodesForChoices,
  getChoiceDisplayLabel,
} from './graphChoiceLabels'

describe('graphChoiceLabels', () => {
  it('countExpandedBatchNodesForChoices matches 4 per test + 1 plain', () => {
    const choices = [
      { targetNode: null, test: 'X:8' },
      { targetNode: null, test: 'Y:10' },
      { targetNode: null },
      { targetNode: 'NODE_A' },
    ]
    expect(countExpandedBatchNodesForChoices(choices)).toBe(4 + 4 + 1)
  })

  it('getChoiceDisplayLabel uses edge label when choice.text empty', () => {
    const parentId = 'P1'
    const nodes: Node[] = []
    const edges: Edge[] = [
      {
        id: 'e',
        source: parentId,
        target: 'T',
        sourceHandle: 'choice:__idx_3',
        label: 'Réplique du joueur',
        data: { edgeType: 'choice', choiceIndex: 3 },
      },
    ]
    const label = getChoiceDisplayLabel(parentId, { text: '' }, 3, nodes, edges)
    expect(label).toBe('Réplique du joueur')
  })

  it('choiceHasNonemptyTest', () => {
    expect(choiceHasNonemptyTest({ test: 'A:1' })).toBe(true)
    expect(choiceHasNonemptyTest({ test: '' })).toBe(false)
    expect(choiceHasNonemptyTest({})).toBe(false)
  })
})
