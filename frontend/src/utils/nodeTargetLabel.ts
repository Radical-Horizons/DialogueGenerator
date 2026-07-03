/**
 * Libellés pour cibles de connexion (jump-to, dropdowns) — aligné sur findNodesByQuery.
 */
import type { Node } from 'reactflow'

/** Données minimales pour dériver un libellé lisible. */
export interface NodeLabelData {
  title?: string
  displayName?: string
  label?: string
  line?: string
}

function trimmedField(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

/** True si le nœud a déjà un libellé structurel (FR36 : displayName, title ou label). */
export function nodeHasStructuralDisplayName(data: NodeLabelData): boolean {
  return Boolean(
    trimmedField(data.displayName) ||
      trimmedField(data.title) ||
      trimmedField(data.label)
  )
}

/**
 * Valeur proposée pour remplir `displayName` quand FR36 le signale manquant :
 * première ligne de `line`, sinon l’id du nœud (aligné sur nodeTargetDisplayLabel).
 */
export function deriveAutoDisplayName(node: Pick<Node, 'id' | 'data'>): string {
  return nodeTargetDisplayLabel(node)
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
