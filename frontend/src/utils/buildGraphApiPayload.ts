/**
 * Payload graphe partagé entre validate-schema et save-and-write (Story 5.1 / 5.3).
 */
import type { Edge, Node } from 'reactflow'
import type { DialogueFlagBinding } from '../types/dialogueFlags'
import { applyBindingsToDocument } from './dialogueFlagBindings'

export interface GraphApiNodePayload {
  id: string
  type: string
  position: { x: number; y: number }
  data: Record<string, unknown>
}

export interface GraphApiEdgePayload {
  id: string
  source: string
  target: string
  type?: string
  label?: string
  data?: Record<string, unknown>
}

export interface GraphApiPayload {
  nodes: GraphApiNodePayload[]
  edges: GraphApiEdgePayload[]
}

export interface GraphSchemaApiPayload extends GraphApiPayload {
  dialogue_flags?: Array<{
    flagId: string
    type: string
    initialValue: boolean | number | string
  }>
}

/** Sérialise nodes/edges React Flow pour les endpoints unity-dialogues/graph/*. */
export function buildGraphApiPayload(nodes: Node[], edges: Edge[]): GraphApiPayload {
  return {
    nodes: nodes.map((n) => ({
      id: n.id,
      type: n.type ?? 'dialogueNode',
      position: n.position,
      data: n.data as Record<string, unknown>,
    })),
    edges: edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      type: e.type,
      label: typeof e.label === 'string' ? e.label : undefined,
      data: e.data as Record<string, unknown> | undefined,
    })),
  }
}

/** Payload validate-schema / save-and-write incluant dialogueFlags GDD (Story 5.3). */
export function buildGraphSchemaApiPayload(
  nodes: Node[],
  edges: Edge[],
  dialogueFlagBindings: DialogueFlagBinding[],
): GraphSchemaApiPayload {
  const payload = buildGraphApiPayload(nodes, edges)
  if (dialogueFlagBindings.length === 0) {
    return payload
  }
  const doc: Record<string, unknown> = {}
  applyBindingsToDocument(doc, dialogueFlagBindings)
  const flags = doc.dialogueFlags
  if (!Array.isArray(flags)) {
    return payload
  }
  return {
    ...payload,
    dialogue_flags: flags as GraphSchemaApiPayload['dialogue_flags'],
  }
}
