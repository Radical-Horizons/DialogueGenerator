/**
 * Polling app-level génération batch FR88 face à un redémarrage serveur.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useBatchNodeGenerationJobStore } from './batchNodeGenerationJobStore'
import * as batchApi from '../api/batchNodeGeneration'
import type { BatchGenerateJobStatus } from '../api/batchNodeGeneration'
import { toastManager } from '../components/shared/Toast'

vi.mock('../api/batchNodeGeneration', () => ({
  getBatchGenerateFromNodesJob: vi.fn(),
  cancelBatchGenerateFromNodesJob: vi.fn(),
}))

vi.mock('../components/shared/Toast', () => ({
  toastManager: { show: vi.fn() },
}))

const partialReport = {
  items: [
    { parent_node_id: 'n0', status: 'ok' as const, nodes: [{ id: 'c0' }], suggested_connections: [] },
    { parent_node_id: 'n1', status: 'cancelled' as const, nodes: [], suggested_connections: [] },
  ],
  cancelled: false,
  started_at: 't0',
  finished_at: '',
  ok_count: 1,
  error_count: 0,
  skipped_count: 1,
  total_nodes_generated: 1,
}

function jobStatus(partial: Partial<BatchGenerateJobStatus>): BatchGenerateJobStatus {
  return {
    job_id: 'job-1',
    status: 'running',
    current: 0,
    total: 2,
    detail: '',
    cancelled: false,
    ...partial,
  }
}

describe('batchNodeGenerationJobStore — redémarrage serveur', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    vi.mocked(batchApi.cancelBatchGenerateFromNodesJob).mockResolvedValue(jobStatus({}))
    useBatchNodeGenerationJobStore.setState({
      jobId: null,
      status: null,
      current: 0,
      total: 0,
      detail: '',
      report: null,
      error: null,
      isPolling: false,
      pendingApplyReport: null,
    })
  })

  afterEach(() => {
    useBatchNodeGenerationJobStore.getState().cancelActiveJob()
    vi.useRealTimers()
  })

  it('un job interrupted arrête le polling, garde le rapport partiel et n’applique rien', async () => {
    vi.mocked(batchApi.getBatchGenerateFromNodesJob).mockResolvedValue(
      jobStatus({ status: 'interrupted', report: partialReport })
    )

    useBatchNodeGenerationJobStore.getState().startPolling('job-1')
    await vi.advanceTimersByTimeAsync(0)

    const state = useBatchNodeGenerationJobStore.getState()
    expect(state.status).toBe('interrupted')
    expect(state.isPolling).toBe(false)
    expect(state.report).toEqual(partialReport)
    expect(state.pendingApplyReport).toBeNull()
    expect(toastManager.show).toHaveBeenCalledWith(
      expect.stringContaining('Reprendre'),
      'warning',
      8000
    )
  })

  it('une panne réseau passagère (redéploiement) ne coupe pas le polling', async () => {
    vi.mocked(batchApi.getBatchGenerateFromNodesJob)
      .mockRejectedValueOnce(new Error('Network Error'))
      .mockRejectedValueOnce({ response: { status: 502 } })
      .mockResolvedValueOnce(jobStatus({ status: 'interrupted', report: partialReport }))

    useBatchNodeGenerationJobStore.getState().startPolling('job-1')
    await vi.advanceTimersByTimeAsync(0)
    expect(useBatchNodeGenerationJobStore.getState().isPolling).toBe(true)

    await vi.advanceTimersByTimeAsync(3000)

    expect(batchApi.getBatchGenerateFromNodesJob).toHaveBeenCalledTimes(3)
    expect(useBatchNodeGenerationJobStore.getState().status).toBe('interrupted')
    expect(toastManager.show).not.toHaveBeenCalledWith(expect.anything(), 'error', 8000)
  })

  it('un 404 (lot expiré) est définitif, avec un message explicite', async () => {
    vi.mocked(batchApi.getBatchGenerateFromNodesJob).mockRejectedValue({
      response: { status: 404 },
    })

    useBatchNodeGenerationJobStore.getState().startPolling('job-1')
    await vi.advanceTimersByTimeAsync(0)

    const state = useBatchNodeGenerationJobStore.getState()
    expect(batchApi.getBatchGenerateFromNodesJob).toHaveBeenCalledTimes(1)
    expect(state.isPolling).toBe(false)
    expect(state.error).toMatch(/introuvable/)
  })
})
