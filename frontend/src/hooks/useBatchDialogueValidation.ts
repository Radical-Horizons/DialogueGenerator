/**
 * Hook validation batch dialogues (Story 8.8 / FR87).
 * N < 20 : boucle sync séquentielle + AbortController ; N ≥ 20 : job serveur + polling.
 */
import { useCallback, useRef, useState } from 'react'
import {
  BATCH_VALIDATE_JOB_MIN,
  batchValidateSync,
  cancelBatchValidateJob,
  getBatchValidateJob,
  startBatchValidateJob,
  type BatchValidateReport,
  type BatchValidationItem,
} from '../api/batchValidation'
import type { UseToastFn } from '../components/shared'
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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function emptyReport(partial: Partial<BatchValidateReport> = {}): BatchValidateReport {
  return {
    items: [],
    cancelled: false,
    started_at: new Date().toISOString(),
    finished_at: new Date().toISOString(),
    valid_count: 0,
    invalid_count: 0,
    skipped_count: 0,
    ...partial,
  }
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
  const [isValidating, setIsValidating] = useState(false)
  const [progress, setProgress] = useState<BatchValidationProgress | null>(null)
  const [report, setReport] = useState<BatchValidateReport | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const jobIdRef = useRef<string | null>(null)
  const cancelledRef = useRef(false)

  const dismissReport = useCallback(() => setReport(null), [])

  const cancelBatchValidation = useCallback(() => {
    cancelledRef.current = true
    abortRef.current?.abort()
    const jobId = jobIdRef.current
    if (jobId) {
      void cancelBatchValidateJob(jobId).catch(() => undefined)
    }
  }, [])

  const startBatchValidation = useCallback(
    async (documentIds: string[]) => {
      const ids = documentIds.map((id) => id.trim()).filter(Boolean)
      if (ids.length === 0) {
        toast('Sélectionnez au moins un dialogue à valider', 'warning')
        return
      }

      cancelledRef.current = false
      setIsValidating(true)
      setReport(null)
      setProgress({ current: 0, total: ids.length })

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
            setProgress({ current: index + 1, total: ids.length })
          }
          const result = summarize(collected, cancelledRef.current)
          setReport(result)
          toast(
            cancelledRef.current
              ? 'Validation batch annulée'
              : `Validation : ${result.valid_count} OK, ${result.invalid_count} erreur(s)`,
            cancelledRef.current || result.invalid_count > 0 ? 'warning' : 'success'
          )
          return
        }

        const created = await startBatchValidateJob(ids)
        jobIdRef.current = created.job_id
        setProgress({ current: 0, total: created.total })

        let done = false
        while (!done) {
          const status = await getBatchValidateJob(created.job_id)
          setProgress({ current: status.current, total: status.total })
          if (
            status.status === 'completed' ||
            status.status === 'cancelled' ||
            status.status === 'error'
          ) {
            if (status.report) setReport(status.report)
            else if (status.status === 'cancelled') {
              setReport(emptyReport({ cancelled: true }))
            }
            if (status.status === 'error') {
              toast(status.error || 'Erreur validation batch', 'error')
            } else if (status.status === 'cancelled') {
              toast('Validation batch annulée', 'warning')
            } else if (status.report) {
              toast(
                `Validation : ${status.report.valid_count} OK, ${status.report.invalid_count} erreur(s)`,
                status.report.invalid_count > 0 ? 'warning' : 'success'
              )
            }
            done = true
            break
          }
          await sleep(cancelledRef.current ? 400 : 800)
        }
      } catch (err) {
        if ((err as { code?: string; name?: string })?.name === 'CanceledError') {
          toast('Validation batch annulée', 'warning')
        } else if (!cancelledRef.current) {
          toast(getErrorMessage(err), 'error')
        }
      } finally {
        setIsValidating(false)
        abortRef.current = null
        jobIdRef.current = null
      }
    },
    [toast]
  )

  return {
    isValidating,
    progress,
    report,
    dismissReport,
    startBatchValidation,
    cancelBatchValidation,
  }
}
