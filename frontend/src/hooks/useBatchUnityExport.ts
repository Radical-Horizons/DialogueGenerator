/**
 * Hook export batch Unity depuis la bibliothèque de dialogues (Story 5.2 / FR50).
 *
 * Orchestration séquentielle côté client pour progression et annulation (AbortController).
 */
import { useCallback, useRef, useState } from 'react'
import { batchExportUnityDialogues } from '../api/dialogues'
import type { BatchExportFailedItem } from '../types/api'
import type { UseToastFn } from '../components/shared'
import { getErrorMessage } from '../types/errors'
import {
  UNITY_PATH_UNAVAILABLE_MESSAGE,
  isUnityPathUnavailableError,
} from '../utils/graphApiErrors'
import {
  type BatchExportOptions,
  formatBatchExportProgress,
  formatBatchExportSummary,
  loadBatchExportOptions,
  saveBatchExportOptions,
} from '../utils/batchExportOptions'
import { normalizeDialogueFilenameKey } from '../utils/formatDialogueTitle'

export interface BatchExportProgress {
  current: number
  total: number
}

export interface BatchExportSummaryState {
  exportedCount: number
  failedCount: number
  cancelled: boolean
  failed: BatchExportFailedItem[]
}

export interface UseBatchUnityExportResult {
  checkedDocumentIds: Set<string>
  toggleDocumentCheck: (documentId: string) => void
  selectAllFiltered: (documentIds: string[]) => void
  clearChecks: () => void
  setCheckedDocumentIds: (ids: Set<string>) => void
  isBatchExporting: boolean
  batchProgress: BatchExportProgress | null
  batchSummary: BatchExportSummaryState | null
  dismissSummary: () => void
  batchOptions: BatchExportOptions
  setBatchOptions: (options: BatchExportOptions) => void
  showOptionsPanel: boolean
  setShowOptionsPanel: (open: boolean) => void
  startBatchExport: (documentIds: string[]) => Promise<void>
  cancelBatchExport: () => void
  retryFailedExports: () => Promise<void>
}

function toDocumentId(filename: string): string {
  return normalizeDialogueFilenameKey(filename)
}

/**
 * Hook batch export Unity — sélection, progression, annulation, options persistées.
 */
export function useBatchUnityExport(toast: UseToastFn): UseBatchUnityExportResult {
  const [checkedDocumentIds, setCheckedDocumentIdsState] = useState<Set<string>>(new Set())
  const [isBatchExporting, setIsBatchExporting] = useState(false)
  const [batchProgress, setBatchProgress] = useState<BatchExportProgress | null>(null)
  const [batchSummary, setBatchSummary] = useState<BatchExportSummaryState | null>(null)
  const [batchOptions, setBatchOptionsState] = useState<BatchExportOptions>(() =>
    loadBatchExportOptions(),
  )
  const [showOptionsPanel, setShowOptionsPanel] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const lastFailedRef = useRef<BatchExportFailedItem[]>([])

  const setBatchOptions = useCallback((options: BatchExportOptions) => {
    setBatchOptionsState(options)
    saveBatchExportOptions(options)
  }, [])

  const toggleDocumentCheck = useCallback((documentId: string) => {
    setCheckedDocumentIdsState((prev) => {
      const next = new Set(prev)
      if (next.has(documentId)) {
        next.delete(documentId)
      } else {
        next.add(documentId)
      }
      return next
    })
  }, [])

  const selectAllFiltered = useCallback((documentIds: string[]) => {
    setCheckedDocumentIdsState(new Set(documentIds))
  }, [])

  const clearChecks = useCallback(() => {
    setCheckedDocumentIdsState(new Set())
  }, [])

  const setCheckedDocumentIds = useCallback((ids: Set<string>) => {
    setCheckedDocumentIdsState(new Set(ids))
  }, [])

  const dismissSummary = useCallback(() => {
    setBatchSummary(null)
  }, [])

  const runBatchLoop = useCallback(
    async (documentIds: string[]) => {
      if (documentIds.length === 0) {
        toast('Sélectionnez au moins un dialogue à exporter', 'warning')
        return
      }

      abortRef.current = new AbortController()
      setIsBatchExporting(true)
      setBatchSummary(null)
      setBatchProgress({ current: 0, total: documentIds.length })

      const exported: string[] = []
      const failed: BatchExportFailedItem[] = []
      let cancelled = false

      try {
        for (let index = 0; index < documentIds.length; index += 1) {
          if (abortRef.current.signal.aborted) {
            cancelled = true
            break
          }

          const docId = documentIds[index]
          setBatchProgress({ current: index + 1, total: documentIds.length })

          try {
            const response = await batchExportUnityDialogues(
              {
                document_ids: [docId],
                skip_validation: !batchOptions.validateBeforeExport,
                filename_strategy: batchOptions.filenameStrategy,
              },
              abortRef.current.signal,
            )
            exported.push(...response.exported)
            failed.push(...response.failed)
            if (abortRef.current?.signal.aborted) {
              cancelled = true
              break
            }
          } catch (err) {
            if (abortRef.current?.signal.aborted) {
              cancelled = true
              break
            }
            if (isUnityPathUnavailableError(err)) {
              toast(UNITY_PATH_UNAVAILABLE_MESSAGE, 'error')
              cancelled = true
              break
            }
            failed.push({ id: docId, errors: [getErrorMessage(err)] })
          }
        }
      } finally {
        setIsBatchExporting(false)
        setBatchProgress(null)
        abortRef.current = null
      }

      lastFailedRef.current = failed
      const summary: BatchExportSummaryState = {
        exportedCount: exported.length,
        failedCount: failed.length,
        cancelled,
        failed,
      }
      setBatchSummary(summary)
      toast(formatBatchExportSummary(summary.exportedCount, summary.failedCount, cancelled), cancelled ? 'warning' : 'success', 5000)
    },
    [batchOptions, toast],
  )

  const startBatchExport = useCallback(
    async (documentIds: string[]) => {
      await runBatchLoop(documentIds)
    },
    [runBatchLoop],
  )

  const cancelBatchExport = useCallback(() => {
    abortRef.current?.abort()
  }, [])

  const retryFailedExports = useCallback(async () => {
    const ids = lastFailedRef.current.map((item) => item.id)
    if (ids.length === 0) {
      return
    }
    setCheckedDocumentIdsState(new Set(ids))
    await runBatchLoop(ids)
  }, [runBatchLoop])

  return {
    checkedDocumentIds,
    toggleDocumentCheck,
    selectAllFiltered,
    clearChecks,
    setCheckedDocumentIds,
    isBatchExporting,
    batchProgress,
    batchSummary,
    dismissSummary,
    batchOptions,
    setBatchOptions,
    showOptionsPanel,
    setShowOptionsPanel,
    startBatchExport,
    cancelBatchExport,
    retryFailedExports,
  }
}

export { toDocumentId, formatBatchExportProgress }
