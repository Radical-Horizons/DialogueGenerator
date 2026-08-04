/**
 * Tests Story 8.8 — validation batch (sync N < 20, job N ≥ 20 via store).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useBatchDialogueValidation } from './useBatchDialogueValidation'

const toast = vi.fn()
const batchValidateSync = vi.fn()
const startBatchValidateJob = vi.fn()
const startPolling = vi.fn()
const cancelActiveJob = vi.fn()
const dismissReport = vi.fn()

vi.mock('../api/batchValidation', () => ({
  BATCH_VALIDATE_JOB_MIN: 20,
  batchValidateSync: (...args: unknown[]) => batchValidateSync(...args),
  startBatchValidateJob: (...args: unknown[]) => startBatchValidateJob(...args),
}))

vi.mock('../store/batchValidationJobStore', () => ({
  useBatchValidationJobStore: (
    selector: (s: {
      isPolling: boolean
      current: number
      total: number
      report: null
      startPolling: typeof startPolling
      cancelActiveJob: typeof cancelActiveJob
      dismissReport: typeof dismissReport
    }) => unknown
  ) =>
    selector({
      isPolling: false,
      current: 0,
      total: 0,
      report: null,
      startPolling,
      cancelActiveJob,
      dismissReport,
    }),
}))

describe('useBatchDialogueValidation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('boucle sync pour N < 20 et agrège le rapport', async () => {
    batchValidateSync
      .mockResolvedValueOnce({
        items: [
          {
            document_id: 'a',
            status: 'valid',
            issues: [],
            validated_at: '2026-01-01T00:00:00Z',
          },
        ],
        valid_count: 1,
        invalid_count: 0,
        cancelled: false,
      })
      .mockResolvedValueOnce({
        items: [
          {
            document_id: 'b',
            status: 'invalid',
            issues: [{ code: 'x', message: 'err', severity: 'error' }],
            validated_at: '2026-01-01T00:00:00Z',
          },
        ],
        valid_count: 0,
        invalid_count: 1,
        cancelled: false,
      })

    const { result } = renderHook(() => useBatchDialogueValidation(toast))

    await act(async () => {
      await result.current.startBatchValidation(['a', 'b'])
    })

    expect(batchValidateSync).toHaveBeenCalledTimes(2)
    expect(result.current.report?.valid_count).toBe(1)
    expect(result.current.report?.invalid_count).toBe(1)
    expect(toast).toHaveBeenCalledWith(
      expect.stringContaining('1 OK'),
      'warning'
    )
  })

  it('délègue au store pour N ≥ 20 (polling app-level)', async () => {
    startBatchValidateJob.mockResolvedValue({
      job_id: 'job-1',
      status: 'pending',
      current: 0,
      total: 20,
    })

    const { result } = renderHook(() => useBatchDialogueValidation(toast))
    const ids = Array.from({ length: 20 }, (_, i) => `d${i}`)

    await act(async () => {
      await result.current.startBatchValidation(ids)
    })

    expect(startBatchValidateJob).toHaveBeenCalledWith(ids)
    expect(startPolling).toHaveBeenCalledWith('job-1')
    expect(toast).toHaveBeenCalledWith(
      'Validation batch lancée en arrière-plan',
      'info',
      3000
    )
    expect(batchValidateSync).not.toHaveBeenCalled()
  })

  it('annule via le store quand un job est actif', async () => {
    const { result } = renderHook(() => useBatchDialogueValidation(toast))

    act(() => {
      result.current.cancelBatchValidation()
    })

    expect(cancelActiveJob).toHaveBeenCalled()
  })
})
