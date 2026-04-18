/**
 * Store Zustand de contrôle de vue du graphe.
 * Remplace le bus d'événements globaux `window.dispatchEvent(CustomEvent)`
 * par une API typée et explicite pour les commandes inter-composants :
 *   - focus/centrage sur un nœud
 *   - fitView après redimensionnement
 *   - édition de label d'edge
 *   - menu contextuel nœud
 *   - prompt viewer
 *   - panneau de génération IA
 *   - instance React Flow
 *   - protocole flush editor ↔ dialogue loader
 *   - notification suppression dialogue
 */
import { create } from 'zustand'
import type { ReactFlowInstance } from 'reactflow'

import type { ChoiceEffect } from '../types/choiceEffects'
import type { VisibilityEvalState } from '../types/visibilityConditions'
import { applyChoiceEffectsToEvalState } from '../utils/choiceEffects'

export interface GraphViewState {
  // --- Instance React Flow ---
  reactFlowInstance: ReactFlowInstance | null

  // --- Focus / FitView (FIFO : plusieurs focusNode successifs ne s'écrasent pas) ---
  focusQueue: string[]
  pendingFitView: boolean
  /** Demande ponctuelle de fitView sur un ensemble de nœuds (ex. cycle FR41). */
  pendingFitViewNodeIds: string[] | null

  // --- Edge label edit ---
  edgeLabelEditRequest: { edgeId: string } | null

  // --- Context menu (nœud) ---
  contextMenuRequest: { nodeId: string; x: number; y: number } | null

  // --- Prompt viewer ---
  promptViewerNodeId: string | null

  // --- AI generation panel ---
  aiGenerationNodeId: string | null

  // --- Flush editor protocol ---
  flushRequested: boolean
  flushCompleted: boolean
  saveRequested: boolean

  // --- Dialogue deleted notification ---
  dialogueDeleted: string | null

  /** Story 9.2 — valeurs simulées pour prévisualiser visibilité (flags / réputation). */
  visibilityEvalState: VisibilityEvalState

  // --- Actions : instance ---
  registerReactFlowInstance: (instance: ReactFlowInstance) => void

  // --- Actions : focus / fitView ---
  focusNode: (nodeId: string) => void
  /** Retire le premier id de la file (consommé par GraphCanvas après traitement). */
  dequeueFocus: () => void
  clearFocus: () => void
  requestFitView: () => void
  clearFitView: () => void
  /** Centre la vue sur les nœuds donnés (ids graphe), consommé par GraphCanvasInner. */
  requestFitViewOnNodeIds: (nodeIds: string[]) => void
  clearFitViewNodeIdsRequest: () => void

  // --- Actions : edge label edit ---
  requestEdgeLabelEdit: (edgeId: string) => void
  clearEdgeLabelEdit: () => void

  // --- Actions : context menu ---
  openContextMenu: (nodeId: string, x: number, y: number) => void
  closeContextMenu: () => void

  // --- Actions : prompt viewer ---
  openPromptViewer: (nodeId: string) => void
  closePromptViewer: () => void

  // --- Actions : AI generation ---
  openAIGeneration: (nodeId: string) => void
  closeAIGeneration: () => void

  // --- Actions : flush editor protocol ---
  requestFlush: () => void
  confirmFlush: () => void
  requestSave: () => void
  clearSaveRequest: () => void
  resetFlush: () => void

  // --- Actions : dialogue deleted ---
  notifyDialogueDeleted: (filename: string) => void
  clearDialogueDeleted: () => void

  setVisibilityEvalFlag: (flagId: string, value: boolean | number | string) => void
  setVisibilityEvalReputation: (axisId: string, factionId: string, value: number) => void
  clearVisibilityEvalState: () => void
  /** Story 9.3 : applique les effets d'un choix sur l'état de simulation (ordre respecté). */
  applyChoiceEffectsSimulation: (effects: ChoiceEffect[]) => void
}

