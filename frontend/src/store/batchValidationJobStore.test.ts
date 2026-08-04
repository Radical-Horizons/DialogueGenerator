/**
 * Polling app-level validation batch (Story 8.8) — toast hors page.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { waitFor } from '@testing-library/react'
import { useBatchValidationJobStore } from './batchValidationJobStore'
import * as batchApi from '../api/batchValidation'
import { toastManager } from '../components/shared/Toast'

vi.mock('../api/batchValidation', () => ({
  getBatchValidateJob: vi.fn(),
  cancelBatchValidateJob: vi.fn(),
}))

vi.mock('../components/shared/Toast', () => ({
  toastManager: { show: vi.fn() },
}))

describe('batchValidationJobStore', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useBatchValidationJobStore.setState({
      jobId: null,
      status: null,
      current: 0,
      total: 0,
      report: null,
      error: null,
      isPolling: false,
    })
  })

  it('toaste à la fin même sans composant bibliothèque monté', async () => {
    vi.mocked(batchApi.getBatchValidateJob).mockResolvedValue({
      job_id: 'j1',
      status: 'completed',
      current: 2,
      total: 2,
      cancelled: false,
      report: {
        items: [],
        cancelled: false,
        started_at: 't0',
        finished_at: 't1',
        valid_count: 2,
        invalid_count: 0,
        skipped_count: 0,
      },
    })

    useBatchValidationJobStore.getState().startPolling('j1')

    await waitFor(() => {
      expect(toastManager.show).toHaveBeenCalledWith(
        expect.stringContaining('2 OK'),
        'success',
        5000
      )
    })
    expect(useBatchValidationJobStore.getState().isPolling).toBe(false)
  })
})
