/**
 * Store Zustand pour la gestion de l'état du graphe de dialogues.
 * Orchestre les slices : node, edge, persistence, generation, layout, ui.
 *
 * API publique inchangée — tous les consumers (`useGraphStore`) fonctionnent sans modification.
 */
import { create } from 'zustand'

// Re-exports pour la compatibilité descendante avec les imports existants
export type { GraphState, GraphMetadata } from './types/graphState'
export { initialState } from './types/graphState'

import type { GraphState } from './types/graphState'
import { initialState } from './types/graphState'

import { createNodeSlice } from './slices/nodeSlice'
import { createEdgeSlice } from './slices/edgeSlice'
import { createUndoSlice } from './slices/undoSlice'
import { createPersistenceSlice } from './slices/persistenceSlice'
import { createGenerationSlice } from './slices/generationSlice'
import { createLayoutSlice } from './slices/layoutSlice'
import { createUISlice } from './slices/uiSlice'

export const useGraphStore = create<GraphState>()((...args) => ({
  ...initialState,
  ...createNodeSlice(...args),
  ...createEdgeSlice(...args),
  ...createUndoSlice(...args),
  ...createPersistenceSlice(...args),
  ...createGenerationSlice(...args),
  ...createLayoutSlice(...args),
  ...createUISlice(...args),
}))

/** Exposé en dev pour E2E Playwright (diagnostic persistance / documentId). */
declare global {
  interface Window {
    __graphStoreE2E?: typeof useGraphStore
  }
}

if (import.meta.env.DEV && typeof window !== 'undefined') {
  window.__graphStoreE2E = useGraphStore
}
