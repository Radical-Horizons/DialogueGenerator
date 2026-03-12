/**
 * Story 2.9 FR30: helpers purs pour filtrer nodes/edges selon graphFilters.
 * Séparés pour testabilité (pas de dépendance Zustand).
 */
import type { Node, Edge } from 'reactflow'
import type { GraphFilters, NodeType } from '../../store/types/graphState'

const NODE_TYPE_MAP: Record<string, NodeType> = {
  dialogueNode: 'dialogue',
  testNode: 'test',
  endNode: 'end',
}

function nodeTypeFromReactFlow(type: string | undefined): NodeType | undefined {
  if (!type) return undefined
  return NODE_TYPE_MAP[type]
}

/**
 * Filtre les nœuds selon hiddenTypes et allowedSpeakers.
 * - hiddenTypes: nœuds dont le type est dans la liste sont exclus.
 * - allowedSpeakers: si défini et non vide, seuls les nœuds dont data.speaker est dans la liste sont conservés.
 * - Intersection: un nœud est visible s'il passe les deux critères.
 */
export function applyNodeFilters(nodes: Node[], filters: GraphFilters): Node[] {
  if (!filters.hiddenTypes?.length && !filters.allowedSpeakers?.length) {
    return nodes
  }
  return nodes.filter((node) => {
    const rfType = node.type ?? 'dialogueNode'
    const nodeType = nodeTypeFromReactFlow(rfType)
    if (filters.hiddenTypes?.length && nodeType && filters.hiddenTypes.includes(nodeType)) {
      return false
    }
    if (filters.allowedSpeakers?.length) {
      const speaker = (node.data as { speaker?: string })?.speaker?.trim()
      if (!speaker || !filters.allowedSpeakers.includes(speaker)) return false
    }
    return true
  })
}

/**
 * Filtre les edges : exclut celles dont source ou target n'est pas dans visibleNodeIds.
 */
export function applyEdgeFilters(
  edges: Edge[],
  visibleNodeIds: Set<string>,
  _filters: GraphFilters
): Edge[] {
  return edges.filter(
    (e) => visibleNodeIds.has(e.source) && visibleNodeIds.has(e.target)
  )
}
