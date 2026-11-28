/**
 * Fiche de scène du dialogue ouvert. Tenue hors de `document` : les exports qui en
 * partent sont propres par construction, et un PUT ne la porte que si elle a changé.
 */
import type { StateCreator } from 'zustand'
import type { GraphState } from '../types/graphState'
import { useAuthStore } from '../authStore'
import { useSceneCatalogStore } from '../sceneCatalogStore'
import { deduceSceneSheet, type SceneSheet } from '../../utils/sceneSheet'

export type SceneSlice = Pick<
  GraphState,
  'updateScene' | 'ensureSceneStored' | 'rewriteSpeakers'
>

/** Fiche enregistrée, ou déduite du dialogue tant qu'il n'en a pas. */
export function effectiveSceneSheet(state: Pick<GraphState, 'scene' | 'nodes'>): SceneSheet {
  return state.scene ?? deduceSceneSheet(state.nodes, useSceneCatalogStore.getState().characters)
}

function isReadOnly(state: GraphState): boolean {
  return state.canEditDocument === false || useAuthStore.getState().user?.role === 'guest'
}

export const createSceneSlice: StateCreator<GraphState, [], [], SceneSlice> = (set, get) => ({
  updateScene: (change) => {
    const state = get()
    if (isReadOnly(state)) return
    set({ scene: change(effectiveSceneSheet(state)), sceneDirty: true })
    get().markDirty()
  },

  ensureSceneStored: () => {
    const state = get()
    if (state.scene) return
    // Sans PNJ ni PJ, la déduction n'apprend rien : enregistrée, elle ne serait plus refaite.
    const deduced = effectiveSceneSheet(state)
    if (deduced.npcs.length === 0 && !deduced.pc) return
    get().updateScene((sheet) => sheet)
  },

  rewriteSpeakers: (nodeIds, speaker) => {
    if (isReadOnly(get()) || nodeIds.length === 0) return
    // Accepter la proposition est un geste sur la fiche : elle s'enregistre avec.
    get().ensureSceneStored()
    get().runAsSingleUndoStep(() => {
      for (const nodeId of nodeIds) {
        const node = get().nodes.find((n) => n.id === nodeId)
        if (node) get().updateNode(nodeId, { data: { ...node.data, speaker } }, true)
      }
    })
    get().markDirty()
  },
})
