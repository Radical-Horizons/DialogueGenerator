import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useBatchDialogueValidation } from './useBatchDialogueValidation'
import * as batchApi from '../api/batchValidation'

vi.mock('../api/batchValidation', async () => {
  const actual = await vi.importActual<typeof import('../api/batchValidation')>(
    '../api/batchValidation'
  )
  return {
    ...actual,
    batchValidateSync: vi.fn(),
    startBatchValidateJob: vi.fn(),
    getBatchValidateJob: vi.fn(),
    cancelBatchValidateJob: vi.fn(),
  }
})

const toast = vi.fn()

describe('useBatchDialogueValidation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('utilise le sync pour N < 20', async () => {
    vi.mocked(batchApi.batchValidateSync).mockResolvedValue({
      items: [
        {
          document_id: 'a',
          status: 'valid',
          issues: [],
          validated_at: 't',
        },
      ],
      cancelled: false,
      started_at: 't',
      finished_at: 't',
      valid_count: 1,
      invalid_count: 0,
      skipped_count: 0,
    })
    const { result } = renderHook(() => useBatchDialogueValidation(toast))
    await act(async () => {
      await result.current.startBatchValidation(['a', 'b'])
    })
    expect(batchApi.batchValidateSync).toHaveBeenCalledTimes(2)
    expect(batchApi.startBatchValidateJob).not.toHaveBeenCalled()
    expect(result.current.report?.valid_count).toBe(2)
  })

  it('lance un job pour N ≥ 20', async () => {
    vi.useFakeTimers()
    vi.mocked(batchApi.startBatchValidateJob).mockResolvedValue({
      job_id: 'job-1',
      status: 'queued',
      total: 20,
    })
    vi.mocked(batchApi.getBatchValidateJob).mockResolvedValue({
      job_id: 'job-1',
      status: 'completed',
      current: 20,
      total: 20,
      cancelled: false,
      report: {
        items: [],
        cancelled: false,
        started_at: 't',
        finished_at: 't',
        valid_count: 20,
        invalid_count: 0,
        skipped_count: 0,
      },
    })
    const ids = Array.from({ length: 20 }, (_, i) => `d${i}`)
    const { result } = renderHook(() => useBatchDialogueValidation(toast))
    await act(async () => {
      const promise = result.current.startBatchValidation(ids)
      await vi.runAllTimersAsync()
      await promise
    })
    expect(batchApi.startBatchValidateJob).toHaveBeenCalled()
    expect(result.current.report?.valid_count).toBe(20)
  })
})
