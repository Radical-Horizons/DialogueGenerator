import type { Node } from 'reactflow'
import type { Choice } from '../schemas/nodeEditorSchema'
import type { NodePromptResponse } from '../types/graph'
import { getParentChoiceForTestNode } from './testNodeSync'
import {
  buildEnrichedGenerationPrompt,
  serializeDialogueNodesForApi,
} from './dialoguePathContext'

const DEFAULT_INSTRUCTIONS =
  'Ecris la réponse du PNJ à ce que dit le PJ. ' +
  '2 à 5 phrases, concis et jouable ; même registre tu/vous que le START.'

function textValue(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function buildPromptFromGraph(
  nodes: Node[],
  parentNode: Node,
  choiceText?: string,
): string {
  const snapshots = serializeDialogueNodesForApi(nodes)
  return buildEnrichedGenerationPrompt({
    nodes: snapshots,
    parentNodeId: parentNode.id,
    parentSpeaker: textValue(parentNode.data?.speaker) || 'PNJ',
    parentLine: textValue(parentNode.data?.line),
    userInstructions: DEFAULT_INSTRUCTIONS,
    choiceText,
  })
}

export function reconstructNodePromptFromGraph(nodeId: string, nodes: Node[]): NodePromptResponse | null {
  const testParent = getParentChoiceForTestNode(nodeId, nodes)
  if (testParent) {
    return {
      raw_prompt: buildPromptFromGraph(
        nodes,
        testParent.dialogueNode,
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
        raw_prompt: buildPromptFromGraph(
          nodes,
          candidateParent,
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
    raw_prompt: buildPromptFromGraph(nodes, node),
    prompt_tokens: null,
    completion_tokens: null,
    timestamp: null,
    is_historical: false,
    message: 'Prompt reconstruit depuis le nœud courant',
  }
}
