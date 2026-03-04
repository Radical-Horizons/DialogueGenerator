/**
 * Helper partagé pour synchroniser document + layout depuis la projection nodes/edges courante.
 * Extrait le pattern répété 8× dans graphStore.ts pour éviter toute divergence silencieuse.
 */
import type { Node, Edge } from 'reactflow'
import { graphToDocument, buildLayoutFromNodes } from './documentToGraph'

/**
 * Recalcule le document canonique et le layout à partir des nodes/edges ReactFlow courants.
 * Fusionne les positions existantes du layout avec les nouvelles positions calculées.
 *
 * @param nodes - Nœuds ReactFlow courants
 * @param edges - Edges ReactFlow courants
 * @param currentLayout - Layout actuel (contient les positions persistées)
 * @returns `{ document, layout }` prêts à être écrits dans le store
 */
export function syncDocAndLayout(
  nodes: Node[],
  edges: Edge[],
  currentLayout: Record<string, unknown>
): { document: Record<string, unknown>; layout: Record<string, unknown> } {
  const doc = graphToDocument(nodes, edges) as unknown as Record<string, unknown>
  const newPositions = buildLayoutFromNodes(nodes)
  const layoutNodes = currentLayout?.['nodes'] as
    | Record<string, { x: number; y: number }>
    | undefined
  const mergedNodes = { ...layoutNodes, ...newPositions.nodes }
  const newLayout = { ...currentLayout, nodes: mergedNodes }
  return { document: doc, layout: newLayout }
}
