/**
 * Slice UI du store graphe : état d'interface, cycles, métadonnées, dirty flag.
 */
import type { StateCreator } from 'zustand'
import type { GraphState, GraphMetadata } from '../types/graphState'
import { initialState } from '../types/graphState'
import * as graphAPI from '../../api/graph'
import {
  setPending as journalSetPending,
} from '../../utils/graphJournal'

export type UISlice = Pick<
  GraphState,
  | 'validateGraph'
  | 'setSelectedNode'
  | 'setHighlightedNodes'
  | 'markCycleAsIntentional'
  | 'unmarkCycleAsIntentional'
  | 'markDirty'
  | 'updateMetadata'
  | 'resetGraph'
  | 'setShowDeleteNodeConfirm'
>

export const createUISlice: StateCreator<GraphState, [], [], UISlice> = (set, get) => ({
  validateGraph: async () => {
    try {
      const state = get()
      const response = await graphAPI.validateGraph({
        nodes: state.nodes.map((n) => ({
          id: n.id,
          type: n.type,
          position: n.position,
          data: n.data,
        })),
        edges: state.edges.map((e) => ({
          id: e.id,
          source: e.source,
          target: e.target,
          type: e.type,
          label: e.label,
          data: e.data,
        })),
      })

      const cycleWarnings = response.warnings.filter(
        (w) => w.type === 'cycle_detected' && w.cycle_nodes && Array.isArray(w.cycle_nodes)
      )
      const cycleNodeIds = new Set<string>()
      cycleWarnings.forEach((warn) => {
        if (warn.cycle_nodes && Array.isArray(warn.cycle_nodes)) {
          warn.cycle_nodes.forEach((nodeId) => cycleNodeIds.add(nodeId))
        }
      })

      const newValidationErrors = [...response.errors, ...response.warnings]
      set({
        validationErrors: newValidationErrors,
        highlightedCycleNodes: Array.from(cycleNodeIds),
      })
    } catch (error) {
      console.error('Erreur lors de la validation:', error)
      throw error
    }
  },

  setSelectedNode: (nodeId) => {
    set({ selectedNodeId: nodeId })
  },

  setHighlightedNodes: (nodeIds) => {
    set({ highlightedNodeIds: nodeIds })
  },

  markCycleAsIntentional: (cycleId) => {
    set((state) => {
      const newIntentionalCycles = state.intentionalCycles.includes(cycleId)
        ? state.intentionalCycles
        : [...state.intentionalCycles, cycleId]

      try {
        localStorage.setItem('graph_intentional_cycles', JSON.stringify(newIntentionalCycles))
      } catch (error) {
        console.error('Erreur lors de la sauvegarde des cycles intentionnels:', error)
        if (error instanceof DOMException && error.name === 'QuotaExceededError') {
          alert(
            "Impossible de sauvegarder le marquage intentionnel: l'espace de stockage est plein."
          )
        }
      }

      return { intentionalCycles: newIntentionalCycles }
    })
  },

  unmarkCycleAsIntentional: (cycleId) => {
    set((state) => {
      const newIntentionalCycles = state.intentionalCycles.filter((id) => id !== cycleId)

      try {
        localStorage.setItem('graph_intentional_cycles', JSON.stringify(newIntentionalCycles))
      } catch (error) {
        console.error('Erreur lors de la sauvegarde des cycles intentionnels:', error)
        if (error instanceof DOMException && error.name === 'QuotaExceededError') {
          alert(
            "Impossible de sauvegarder le marquage intentionnel: l'espace de stockage est plein."
          )
        }
      }

      return { intentionalCycles: newIntentionalCycles }
    })
  },

  markDirty: () => {
    set({ hasUnsavedChanges: true })
    const state = get()
    const docId = state.documentId ?? state.dialogueMetadata.filename ?? null
    if (docId) {
      journalSetPending(docId, {
        nodes: state.nodes,
        edges: state.edges,
        metadata: state.dialogueMetadata,
        seq: state.clientSeq,
      }).catch((e) => console.warn('Journal setPending:', e))
    }
  },

  updateMetadata: (updates: Partial<GraphMetadata>) => {
    set((state) => ({
      dialogueMetadata: {
        ...state.dialogueMetadata,
        ...updates,
      },
    }))
    get().markDirty()
  },

  resetGraph: () => {
    set(initialState)
  },

  setShowDeleteNodeConfirm: (show) => {
    set({ showDeleteNodeConfirm: show })
  },
})
