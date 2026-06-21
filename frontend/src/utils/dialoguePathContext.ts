/**
 * Reconstruction du chemin ancêtre START → parent pour les prompts de génération.
 */
import type { Node } from 'reactflow'
import type { Choice } from '../schemas/nodeEditorSchema'

export interface DialoguePathStep {
  speaker: string
  line: string
  playerChoiceAfter?: string
}

export interface UnityDialogueNodeSnapshot {
  id: string
  speaker: string
  line: string
  choices: Array<{ text: string; targetNode?: string }>
}

function textValue(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

export function serializeDialogueNodesForApi(nodes: Node[]): UnityDialogueNodeSnapshot[] {
  return nodes.map((node) => ({
    id: node.id,
    speaker: textValue(node.data?.speaker) || 'PNJ',
    line: textValue(node.data?.line),
    choices: ((node.data?.choices as Choice[] | undefined) ?? []).map((choice) => ({
      text: choice.text ?? '',
      targetNode: choice.targetNode,
    })),
  }))
}

function buildParentMap(
  nodes: UnityDialogueNodeSnapshot[],
): Map<string, { parent: UnityDialogueNodeSnapshot; choiceText: string }> {
  const byId = new Map(nodes.map((node) => [node.id, node]))
  const parentMap = new Map<string, { parent: UnityDialogueNodeSnapshot; choiceText: string }>()
  for (const node of nodes) {
    for (const choice of node.choices) {
      const target = choice.targetNode
      if (!target || target === 'END' || !byId.has(target)) continue
      if (!parentMap.has(target)) {
        parentMap.set(target, { parent: node, choiceText: choice.text ?? '' })
      }
    }
  }
  return parentMap
}

export function buildAncestorPathSteps(
  nodes: UnityDialogueNodeSnapshot[],
  targetNodeId: string,
): DialoguePathStep[] {
  const byId = new Map(nodes.map((node) => [node.id, node]))
  if (!byId.has(targetNodeId)) return []

  const parentMap = buildParentMap(nodes)
  const chain: Array<{ parent: UnityDialogueNodeSnapshot; choiceText: string }> = []
  let current = targetNodeId
  const visited = new Set<string>()
  while (parentMap.has(current) && !visited.has(current)) {
    visited.add(current)
    const link = parentMap.get(current)!
    chain.push(link)
    current = link.parent.id
  }
  chain.reverse()

  const steps: DialoguePathStep[] = chain.map(({ parent, choiceText }) => ({
    speaker: parent.speaker || 'PNJ',
    line: parent.line,
    playerChoiceAfter: choiceText || undefined,
  }))

  const target = byId.get(targetNodeId)!
  steps.push({
    speaker: target.speaker || 'PNJ',
    line: target.line,
  })
  return steps
}

export function formatGenerationPrompt(
  pathSteps: DialoguePathStep[],
  userInstructions: string,
  culminatingChoiceText?: string,
  playerChoiceLabel = "PJ",
): string {
  const lines = ["Historique du dialogue (du début jusqu'au nœud parent):"]
  if (pathSteps.length === 0) {
    lines.push('(aucun contexte antérieur)')
  }
  for (const step of pathSteps) {
    lines.push(`${step.speaker}: ${step.line}`)
    if (step.playerChoiceAfter) {
      lines.push(`${playerChoiceLabel}: ${step.playerChoiceAfter}`)
    }
  }
  if (culminatingChoiceText !== undefined) {
    lines.push('', 'Réponse du joueur (choix à développer):', culminatingChoiceText)
  }
  lines.push('', 'Instructions pour la suite:', userInstructions, '')
  return lines.join('\n')
}

export function buildEnrichedGenerationPrompt(options: {
  nodes: UnityDialogueNodeSnapshot[]
  parentNodeId: string
  parentSpeaker: string
  parentLine: string
  userInstructions: string
  choiceText?: string
  playerChoiceLabel?: string
}): string {
  const playerLabel = options.playerChoiceLabel ?? 'PJ'
  const pathSteps = buildAncestorPathSteps(options.nodes, options.parentNodeId)
  if (pathSteps.length > 0) {
    return formatGenerationPrompt(pathSteps, options.userInstructions, options.choiceText, playerLabel)
  }
  if (options.choiceText !== undefined) {
    return [
      'Contexte précédent:',
      `${options.parentSpeaker}: ${options.parentLine}`,
      '',
      'Réponse du joueur:',
      options.choiceText,
      '',
      'Instructions pour la suite:',
      options.userInstructions,
      '',
    ].join('\n')
  }
  return [
    'Contexte précédent:',
    `${options.parentSpeaker}: ${options.parentLine}`,
    '',
    'Instructions pour la suite:',
    options.userInstructions,
    '',
  ].join('\n')
}
