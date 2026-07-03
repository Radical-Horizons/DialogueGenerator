/**
 * Tests moteur playthrough scénario (VN mode).
 */
import { describe, it, expect } from 'vitest'
import type { Node, Edge } from 'reactflow'
import {
  findPlaythroughStartNode,
  playthroughChoiceKey,
  applyPlaythroughChoice,
  computePlaythroughCoverage,
  resolvePlaythroughStep,
} from './scenarioPlaythroughEngine'

function dialogueNode(
  id: string,
  line: string,
  choices?: Array<{ text: string; targetNode?: string; choiceEffects?: unknown[] }>,
  nextNode?: string,
): Node {
  return {
    id,
    type: 'dialogueNode',
    position: { x: 0, y: 0 },
    data: { id, line, speaker: 'NPC', choices, nextNode },
  }
}

describe('scenarioPlaythroughEngine', () => {
  it('findPlaythroughStartNode préfère START', () => {
    const nodes = [dialogueNode('OTHER', 'x'), dialogueNode('START', 'hello')]
    expect(findPlaythroughStartNode(nodes, [])).toBe('START')
  })

  it('navigue via targetNode et marque choix', () => {
    const nodes = [
      dialogueNode('START', 'Hi', [
        { text: 'Go', targetNode: 'B' },
        { text: 'Stay', targetNode: 'C' },
      ]),
      dialogueNode('B', 'Branch B'),
    ]
    const edges: Edge[] = []
    const result = applyPlaythroughChoice(
      'START',
      0,
      { nodes, edges },
      { flags: {}, reputation: {} },
      {
        attributes: {},
        skills: {},
        effortPool: 10,
        reputationValues: {},
        factionTitles: {},
        simulationLimits: [],
      },
      undefined,
      null,
    )
    expect('error' in result).toBe(false)
    if ('error' in result) return
    expect(result.nextNodeId).toBe('B')
    expect(result.choiceKey).toBe(playthroughChoiceKey('START', 0))
  })

  it('continueTarget pour nœud linéaire sans choix', () => {
    const nodes = [dialogueNode('A', 'Line', undefined, 'B'), dialogueNode('B', 'Next')]
    const step = resolvePlaythroughStep(
      'A',
      { nodes, edges: [] },
      {
        evalState: { flags: {}, reputation: {} },
        gameSystemsState: {
          attributes: {},
          skills: {},
          effortPool: 10,
          reputationValues: {},
          factionTitles: {},
          simulationLimits: [],
        },
        visitedChoiceKeys: {},
        forcedSkillCheckIssue: null,
      },
    )
    expect(step?.continueTarget).toBe('B')
    expect(step?.choices).toHaveLength(0)
  })

  it('computePlaythroughCoverage compte choix non testés', () => {
    const nodes = [
      dialogueNode('START', 'Hi', [
        { text: 'A', targetNode: 'X' },
        { text: 'B', targetNode: 'Y' },
      ]),
    ]
    const coverage = computePlaythroughCoverage(
      { nodes, edges: [] },
      { flags: {}, reputation: {} },
      { START: true },
      { [playthroughChoiceKey('START', 0)]: true },
    )
    expect(coverage.untestedChoiceCount).toBe(1)
    expect(coverage.totalAccessibleChoiceCount).toBe(2)
  })
})
