/**
 * Store app-level pour le polling des jobs de validation batch FR87.
 * Toast de fin même si l'utilisateur quitte la page bibliothèque.
 */
import { create } from 'zustand'
import {
  cancelBatchValidateJob,
  getBatchValidateJob,
  type BatchValidateJobStatus,
  type BatchValidateReport,
} from '../api/batchValidation'
import { toastManager } from '../components/shared/Toast'

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export interface BatchValidationJobState {
  jobId: string | null
  status: BatchValidateJobStatus['status'] | null
  current: number
  total: number
  report: BatchValidateReport | null
  error: string | null
  isPolling: boolean
  startPolling: (jobId: string) => void
  cancelActiveJob: () => void
  dismissReport: () => void
}

let pollGeneration = 0

export const useBatchValidationJobStore = create<BatchValidationJobState>(
  (set, get) => ({
    jobId: null,
    status: null,
    current: 0,
    total: 0,
    report: null,
    error: null,
    isPolling: false,

    dismissReport: () => set({ report: null }),

    cancelActiveJob: () => {
      const jobId = get().jobId
      if (jobId) {
        void cancelBatchValidateJob(jobId).catch(() => undefined)
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
        report: null,
        error: null,
        isPolling: true,
      })

      void (async () => {
        try {
          while (generation === pollGeneration) {
            const status = await getBatchValidateJob(jobId)
            if (generation !== pollGeneration) return
            set({
              status: status.status,
              current: status.current,
              total: status.total,
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
              })
              if (status.status === 'error') {
                toastManager.show(
                  status.error || 'Erreur validation batch',
                  'error',
                  8000
                )
              } else if (status.status === 'cancelled') {
                toastManager.show('Validation batch annulée', 'warning', 5000)
              } else if (report) {
                toastManager.show(
                  `Validation : ${report.valid_count} OK, ${report.invalid_count} erreur(s)`,
                  report.invalid_count > 0 ? 'warning' : 'success',
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
            err instanceof Error ? err.message : 'Erreur polling validation batch'
          set({ isPolling: false, status: 'error', error: message })
          toastManager.show(message, 'error', 8000)
        }
      })()
    },
  })
)
