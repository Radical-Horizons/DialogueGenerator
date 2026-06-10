import type { Node } from 'reactflow'
import type { Choice } from '../schemas/nodeEditorSchema'
import type { NodePromptResponse } from '../types/graph'
import { getParentChoiceForTestNode } from './testNodeSync'

const DEFAULT_INSTRUCTIONS = 'Ecris la réponse du PNJ à ce que dit le PJ'

function textValue(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function buildPrompt(parentLine: string, parentSpeaker: string, choiceText?: string): string {
  if (choiceText !== undefined) {
    return [
      'Contexte précédent:',
      `${parentSpeaker}: ${parentLine}`,
      '',
      'Réponse du joueur:',
      choiceText,
      '',
      'Instructions pour la suite:',
      DEFAULT_INSTRUCTIONS,
      '',
    ].join('\n')
  }
  return [
    'Contexte précédent:',
    `${parentSpeaker}: ${parentLine}`,
    '',
    'Instructions pour la suite:',
    DEFAULT_INSTRUCTIONS,
    '',
  ].join('\n')
}

export function reconstructNodePromptFromGraph(nodeId: string, nodes: Node[]): NodePromptResponse | null {
  const testParent = getParentChoiceForTestNode(nodeId, nodes)
  if (testParent) {
    return {
      raw_prompt: buildPrompt(
        textValue(testParent.dialogueNode.data?.line),
        textValue(testParent.dialogueNode.data?.speaker) || 'PNJ',
        testParent.choice.text || '',
      ),
      prompt_tokens: null,
      completion_tokens: null,
      timestamp: null,
      is_historical: false,
      message: 'Prompt reconstruit depuis le graphe courant (nœud de test)',
    }
  }

  const node = nodes.find((n) => n.id === nodeId)
  if (!node) return null

  for (const candidateParent of nodes) {
    const choices = (candidateParent.data?.choices as Choice[] | undefined) ?? []
    const choice = choices.find((c) => c.targetNode === nodeId)
    if (choice) {
      return {
        raw_prompt: buildPrompt(
          textValue(candidateParent.data?.line),
          textValue(candidateParent.data?.speaker) || 'PNJ',
          choice.text || '',
        ),
        prompt_tokens: null,
        completion_tokens: null,
        timestamp: null,
        is_historical: false,
        message: 'Prompt reconstruit depuis le graphe courant',
      }
    }
  }

  return {
    raw_prompt: buildPrompt(textValue(node.data?.line), textValue(node.data?.speaker) || 'PNJ'),
    prompt_tokens: null,
    completion_tokens: null,
    timestamp: null,
    is_historical: false,
    message: 'Prompt reconstruit depuis le nœud courant',
  }
}
