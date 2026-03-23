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

export interface GraphViewState {
  // --- Instance React Flow ---
  reactFlowInstance: ReactFlowInstance | null

  // --- Focus / FitView ---
  pendingFocusNodeId: string | null
  pendingFitView: boolean

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

  // --- Actions : instance ---
  registerReactFlowInstance: (instance: ReactFlowInstance) => void

  // --- Actions : focus / fitView ---
  focusNode: (nodeId: string) => void
  clearFocus: () => void
  requestFitView: () => void
  clearFitView: () => void

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
}

export const useGraphViewStore = create<GraphViewState>()((set) => ({
  reactFlowInstance: null,
  pendingFocusNodeId: null,
  pendingFitView: false,
  edgeLabelEditRequest: null,
  contextMenuRequest: null,
  promptViewerNodeId: null,
  aiGenerationNodeId: null,
  flushRequested: false,
  flushCompleted: false,
  saveRequested: false,
  dialogueDeleted: null,

  registerReactFlowInstance: (instance) => set({ reactFlowInstance: instance }),

  focusNode: (nodeId) => set({ pendingFocusNodeId: nodeId }),
  clearFocus: () => set({ pendingFocusNodeId: null }),

  requestFitView: () => set({ pendingFitView: true }),
  clearFitView: () => set({ pendingFitView: false }),

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
}))
