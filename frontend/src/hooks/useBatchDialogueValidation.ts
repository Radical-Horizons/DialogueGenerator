/**
 * Hook validation batch dialogues (Story 8.8 / FR87).
 * N < 20 : boucle sync séquentielle + AbortController ;
 * N ≥ 20 : job serveur + polling app-level (toast fin hors page).
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  BATCH_VALIDATE_JOB_MIN,
  batchValidateSync,
  startBatchValidateJob,
  type BatchValidateReport,
  type BatchValidationItem,
} from '../api/batchValidation'
import type { UseToastFn } from '../components/shared'
import { useBatchValidationJobStore } from '../store/batchValidationJobStore'
import { getErrorMessage } from '../types/errors'

export interface BatchValidationProgress {
  current: number
  total: number
}

export interface UseBatchDialogueValidationResult {
  isValidating: boolean
  progress: BatchValidationProgress | null
  report: BatchValidateReport | null
  dismissReport: () => void
  startBatchValidation: (documentIds: string[]) => Promise<void>
  cancelBatchValidation: () => void
}

function summarize(items: BatchValidationItem[], cancelled: boolean): BatchValidateReport {
  return {
    items,
    cancelled,
    started_at: items[0]?.validated_at || new Date().toISOString(),
    finished_at: new Date().toISOString(),
    valid_count: items.filter((i) => i.status === 'valid').length,
    invalid_count: items.filter((i) => i.status === 'invalid').length,
    skipped_count: items.filter((i) =>
      ['skipped', 'cancelled', 'denied'].includes(i.status)
    ).length,
  }
}

export function useBatchDialogueValidation(
  toast: UseToastFn
): UseBatchDialogueValidationResult {
  const [isValidatingLocal, setIsValidatingLocal] = useState(false)
  const [progressLocal, setProgressLocal] = useState<BatchValidationProgress | null>(
    null
  )
  const [reportLocal, setReportLocal] = useState<BatchValidateReport | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const cancelledRef = useRef(false)
  /**
   * Verrou synchrone anti double-clic : pour N ≥ 20 (branche job),
   * `isValidatingLocal` ne devenait vrai qu'après l'appel réseau de
   * création de job, laissant une fenêtre où un second clic relance un
   * job de validation concurrent sur la même sélection.
   */
  const submittingRef = useRef(false)

  const jobIsPolling = useBatchValidationJobStore((s) => s.isPolling)
  const jobCurrent = useBatchValidationJobStore((s) => s.current)
  const jobTotal = useBatchValidationJobStore((s) => s.total)
  const jobReport = useBatchValidationJobStore((s) => s.report)
  const startPolling = useBatchValidationJobStore((s) => s.startPolling)
  const cancelActiveJob = useBatchValidationJobStore((s) => s.cancelActiveJob)
  const dismissJobReport = useBatchValidationJobStore((s) => s.dismissReport)

  useEffect(() => {
    if (!jobReport || jobIsPolling) return
    setReportLocal(jobReport)
  }, [jobReport, jobIsPolling])

  const dismissReport = useCallback(() => {
    setReportLocal(null)
    dismissJobReport()
  }, [dismissJobReport])

  const cancelBatchValidation = useCallback(() => {
    cancelledRef.current = true
    abortRef.current?.abort()
    cancelActiveJob()
  }, [cancelActiveJob])

  const startBatchValidation = useCallback(
    async (documentIds: string[]) => {
      if (submittingRef.current || isValidatingLocal || jobIsPolling) return
      const ids = documentIds.map((id) => id.trim()).filter(Boolean)
      if (ids.length === 0) {
        toast('Sélectionnez au moins un dialogue à valider', 'warning')
        return
      }

      cancelledRef.current = false
      setReportLocal(null)
      dismissJobReport()
      setProgressLocal({ current: 0, total: ids.length })
      submittingRef.current = true
      setIsValidatingLocal(true)

      try {
        if (ids.length < BATCH_VALIDATE_JOB_MIN) {
          abortRef.current = new AbortController()
          const collected: BatchValidationItem[] = []
          for (let index = 0; index < ids.length; index += 1) {
            if (cancelledRef.current) {
              for (const remaining of ids.slice(index)) {
                collected.push({
                  document_id: remaining,
                  status: 'cancelled',
                  issues: [],
                  validated_at: new Date().toISOString(),
                })
              }
              break
            }
            const one = await batchValidateSync(
              [ids[index]],
              abortRef.current.signal
            )
            collected.push(...one.items)
            setProgressLocal({ current: index + 1, total: ids.length })
          }
          const result = summarize(collected, cancelledRef.current)
          setReportLocal(result)
          toast(
            cancelledRef.current
              ? 'Validation batch annulée'
              : `Validation : ${result.valid_count} OK, ${result.invalid_count} erreur(s)`,
            cancelledRef.current || result.invalid_count > 0 ? 'warning' : 'success'
          )
          return
        }

        const created = await startBatchValidateJob(ids)
        setProgressLocal({ current: 0, total: created.total })
        startPolling(created.job_id)
        toast('Validation batch lancée en arrière-plan', 'info', 3000)
      } catch (err) {
        if ((err as { code?: string; name?: string })?.name === 'CanceledError') {
          toast('Validation batch annulée', 'warning')
        } else if (!cancelledRef.current) {
          toast(getErrorMessage(err), 'error')
        }
      } finally {
        setIsValidatingLocal(false)
        submittingRef.current = false
        abortRef.current = null
      }
    },
    [toast, startPolling, dismissJobReport, isValidatingLocal, jobIsPolling]
  )

  const isValidating = isValidatingLocal || jobIsPolling
  const progress: BatchValidationProgress | null = jobIsPolling
    ? { current: jobCurrent, total: jobTotal }
    : progressLocal

  return {
    isValidating,
    progress,
    report: reportLocal ?? jobReport,
    dismissReport,
    startBatchValidation,
    cancelBatchValidation,
  }
}
