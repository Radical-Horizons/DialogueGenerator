/**
 * Slice undo/redo du store graphe (Story 2.14 FR35).
 * undoStack / redoStack (snapshots nodes+edges), limite 50.
 */
import type { StateCreator } from 'zustand'
import type { Node, Edge } from 'reactflow'
import type { GraphState, GraphSnapshot } from '../types/graphState'
import { buildLayoutFromNodes } from '../../utils/documentToGraph'

const MAX_UNDO_SNAPSHOTS = 50

/** Actions uniquement — `undoStack` / `redoStack` viennent de `initialState`. */
export type UndoSlice = Pick<
  GraphState,
  'undo' | 'redo' | 'canUndo' | 'canRedo' | '_pushUndoSnapshot' | 'clearUndoHistory'
>

function cloneSnapshot(nodes: Node[], edges: Edge[]): GraphSnapshot {
  return {
    nodes: nodes.map((n) => ({ ...n, data: JSON.parse(JSON.stringify(n.data)) })),
    edges: edges.map((e) => ({ ...e })),
  }
}

export const createUndoSlice: StateCreator<GraphState, [], [], UndoSlice> = (set, get) => ({
  undo: () => {
    const state = get()
    if (state.undoStack.length === 0) return
    const snapshot = state.undoStack[state.undoStack.length - 1]
    const redoSnapshot = cloneSnapshot(state.nodes, state.edges)
    const restoredNodes = snapshot.nodes.map((n) => ({
      ...n,
      data: JSON.parse(JSON.stringify(n.data)),
    }))
    const restoredEdges = [...snapshot.edges]
    const updates: Record<string, unknown> = {
      nodes: restoredNodes,
      edges: restoredEdges,
      undoStack: state.undoStack.slice(0, -1),
      redoStack: [...state.redoStack, redoSnapshot],
    }
    if (state.document != null && state.layout != null) {
      const restoredLayout = buildLayoutFromNodes(snapshot.nodes)
      updates.layout = { ...state.layout, nodes: restoredLayout.nodes }
    }
    set(updates)
    get().markDirty()
  },

  redo: () => {
    const state = get()
    if (state.redoStack.length === 0) return
    const snapshot = state.redoStack[state.redoStack.length - 1]
    const undoSnapshot = cloneSnapshot(state.nodes, state.edges)
    const restoredNodes = snapshot.nodes.map((n) => ({
      ...n,
      data: JSON.parse(JSON.stringify(n.data)),
    }))
    const redoUpdates: Record<string, unknown> = {
      nodes: restoredNodes,
      edges: [...snapshot.edges],
      undoStack: [...state.undoStack, undoSnapshot],
      redoStack: state.redoStack.slice(0, -1),
    }
    if (state.document != null && state.layout != null) {
      const restoredLayout = buildLayoutFromNodes(snapshot.nodes)
      redoUpdates.layout = { ...state.layout, nodes: restoredLayout.nodes }
    }
    set(redoUpdates)
    get().markDirty()
  },

  canUndo: () => get().undoStack.length > 0,
  canRedo: () => get().redoStack.length > 0,

  _pushUndoSnapshot: () => {
    const state = get()
    const snapshot = cloneSnapshot(state.nodes, state.edges)
    let nextUndo = [...state.undoStack, snapshot]
    if (nextUndo.length > MAX_UNDO_SNAPSHOTS) nextUndo = nextUndo.slice(-MAX_UNDO_SNAPSHOTS)
    set({ undoStack: nextUndo, redoStack: [] })
  },

  clearUndoHistory: () => set({ undoStack: [], redoStack: [] }),
})
