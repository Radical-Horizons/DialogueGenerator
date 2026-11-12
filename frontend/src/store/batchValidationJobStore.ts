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
import {
  MAX_TRANSIENT_POLL_FAILURES,
  TRANSIENT_POLL_DELAY_MS,
  isTransientPollError,
  pollErrorMessage,
} from './batchJobPolling'

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
        let failures = 0
        while (generation === pollGeneration) {
          let status: BatchValidateJobStatus
          try {
            status = await getBatchValidateJob(jobId)
            failures = 0
          } catch (err) {
            if (generation !== pollGeneration) return
            if (isTransientPollError(err) && failures < MAX_TRANSIENT_POLL_FAILURES) {
              failures += 1
              await sleep(TRANSIENT_POLL_DELAY_MS)
              continue
            }
            const message = pollErrorMessage(err, 'Erreur polling validation batch')
            set({ isPolling: false, status: 'error', error: message })
            toastManager.show(message, 'error', 8000)
            return
          }
          if (generation !== pollGeneration) return
          set({
            status: status.status,
            current: status.current,
            total: status.total,
            error: status.error ?? null,
          })
          if (status.status === 'interrupted') {
            set({ report: status.report ?? null, isPolling: false })
            toastManager.show(
              'Validation interrompue par un redémarrage du serveur. Relancez-la : les dialogues déjà validés sont conservés.',
              'warning',
              8000
            )
            return
          }
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
      })()
    },
  })
)
