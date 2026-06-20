/**
 * Pont menu Actions (toolbar graphe) ↔ export batch Unity (liste latérale).
 */
import { create } from 'zustand'

export interface UnityBatchExportMenuActions {
  onToggleSelectAll: () => void
  onStartExport: () => void
  onStartPreview: () => void
  onCancelExport: () => void
  onToggleBatchOptions: () => void
  onOpenExportLogs: () => void
  onToggleDownloadOptions: () => void
}

export interface UnityBatchExportMenuSnapshot {
  filteredCount: number
  checkedCount: number
  isBatchExporting: boolean
  batchProgressLabel: string | null
  allSelected: boolean
  showBatchOptionsPanel: boolean
  showDownloadOptionsPanel: boolean
  actions: UnityBatchExportMenuActions
}

interface UnityBatchExportMenuStore {
  menu: UnityBatchExportMenuSnapshot | null
  registerMenu: (menu: UnityBatchExportMenuSnapshot) => void
  unregisterMenu: () => void
}

export const useUnityBatchExportMenuStore = create<UnityBatchExportMenuStore>((set) => ({
  menu: null,
  registerMenu: (menu) => set({ menu }),
  unregisterMenu: () => set({ menu: null }),
}))
