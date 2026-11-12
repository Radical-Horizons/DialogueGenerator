/**
 * Helper partagé pour synchroniser document + layout depuis la projection nodes/edges courante.
 * Extrait le pattern répété 8× dans graphStore.ts pour éviter toute divergence silencieuse.
 */
import type { Node, Edge } from 'reactflow'
import { graphToDocument, buildLayoutFromNodes, type LayoutPositions } from './documentToGraph'

/**
 * Fusionne un layout existant avec les positions courantes des nœuds.
 * Les positions calculées depuis `nodes` priment toujours pour éviter
 * qu'un layout stale écrase la géométrie réellement affichée.
 */
export function mergeLayoutWithNodePositions(
  currentLayout: Record<string, unknown> | LayoutPositions | null | undefined,
  nodes: Node[]
): Record<string, unknown> {
  const newPositions = buildLayoutFromNodes(nodes)
  const layoutNodes = currentLayout?.['nodes'] as
    | Record<string, { x: number; y: number }>
    | undefined
  return {
    ...(currentLayout ?? {}),
    nodes: {
      ...(layoutNodes ?? {}),
      ...newPositions.nodes,
    },
  }
}

/**
 * Recalcule le document canonique et le layout à partir des nodes/edges ReactFlow courants.
 * Fusionne les positions existantes du layout avec les nouvelles positions calculées.
 *
 * @param nodes - Nœuds ReactFlow courants
 * @param edges - Edges ReactFlow courants
 * @param currentLayout - Layout actuel (contient les positions persistées)
 * @param currentDocument - Document actuel : ses champs de tête (titre…) sont conservés, le graphe
 *   ne portant que les nœuds
 * @returns `{ document, layout }` prêts à être écrits dans le store
 */
export function syncDocAndLayout(
  nodes: Node[],
  edges: Edge[],
  currentLayout: Record<string, unknown>,
  currentDocument?: Record<string, unknown> | null
): { document: Record<string, unknown>; layout: Record<string, unknown> } {
  const projected = graphToDocument(nodes, edges) as unknown as Record<string, unknown>
  const doc = currentDocument ? { ...currentDocument, ...projected } : projected
  const newLayout = mergeLayoutWithNodePositions(currentLayout, nodes)
  return { document: doc, layout: newLayout }
}
