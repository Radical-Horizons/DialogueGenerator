/**
 * Libellés et comptage batch pour les choix du graphe (aligné backend : un nœud par emplacement vide).
 */
import type { Edge, Node } from 'reactflow'
import { TEST_RESULT_EDGE_CONFIG } from './graphEdgeBuilders'

export function choiceHasNonemptyTest(choice: { test?: unknown }): boolean {
  const tv = choice.test
  return tv != null && (typeof tv !== 'string' || String(tv).trim() !== '')
}

export interface SlotChoice {
  targetNode?: string | null
  test?: unknown
  testCriticalFailureNode?: string | null
  testFailureNode?: string | null
  testSuccessNode?: string | null
  testCriticalSuccessNode?: string | null
}

const isOpenTarget = (target: string | null | undefined): boolean => !target || target === 'END'

/** Nœuds qu'un lot écrit sous ce choix (miroir de `services/graph_choice_slots.py`). */
function countOpenSlots(choice: SlotChoice): number {
  if (!isOpenTarget(choice.targetNode)) return 0
  if (!choiceHasNonemptyTest(choice)) return 1
  return TEST_RESULT_EDGE_CONFIG.filter(({ field }) => isOpenTarget(choice[field])).length
}

export function choiceHasOpenSlot(choice: SlotChoice): boolean {
  return countOpenSlots(choice) > 0
}

/** Nombre de nœuds générés pour « tous les choix » : les emplacements encore vides. */
export function countExpandedBatchNodesForChoices(
  choices: SlotChoice[] | undefined | null
): number {
  return (choices ?? []).reduce((total, choice) => total + countOpenSlots(choice), 0)
}

const GENERIC_CHOIX_RE = /^Choix\s+\d+$/i

function isGenericChoixLabel(s: string): boolean {
  return GENERIC_CHOIX_RE.test(s.trim())
}

/**
 * Texte affichable pour un choix (panneau IA, tooltips) : texte du nœud, sinon edge, sinon TestNode.
 */
export function getChoiceDisplayLabel(
  parentNodeId: string,
  choice: { text?: unknown; test?: unknown; choiceId?: string; line?: unknown },
  index: number,
  nodes: Node[],
  edges: Edge[]
): string {
  const fromText = (v: unknown): string =>
    typeof v === 'string' && v.trim() !== '' ? v.trim() : ''

  const direct = fromText(choice.text) || fromText(choice.line)
  if (direct) return direct

  const stableId = choice.choiceId ?? `__idx_${index}`
  const edge =
    edges.find(
      (e) =>
        e.source === parentNodeId &&
        (e.data as { choiceIndex?: number } | undefined)?.choiceIndex === index &&
        (e.data as { edgeType?: string } | undefined)?.edgeType === 'choice'
    ) ??
    edges.find((e) => e.source === parentNodeId && e.sourceHandle === `choice:${stableId}`)

  if (edge?.data) {
    const d = edge.data as { choiceText?: string }
    const ct = fromText(d.choiceText)
    if (ct && !isGenericChoixLabel(ct)) return ct
  }

  if (edge?.label != null && typeof edge.label === 'string') {
    const lab = edge.label.trim()
    if (lab && !isGenericChoixLabel(lab)) return lab
  }

  const legacyTestId = `test-node-${parentNodeId}-choice-${index}`
  const tn = nodes.find((n) => n.id === legacyTestId && n.type === 'testNode')
  if (tn?.data) {
    const line = fromText((tn.data as { line?: string }).line)
    if (line) return line
  }

  const choiceId = typeof choice.choiceId === 'string' ? choice.choiceId : ''
  if (choiceId && !choiceId.startsWith('__idx_')) {
    const byTestPrefix = nodes.find((n) => n.id === `test:${choiceId}` && n.type === 'testNode')
    if (byTestPrefix?.data) {
      const line = fromText((byTestPrefix.data as { line?: string }).line)
      if (line) return line
    }
  }

  return `Choix ${index + 1}`
}
