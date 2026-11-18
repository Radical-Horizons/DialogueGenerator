import type { Node } from 'reactflow'
import { describe, expect, it } from 'vitest'
import {
  buildAncestorPathSteps,
  buildEnrichedGenerationPrompt,
  formatGenerationPrompt,
  serializeDialogueNodesForApi,
} from './dialoguePathContext'

/** KO n'est atteint que par les issues d'échec du test : aucun `targetNode` n'y mène. */
const testOutcomeNodes = [
  {
    id: 'START',
    speaker: 'Voknir',
    line: 'Bienvenue.',
    choices: [{ text: 'Montrez-moi.', targetNode: 'SCARS' }],
  },
  {
    id: 'SCARS',
    speaker: 'Voknir',
    line: 'Seule ma chair compte.',
    choices: [
      {
        text: 'Lire les cicatrices.',
        test: 'Intelligence+Orientation:15',
        targetNode: 'OK',
        testSuccessNode: 'OK',
        testCriticalSuccessNode: 'OK',
        testFailureNode: 'KO',
        testCriticalFailureNode: 'KO',
      },
    ],
  },
  { id: 'OK', speaker: 'Voknir', line: 'Le pont apparaît.', choices: [] },
  { id: 'KO', speaker: 'Voknir', line: 'Les cartes se dérobent.', choices: [] },
]

const sampleNodes = [
  {
    id: 'START',
    speaker: 'Uresair',
    line: 'Bonjour.',
    choices: [{ text: 'Salut.', targetNode: 'N1' }],
  },
  {
    id: 'N1',
    speaker: 'Uresair',
    line: 'Content.',
    choices: [{ text: 'Suite ?', targetNode: 'N2' }],
  },
  {
    id: 'N2',
    speaker: 'Uresair',
    line: 'Fin.',
    choices: [],
  },
]

describe('dialoguePathContext', () => {
  it('builds ancestor chain with player choices', () => {
    const steps = buildAncestorPathSteps(sampleNodes, 'N2')
    expect(steps).toHaveLength(3)
    expect(steps[0].playerChoiceAfter).toBe('Salut.')
    expect(steps[1].playerChoiceAfter).toBe('Suite ?')
  })

  it('formats prompt with full history', () => {
    const steps = buildAncestorPathSteps(sampleNodes, 'N1')
    const prompt = formatGenerationPrompt(steps, 'Continue', 'Salut.')
    expect(prompt).toContain('Historique du dialogue')
    expect(prompt).toContain('Bonjour.')
    expect(prompt).toContain('PJ: Salut.')
  })

  it('follows test outcomes back to the tested choice', () => {
    const steps = buildAncestorPathSteps(testOutcomeNodes, 'KO')
    expect(steps.map((step) => step.line)).toEqual([
      'Bienvenue.',
      'Seule ma chair compte.',
      'Les cartes se dérobent.',
    ])
    expect(steps[1].playerChoiceAfter).toBe('Lire les cicatrices.')
    expect(steps[1].testOutcomeAfter).toBe(
      'Échec ou échec critique du test Intelligence+Orientation:15',
    )
    const prompt = formatGenerationPrompt(steps, 'Continue', undefined, 'Théomaque')
    expect(prompt).toContain(
      'Théomaque: Lire les cicatrices.\n[Échec ou échec critique du test Intelligence+Orientation:15]\nVoknir: Les cartes se dérobent.',
    )
  })

  it('serializes test outcome fields and drops derived TestNodes', () => {
    const graphNodes = [
      {
        id: 'SCARS',
        type: 'dialogueNode',
        position: { x: 0, y: 0 },
        data: { speaker: 'Voknir', line: 'Seule ma chair compte.', choices: testOutcomeNodes[1].choices },
      },
      {
        id: 'test-node-SCARS-choice-0',
        type: 'testNode',
        position: { x: 0, y: 0 },
        data: { test: 'Intelligence+Orientation:15', line: 'Lire les cicatrices.' },
      },
    ] as Node[]
    const snapshots = serializeDialogueNodesForApi(graphNodes)
    expect(snapshots.map((node) => node.id)).toEqual(['SCARS'])
    expect(snapshots[0].choices[0]).toMatchObject({
      test: 'Intelligence+Orientation:15',
      testFailureNode: 'KO',
      testCriticalFailureNode: 'KO',
      testSuccessNode: 'OK',
    })
  })

  it('uses full path in buildEnrichedGenerationPrompt', () => {
    const prompt = buildEnrichedGenerationPrompt({
      nodes: sampleNodes,
      parentNodeId: 'N2',
      parentSpeaker: 'Uresair',
      parentLine: 'Fin.',
      userInstructions: 'Suite',
      choiceText: 'Suite ?',
    })
    expect(prompt).toContain('Historique du dialogue')
    expect(prompt).toContain('Bonjour.')
  })
})
