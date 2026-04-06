/**
 * Slice UI du store graphe : état d'interface, cycles, métadonnées, dirty flag.
 */
import type { StateCreator } from 'zustand'
import type {
  GraphState,
  GraphMetadata,
  GraphLayoutSpacingMode,
} from '../types/graphState'
import { initialState } from '../types/graphState'
import * as graphAPI from '../../api/graph'
import {
  setPending as journalSetPending,
} from '../../utils/graphJournal'
import { useGraphViewStore } from '../graphViewStore'
import { nodeTargetDisplayLabel } from '../../utils/nodeTargetLabel'

/** Types lore renvoyés par validate-lore-explicit (erreurs + avertissements AC #4). */
const LORE_VALIDATION_TYPES = new Set<string>([
  'lore_contradiction_explicit',
  'lore_contradiction_potential',
  'lore_potential_ambiguity',
])

export type UISlice = Pick<
  GraphState,
  | 'validateGraph'
  | 'validateLoreExplicit'
  | 'setSelectedNode'
  | 'setSelectedNodes'
  | 'clearSelection'
  | 'jumpToNode'
  | 'findNodesByQuery'
  | 'setFilters'
  | 'resetFilters'
  | 'setLayoutSpacingMode'
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

      const loreKept = get().validationErrors.filter((e) => LORE_VALIDATION_TYPES.has(e.type))
      const newValidationErrors = [...response.errors, ...response.warnings, ...loreKept]
      const prevErrors = get().validationErrors
      const prevCycleNodes = get().highlightedCycleNodes
      const newCycleNodes = Array.from(cycleNodeIds)
      const errorsUnchanged =
        prevErrors.length === newValidationErrors.length &&
        newValidationErrors.every((e, i) => prevErrors[i]?.node_id === e.node_id && prevErrors[i]?.type === e.type && prevErrors[i]?.severity === e.severity)
      const cyclesUnchanged =
        prevCycleNodes.length === newCycleNodes.length &&
        newCycleNodes.every((id) => prevCycleNodes.includes(id))
      if (!errorsUnchanged || !cyclesUnchanged) {
        set({ validationErrors: newValidationErrors, highlightedCycleNodes: newCycleNodes })
      }
    } catch (error) {
      console.error('Erreur lors de la validation:', error)
      throw error
    }
  },

  validateLoreExplicit: async (contextSelections) => {
    const selections =
      contextSelections && typeof contextSelections === 'object' ? contextSelections : {}
    set({ loreExplicitValidationLoading: true, loreExplicitValidationSummary: null })
    try {
      const state = get()
      const response = await graphAPI.validateLoreExplicit({
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
        context_selections: selections,
        scene_instruction: '',
        gdd_lore_facts: [],
      })
      const structuralAndOther = get().validationErrors.filter(
        (e) => !LORE_VALIDATION_TYPES.has(e.type)
      )
      const loreIssues = [...response.errors, ...(response.warnings ?? [])].map((e) => ({
        ...e,
        node_id: e.node_id,
      }))
      set({
        validationErrors: [...structuralAndOther, ...loreIssues],
        loreExplicitValidationSummary: response.summary_explicit_only,
        loreExplicitValidationLoading: false,
      })
    } catch (error) {
      console.error('Erreur lors de la validation lore explicite:', error)
      set({
        loreExplicitValidationLoading: false,
        loreExplicitValidationSummary: null,
      })
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

  /** Story 2.8 FR29: centre sur le nœud et sélectionne. Appelle graphViewStore.focusNode() pour fitView. No-op si nodeId absent. */
  jumpToNode: (nodeId) => {
    const state = get()
    const exists = state.nodes.some((n) => n.id === nodeId)
    if (!exists) return
    set({ selectedNodeId: nodeId, selectedNodeIds: [nodeId] })
    useGraphViewStore.getState().focusNode(nodeId)
  },

  /** Story 2.9 FR30: appliquer filtres (types, speakers). */
  setFilters: (filters) => {
    set({ graphFilters: filters })
  },

  /** Story 2.9 FR30: réinitialiser les filtres. */
  resetFilters: () => {
    set({ graphFilters: {} })
  },

  setLayoutSpacingMode: (mode: GraphLayoutSpacingMode) => {
    if (get().layoutSpacingMode === mode) return
    set({ layoutSpacingMode: mode })
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
      const label = nodeTargetDisplayLabel(node)
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
    const current = get().highlightedNodeIds
    if (current.length === nodeIds.length && nodeIds.every((id, i) => current[i] === id)) return
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
    const currentSeq = get().activeLoadSeq
    const currentLayoutSpacingMode = get().layoutSpacingMode
    set({
      ...initialState,
      activeLoadSeq: currentSeq,
      layoutSpacingMode: currentLayoutSpacingMode,
    })
  },

  setShowDeleteNodeConfirm: (show) => {
    set({ showDeleteNodeConfirm: show })
  },
})
