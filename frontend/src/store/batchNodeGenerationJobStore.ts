/**
 * Store app-level pour le polling des jobs de génération batch FR88.
 * Permet le toast de fin même si l'utilisateur quitte la page graphe.
 */
import { create } from 'zustand'
import {
  cancelBatchGenerateFromNodesJob,
  getBatchGenerateFromNodesJob,
  type BatchGenerateJobStatus,
  type BatchGenerateReport,
} from '../api/batchNodeGeneration'
import { toastManager } from '../components/shared/Toast'

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export interface BatchNodeGenerationJobState {
  jobId: string | null
  status: BatchGenerateJobStatus['status'] | null
  current: number
  total: number
  detail: string
  report: BatchGenerateReport | null
  error: string | null
  /** True tant que le polling tourne (hors graphe inclus). */
  isPolling: boolean
  /** Rapport prêt à appliquer sur le graphe (consommable une fois). */
  pendingApplyReport: BatchGenerateReport | null
  startPolling: (jobId: string) => void
  cancelActiveJob: () => void
  clearPendingApply: () => void
  dismissReport: () => void
}

let pollGeneration = 0

export const useBatchNodeGenerationJobStore = create<BatchNodeGenerationJobState>(
  (set, get) => ({
    jobId: null,
    status: null,
    current: 0,
    total: 0,
    detail: '',
    report: null,
    error: null,
    isPolling: false,
    pendingApplyReport: null,

    clearPendingApply: () => set({ pendingApplyReport: null }),

    dismissReport: () => set({ report: null }),

    cancelActiveJob: () => {
      const jobId = get().jobId
      if (jobId) {
        void cancelBatchGenerateFromNodesJob(jobId).catch(() => undefined)
      }
      pollGeneration += 1
      set({ isPolling: false })
    },

    startPolling: (jobId: string) => {
      pollGeneration += 1
      const generation = pollGeneration
      set({
        jobId,
        status: 'queued',
        current: 0,
        total: 0,
        detail: '',
        report: null,
        error: null,
        isPolling: true,
        pendingApplyReport: null,
      })

      void (async () => {
        try {
          while (generation === pollGeneration) {
            const status = await getBatchGenerateFromNodesJob(jobId)
            if (generation !== pollGeneration) return
            set({
              status: status.status,
              current: status.current,
              total: status.total,
              detail: status.detail || '',
              error: status.error ?? null,
            })
            if (
              status.status === 'completed' ||
              status.status === 'cancelled' ||
              status.status === 'error'
            ) {
              const report = status.report ?? null
              set({
                report,
                isPolling: false,
                pendingApplyReport:
                  status.status === 'completed' || status.status === 'cancelled'
                    ? report
                    : null,
              })
              if (status.status === 'error') {
                toastManager.show(
                  status.error || 'Erreur génération batch',
                  'error',
                  8000
                )
              } else if (status.status === 'cancelled') {
                toastManager.show(
                  report
                    ? `${report.total_nodes_generated} nœud(s) générés (annulé)`
                    : 'Génération batch annulée',
                  'warning',
                  5000
                )
              } else if (report) {
                toastManager.show(
                  `${report.total_nodes_generated} nœuds générés depuis ${report.ok_count} nœuds de départ`,
                  report.error_count > 0 ? 'warning' : 'success',
                  5000
                )
              }
              return
            }
            await sleep(800)
          }
        } catch (err) {
          if (generation !== pollGeneration) return
          const message =
            err instanceof Error ? err.message : 'Erreur polling génération batch'
          set({ isPolling: false, status: 'error', error: message })
          toastManager.show(message, 'error', 8000)
        }
      })()
    },
  })
)
