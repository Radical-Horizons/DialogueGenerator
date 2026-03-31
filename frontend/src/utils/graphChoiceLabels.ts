/**
 * Libellés et comptage batch pour les choix du graphe (aligné backend : test → 4 nœuds).
 */
import type { Edge, Node } from 'reactflow'

export function choiceHasNonemptyTest(choice: { test?: unknown }): boolean {
  const tv = choice.test
  return tv != null && (typeof tv !== 'string' || String(tv).trim() !== '')
}

/**
 * Nombre de nœuds générés pour « tous les choix » (même règle que `_batch_count_from_request`).
 */
export function countExpandedBatchNodesForChoices(
  choices: Array<{ targetNode?: string | null; test?: unknown }> | undefined | null
): number {
  if (!choices?.length) return 0
  let n = 0
  for (const c of choices) {
    const target = c.targetNode
    if (target && target !== 'END') continue
    n += choiceHasNonemptyTest(c) ? 4 : 1
  }
  return n
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
