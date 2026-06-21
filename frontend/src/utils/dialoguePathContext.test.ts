import { describe, expect, it } from 'vitest'
import {
  buildAncestorPathSteps,
  buildEnrichedGenerationPrompt,
  formatGenerationPrompt,
} from './dialoguePathContext'

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