export const useGraphViewStore = create<GraphViewState>()((set) => ({
  reactFlowInstance: null,
  focusQueue: [],
  pendingFitView: false,
  pendingFitViewNodeIds: null,
  edgeLabelEditRequest: null,
  contextMenuRequest: null,
  promptViewerNodeId: null,
  aiGenerationNodeId: null,
  flushRequested: false,
  flushCompleted: false,
  saveRequested: false,
  dialogueDeleted: null,
  visibilityEvalState: { flags: {}, reputation: {} },

  registerReactFlowInstance: (instance) => set({ reactFlowInstance: instance }),

  focusNode: (nodeId) =>
    set((s) => ({
      focusQueue: [...s.focusQueue, nodeId],
    })),
  dequeueFocus: () =>
    set((s) => ({
      focusQueue: s.focusQueue.length > 0 ? s.focusQueue.slice(1) : [],
    })),
  clearFocus: () => set({ focusQueue: [] }),

  requestFitView: () => set({ pendingFitView: true }),
  clearFitView: () => set({ pendingFitView: false }),

  requestFitViewOnNodeIds: (nodeIds) => {
    const unique = [...new Set(nodeIds.filter((id) => id && id.trim() !== ''))]
    if (unique.length === 0) return
    set({ pendingFitViewNodeIds: unique })
  },
  clearFitViewNodeIdsRequest: () => set({ pendingFitViewNodeIds: null }),

  requestEdgeLabelEdit: (edgeId) => set({ edgeLabelEditRequest: { edgeId } }),
  clearEdgeLabelEdit: () => set({ edgeLabelEditRequest: null }),

  openContextMenu: (nodeId, x, y) => set({ contextMenuRequest: { nodeId, x, y } }),
  closeContextMenu: () => set({ contextMenuRequest: null }),

  openPromptViewer: (nodeId) => set({ promptViewerNodeId: nodeId }),
  closePromptViewer: () => set({ promptViewerNodeId: null }),

  openAIGeneration: (nodeId) => set({ aiGenerationNodeId: nodeId }),
  closeAIGeneration: () => set({ aiGenerationNodeId: null }),

  requestFlush: () => set({ flushRequested: true, flushCompleted: false }),
  confirmFlush: () => set({ flushRequested: false, flushCompleted: true }),
  requestSave: () => set({ saveRequested: true }),
  clearSaveRequest: () => set({ saveRequested: false }),
  resetFlush: () => set({ flushRequested: false, flushCompleted: false, saveRequested: false }),

  notifyDialogueDeleted: (filename) => set({ dialogueDeleted: filename }),
  clearDialogueDeleted: () => set({ dialogueDeleted: null }),

  setVisibilityEvalFlag: (flagId, value) =>
    set((s) => ({
      visibilityEvalState: {
        ...s.visibilityEvalState,
        flags: { ...s.visibilityEvalState.flags, [flagId]: value },
      },
    })),
  setVisibilityEvalReputation: (axisId, factionId, value) =>
    set((s) => {
      const key = `${axisId}::${factionId}`
      return {
        visibilityEvalState: {
          ...s.visibilityEvalState,
          reputation: { ...s.visibilityEvalState.reputation, [key]: value },
        },
      }
    }),
  clearVisibilityEvalState: () =>
    set({ visibilityEvalState: { flags: {}, reputation: {} } }),

  applyChoiceEffectsSimulation: (effects) =>
    set((s) => ({
      visibilityEvalState: applyChoiceEffectsToEvalState(
        s.visibilityEvalState,
        effects
      ),
    })),
}))

/** Exposé uniquement en dev pour E2E Playwright (`requestSave` aligné sur la toolbar / Ctrl+S). */
declare global {
  interface Window {
    __graphViewStoreE2E?: typeof useGraphViewStore
  }
}

if (import.meta.env.DEV && typeof window !== 'undefined') {
  window.__graphViewStoreE2E = useGraphViewStore
}
