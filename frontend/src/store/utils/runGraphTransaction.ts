/**
 * Helper pour unifier les mutations du graphe dans les slices.
 *
 * Encapsule le pattern récurrent :
 *   1. _pushUndoSnapshot()
 *   2. mutation → nouveau state partiel { nodes, edges, ... }
 *   3. syncDocAndLayout() si le store utilise un document SoT
 *   4. markDirty()
 *
 * Usage dans un slice :
 *   runGraphTransaction(get, set, (state) => ({ nodes: newNodes, edges: newEdges }))
 */
import type { Node, Edge } from 'reactflow'
import type { GraphState } from '../types/graphState'
import { syncDocAndLayout } from '../../utils/syncDocLayout'

interface TransactionResult {
  nodes?: Node[]
  edges?: Edge[]
  [key: string]: unknown
}

interface TransactionOptions {
  skipUndo?: boolean
  skipMarkDirty?: boolean
  skipSyncDoc?: boolean
}

type GetFn = () => GraphState
type SetFn = (partial: Partial<GraphState>) => void

export function runGraphTransaction(
  get: GetFn,
  set: SetFn,
  mutate: (state: GraphState) => TransactionResult,
  options?: TransactionOptions,
): void {
  if (!options?.skipUndo) {
    get()._pushUndoSnapshot()
  }

  const state = get()
  const patch = mutate(state)

  const nodes = (patch.nodes ?? state.nodes) as Node[]
  const edges = (patch.edges ?? state.edges) as Edge[]

  if (!options?.skipSyncDoc && state.document != null && state.layout != null) {
    const { document, layout } = syncDocAndLayout(
      nodes,
      edges,
      state.layout as Record<string, unknown>,
    )
    set({ ...patch, nodes, edges, document, layout })
  } else {
    set({ ...patch, nodes, edges })
  }

  if (!options?.skipMarkDirty) {
    get().markDirty()
  }
}
