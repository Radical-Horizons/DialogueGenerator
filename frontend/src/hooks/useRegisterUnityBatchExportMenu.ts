/**
 * Enregistre les actions export batch pour le menu Actions de la toolbar graphe.
 */
import { useEffect } from 'react'
import { formatBatchExportProgress } from '../utils/batchExportOptions'
import type { BatchExportProgress } from './useBatchUnityExport'
import {
  useUnityBatchExportMenuStore,
  type UnityBatchExportMenuActions,
} from '../store/unityBatchExportMenuStore'

export interface RegisterUnityBatchExportMenuParams {
  filteredCount: number
  checkedCount: number
  isBatchExporting: boolean
  batchProgress: BatchExportProgress | null
  showBatchOptionsPanel: boolean
  showDownloadOptionsPanel: boolean
  actions: UnityBatchExportMenuActions
}

export function useRegisterUnityBatchExportMenu({
  filteredCount,
  checkedCount,
  isBatchExporting,
  batchProgress,
  showBatchOptionsPanel,
  showDownloadOptionsPanel,
  actions,
}: RegisterUnityBatchExportMenuParams): void {
  const registerMenu = useUnityBatchExportMenuStore((s) => s.registerMenu)
  const unregisterMenu = useUnityBatchExportMenuStore((s) => s.unregisterMenu)

  useEffect(() => {
    const allSelected = filteredCount > 0 && checkedCount === filteredCount
    const batchProgressLabel =
      isBatchExporting && batchProgress
        ? formatBatchExportProgress(batchProgress.current, batchProgress.total)
        : null

    registerMenu({
      filteredCount,
      checkedCount,
      isBatchExporting,
      batchProgressLabel,
      allSelected,
      showBatchOptionsPanel,
      showDownloadOptionsPanel,
      actions,
    })

    return () => {
      unregisterMenu()
    }
  }, [
    actions,
    batchProgress,
    checkedCount,
    filteredCount,
    isBatchExporting,
    registerMenu,
    showBatchOptionsPanel,
    showDownloadOptionsPanel,
    unregisterMenu,
  ])
}
