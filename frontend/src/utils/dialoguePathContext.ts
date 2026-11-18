/**
 * Reconstruction du chemin ancêtre START → parent pour les prompts de génération.
 * Miroir de `services/dialogue_path_context.py` : les deux doivent rester alignés.
 */
import type { Node } from 'reactflow'
import type { Choice } from '../schemas/nodeEditorSchema'

export interface DialoguePathStep {
  speaker: string
  line: string
  playerChoiceAfter?: string
  /** Issue du test du choix précédent, ex. « Échec du test Intelligence+Orientation:15 ». */
  testOutcomeAfter?: string
}

export interface UnityDialogueChoiceSnapshot {
  text: string
  targetNode?: string
  test?: string
  testSuccessNode?: string
  testCriticalSuccessNode?: string
  testFailureNode?: string
  testCriticalFailureNode?: string
}

export interface UnityDialogueNodeSnapshot {
  id: string
  speaker: string
  line: string
  choices: UnityDialogueChoiceSnapshot[]
}

type TestOutcomeField =
  | 'testSuccessNode'
  | 'testCriticalSuccessNode'
  | 'testFailureNode'
  | 'testCriticalFailureNode'

/** Issue normale avant l'issue critique : « réussite ou réussite critique ». */
const TEST_OUTCOME_FIELDS: ReadonlyArray<readonly [TestOutcomeField, string]> = [
  ['testSuccessNode', 'réussite'],
  ['testCriticalSuccessNode', 'réussite critique'],
  ['testFailureNode', 'échec'],
  ['testCriticalFailureNode', 'échec critique'],
]

function textValue(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

export function describeTestOutcome(test: string, outcomes: string[]): string {
  const label = outcomes.join(' ou ')
  return `${label.charAt(0).toUpperCase()}${label.slice(1)} du test ${test}`
}

/** Nœuds de dialogue au format Unity ; les TestNode, dérivés des choix testés, n'y sont pas. */
export function serializeDialogueNodesForApi(nodes: Node[]): UnityDialogueNodeSnapshot[] {
  return nodes
    .filter((node) => node.type !== 'testNode')
    .map((node) => ({
      id: node.id,
      speaker: textValue(node.data?.speaker) || 'PNJ',
      line: textValue(node.data?.line),
      choices: ((node.data?.choices as Choice[] | undefined) ?? []).map((choice) => ({
        text: choice.text ?? '',
        targetNode: choice.targetNode,
        test: choice.test || undefined,
        testSuccessNode: choice.testSuccessNode,
        testCriticalSuccessNode: choice.testCriticalSuccessNode,
        testFailureNode: choice.testFailureNode,
        testCriticalFailureNode: choice.testCriticalFailureNode,
      })),
    }))
}

interface ParentLink {
  parent: UnityDialogueNodeSnapshot
  choiceText: string
  testOutcome?: string
}

function linksFromChoice(
  choice: UnityDialogueChoiceSnapshot,
  knownIds: Set<string>,
): Array<{ target: string; testOutcome?: string }> {
  const links: Array<{ target: string; testOutcome?: string }> = []
  const test = (choice.test ?? '').trim()
  if (test) {
    const outcomesByTarget = new Map<string, string[]>()
    for (const [field, label] of TEST_OUTCOME_FIELDS) {
      const target = choice[field]
      if (!target || target === 'END' || !knownIds.has(target)) continue
      outcomesByTarget.set(target, [...(outcomesByTarget.get(target) ?? []), label])
    }
    for (const [target, outcomes] of outcomesByTarget) {
      links.push({ target, testOutcome: describeTestOutcome(test, outcomes) })
    }
  }
  const target = choice.targetNode
  if (target && target !== 'END' && knownIds.has(target)) {
    links.push({ target })
  }
  return links
}

function buildParentMap(nodes: UnityDialogueNodeSnapshot[]): Map<string, ParentLink> {
  const knownIds = new Set(nodes.map((node) => node.id))
  const parentMap = new Map<string, ParentLink>()
  for (const node of nodes) {
    for (const choice of node.choices) {
      for (const { target, testOutcome } of linksFromChoice(choice, knownIds)) {
        if (!parentMap.has(target)) {
          parentMap.set(target, { parent: node, choiceText: choice.text ?? '', testOutcome })
        }
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
  const chain: ParentLink[] = []
  let current = targetNodeId
  const visited = new Set<string>()
  while (parentMap.has(current) && !visited.has(current)) {
    visited.add(current)
    const link = parentMap.get(current)!
    chain.push(link)
    current = link.parent.id
  }
  chain.reverse()

  const steps: DialoguePathStep[] = chain.map(({ parent, choiceText, testOutcome }) => ({
    speaker: parent.speaker || 'PNJ',
    line: parent.line,
    playerChoiceAfter: choiceText || undefined,
    testOutcomeAfter: testOutcome,
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
    if (step.testOutcomeAfter) {
      lines.push(`[${step.testOutcomeAfter}]`)
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
