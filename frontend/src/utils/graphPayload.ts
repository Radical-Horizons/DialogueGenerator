/**
 * Conversion nœuds / arêtes React Flow → payload API (`GraphNodePayload`, `GraphEdgePayload`).
 *
 * Trois panneaux d'analyse (qualité LLM, AI slop, context dropping) recopiaient la même
 * projection. Le point délicat est `Edge.label` : React Flow le type `ReactNode`, alors que
 * le payload part en JSON — seul un label texte a du sens côté backend, le reste est ignoré.
 */
import type { Edge, Node } from 'reactflow'
import type { GraphEdgePayload, GraphNodePayload } from '../types/graph'

export function toGraphNodePayloads(nodes: Node[]): GraphNodePayload[] {
  return nodes.map((n) => ({
    id: n.id,
    type: n.type,
    position: n.position,
    data: n.data,
  }))
}

export function toGraphEdgePayloads(edges: Edge[]): GraphEdgePayload[] {
  return edges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    type: e.type,
    label: typeof e.label === 'string' ? e.label : undefined,
    data: e.data,
  }))
}
