/**
 * Slice UI du store graphe : état d'interface, cycles, métadonnées, dirty flag.
 */
import type { StateCreator } from 'zustand'
import type { GraphState, GraphMetadata, GraphFilters } from '../types/graphState'
import { initialState } from '../types/graphState'
import * as graphAPI from '../../api/graph'
import {
  setPending as journalSetPending,
} from '../../utils/graphJournal'

export type UISlice = Pick<
  GraphState,
  | 'validateGraph'
  | 'setSelectedNode'
  | 'setSelectedNodes'
  | 'clearSelection'
  | 'jumpToNode'
  | 'findNodesByQuery'
  | 'setFilters'
  | 'resetFilters'
  | 'setHighlightedNodes'
  | 'searchNodes'
  | 'getUniqueSpeakers'
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
    const state = get()
    if (nodeId === null) {
      if (state.selectedNodeId === null && state.selectedNodeIds.length === 0) return
      set({ selectedNodeId: null, selectedNodeIds: [] })
    } else {
      if (state.selectedNodeId === nodeId && state.selectedNodeIds.length === 1 && state.selectedNodeIds[0] === nodeId) return
      set({ selectedNodeId: nodeId, selectedNodeIds: [nodeId] })
    }
  },

  /** Story 2.10 FR31: multi-sélection. selectedNodeId = premier de la liste pour NodeEditorPanel. */
  setSelectedNodes: (nodeIds) => {
    const state = get()
    const same = state.selectedNodeIds.length === nodeIds.length && nodeIds.every((id, i) => state.selectedNodeIds[i] === id)
    if (same) return
    const selectedNodeId = nodeIds.length === 0 ? null : nodeIds[0]
    set({ selectedNodeIds: nodeIds, selectedNodeId })
  },

  /** Story 2.10 FR31: vide sélection multiple et selectedNodeId. */
  clearSelection: () => {
    const state = get()
    if (state.selectedNodeIds.length === 0 && state.selectedNodeId === null) return
    set({ selectedNodeIds: [], selectedNodeId: null })
  },

  /** Story 2.8 FR29: centre sur le nœud et sélectionne. Dispatch focus-generated-node pour fitView. No-op si nodeId absent. */
  jumpToNode: (nodeId) => {
    const state = get()
    const exists = state.nodes.some((n) => n.id === nodeId)
    if (!exists) return
    set({ selectedNodeId: nodeId })
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('focus-generated-node', { detail: { nodeId } }))
    }
  },

  /** Story 2.9 FR30: appliquer filtres (types, speakers). */
  setFilters: (filters) => {
    set({ graphFilters: filters })
  },

  /** Story 2.9 FR30: réinitialiser les filtres. */
  resetFilters: () => {
    set({ graphFilters: {} })
  },

  /** Story 2.8 FR29: candidats par ID exact ou nom (displayName ?? première ligne de data.line ?? node.id). Exact d'abord, puis partiels. */
  findNodesByQuery: (query) => {
    const state = get()
    const q = query.trim()
    if (q === '') return []
    const qLower = q.toLowerCase()
    const exact: Array<{ id: string; label: string }> = []
    const partial: Array<{ id: string; label: string }> = []
    for (const node of state.nodes) {
      const data = node.data as { displayName?: string; line?: string }
      const firstLine =
        typeof data.line === 'string' ? (data.line.split('\n')[0]?.trim() ?? '') : ''
      const label = (data.displayName ?? firstLine) || node.id
      const labelLower = label.toLowerCase()
      if (node.id === q) {
        exact.push({ id: node.id, label })
      } else if (labelLower.includes(qLower) || node.id.toLowerCase().includes(qLower)) {
        partial.push({ id: node.id, label })
      }
    }
    return [...exact, ...partial]
  },

  setHighlightedNodes: (nodeIds) => {
    set({ highlightedNodeIds: nodeIds })
  },

  searchNodes: (query, filters) => {
    const state = get()
    const q = query.trim().toLowerCase()
    const speakerFilter = filters?.speaker?.trim().toLowerCase() ?? null
    return state.nodes.filter((node) => {
      const data = node.data as { line?: string; speaker?: string }
      const line = (data.line ?? '').toLowerCase()
      const speaker = (data.speaker ?? '').toLowerCase()
      const textMatch = q === '' || line.includes(q)
      const speakerMatch = speakerFilter === null || speakerFilter === '' || speaker === speakerFilter
      return textMatch && speakerMatch
    }).map((n) => n.id)
  },

  getUniqueSpeakers: () => {
    const state = get()
    const speakerSet = new Set<string>()
    state.nodes.forEach((node) => {
      const speaker = (node.data as { speaker?: string })?.speaker?.trim()
      if (speaker) speakerSet.add(speaker)
    })
    return Array.from(speakerSet).sort()
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
