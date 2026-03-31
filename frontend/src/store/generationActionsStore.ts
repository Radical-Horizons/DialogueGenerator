/**
 * Store Zustand pour exposer les actions du GenerationPanel vers Dashboard.
 */
import { create } from 'zustand'
import type { SaveStatus } from '../components/shared/SaveStatusIndicator'

export interface GenerationPanelActions {
  handleGenerate: (() => void) | null
  handlePreview: (() => void) | null
  handleExportUnity: (() => void) | null
  handleReset: (() => void) | null
  isLoading: boolean
  isDirty: boolean
  /** Brouillon génération (localStorage) — pour libellé discret dans le panneau droit. */
  saveStatus: SaveStatus
  draftLastSavedAt: number | null
}

interface GenerationActionsState {
  actions: GenerationPanelActions
  setActions: (actions: GenerationPanelActions) => void
}

export const useGenerationActionsStore = create<GenerationActionsState>((set) => ({
  actions: {
    handleGenerate: null,
    handlePreview: null,
    handleExportUnity: null,
    handleReset: null,
    isLoading: false,
    isDirty: false,
    saveStatus: 'saved',
    draftLastSavedAt: null,
  },
  setActions: (actions) => set({ actions }),
}))



