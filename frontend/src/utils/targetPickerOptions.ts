/**
 * Options pour sélecteurs de cibles de connexion (nœuds + END).
 */
import type { Node } from 'reactflow'
import type { ComboboxOption } from '../components/shared/Combobox'
import { formatTargetOptionLabel } from './nodeTargetLabel'

const END_VALUE = 'END'
const END_LABEL = 'Fin (END)'

export interface ListTargetPickerOptionsParams {
  /** Nœuds dont l’id ne doit pas apparaître (ex. nœud source pour nextNode). */
  excludeIds?: Iterable<string>
  /** Inclut l’entrée symbolique END (même si aucun endNode n’est dans le graphe). */
  includeEnd?: boolean
}

/**
 * Liste d’options pour brancher une cible (dialogue, fin, etc.) — exclut les TestNodes.
 */
export function listTargetPickerOptions(
  nodes: Node[],
  params: ListTargetPickerOptionsParams = {}
): ComboboxOption[] {
  const exclude = new Set(params.excludeIds ?? [])
  const includeEnd = params.includeEnd !== false
  const out: ComboboxOption[] = []

  if (includeEnd && !exclude.has(END_VALUE)) {
    out.push({ value: END_VALUE, label: END_LABEL })
  }

  const candidates = nodes.filter((node) => {
    if (node.type === 'testNode') return false
    if (exclude.has(node.id)) return false
    return true
  })

  for (const node of candidates) {
    if (node.id === END_VALUE && includeEnd) {
      continue
    }
    out.push({
      value: node.id,
      label: formatTargetOptionLabel(node, { showId: 'whenDistinct' }),
    })
  }

  out.sort((a, b) => {
    if (a.value === END_VALUE) return -1
    if (b.value === END_VALUE) return 1
    return a.label.localeCompare(b.label, undefined, { sensitivity: 'base' })
  })

  return out
}
