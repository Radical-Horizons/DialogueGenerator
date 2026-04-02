/**
 * Libellés pour cibles de connexion (jump-to, dropdowns) — aligné sur findNodesByQuery.
 */
import type { Node } from 'reactflow'

/** Données minimales pour dériver un libellé lisible. */
export interface NodeLabelData {
  title?: string
  displayName?: string
  line?: string
}

/**
 * Libellé principal d’un nœud pour recherche / liste (sans suffixe id).
 */
export function nodeTargetDisplayLabel(node: Pick<Node, 'id' | 'data'>): string {
  const data = (node.data ?? {}) as NodeLabelData
  const firstLine =
    typeof data.line === 'string' ? (data.line.split('\n')[0]?.trim() ?? '') : ''
  return (data.title?.trim() || data.displayName?.trim() || firstLine || node.id) as string
}

export type ShowIdMode = 'always' | 'whenDistinct'

export interface FormatTargetOptionLabelOptions {
  showId?: ShowIdMode
}

/**
 * Libellé d’option pour un sélecteur de cible (ex. « Titre (node-1) »).
 */
export function formatTargetOptionLabel(
  node: Pick<Node, 'id' | 'data'>,
  opts: FormatTargetOptionLabelOptions = {}
): string {
  const { showId = 'whenDistinct' } = opts
  const base = nodeTargetDisplayLabel(node)
  if (showId === 'always') {
    return base === node.id ? node.id : `${base} (${node.id})`
  }
  return base === node.id ? base : `${base} (${node.id})`
}
