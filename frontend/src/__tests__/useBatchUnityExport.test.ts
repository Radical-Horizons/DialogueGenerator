/**
 * Story 5.2 FR50 — export batch Unity : progression, annulation, échecs.
 */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useBatchUnityExport } from '../hooks/useBatchUnityExport'
import * as dialoguesAPI from '../api/dialogues'

vi.mock('../api/dialogues', () => ({
  batchExportUnityDialogues: vi.fn(),
}))

const batchExportMock = vi.mocked(dialoguesAPI.batchExportUnityDialogues)
const toastMock = vi.fn()

describe('useBatchUnityExport', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('affiche la progression 1/3 puis 3/3 lors d’un batch séquentiel', async () => {
    batchExportMock
      .mockResolvedValueOnce({ exported: ['a.json'], failed: [], success: true })
      .mockResolvedValueOnce({ exported: ['b.json'], failed: [], success: true })
      .mockResolvedValueOnce({ exported: ['c.json'], failed: [], success: true })

    const { result } = renderHook(() => useBatchUnityExport(toastMock))

    await act(async () => {
      void result.current.startBatchExport(['doc_a', 'doc_b', 'doc_c'])
    })

    await waitFor(() => {
      expect(result.current.isBatchExporting).toBe(false)
    })

    expect(batchExportMock).toHaveBeenCalledTimes(3)
    expect(batchExportMock).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ document_ids: ['doc_a'] }),
      expect.any(AbortSignal),
    )
    expect(result.current.batchSummary?.exportedCount).toBe(3)
  })

  it('continue après un échec validation et prépare le retry', async () => {
    batchExportMock
      .mockResolvedValueOnce({ exported: ['ok1.json'], failed: [], success: true })
      .mockResolvedValueOnce({
        exported: [],
        failed: [{ id: 'bad', errors: ['choiceId manquant'] }],
        success: false,
      })
      .mockResolvedValueOnce({ exported: ['ok2.json'], failed: [], success: true })

    const { result } = renderHook(() => useBatchUnityExport(toastMock))

    await act(async () => {
      await result.current.startBatchExport(['ok1', 'bad', 'ok2'])
    })

    expect(result.current.batchSummary?.exportedCount).toBe(2)
    expect(result.current.batchSummary?.failedCount).toBe(1)
    expect(result.current.batchSummary?.failed[0].id).toBe('bad')

    batchExportMock.mockResolvedValueOnce({
      exported: ['bad.json'],
      failed: [],
      success: true,
    })

    await act(async () => {
      await result.current.retryFailedExports()
    })

    expect(result.current.checkedDocumentIds.has('bad')).toBe(true)
    expect(batchExportMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ document_ids: ['bad'] }),
      expect.any(AbortSignal),
    )
  })

  it('annule le batch en cours sans traiter les documents restants', async () => {
    let unblockSecond: () => void
    const secondGate = new Promise<void>((resolve) => {
      unblockSecond = resolve
    })

    batchExportMock
      .mockResolvedValueOnce({ exported: ['d1.json'], failed: [], success: true })
      .mockImplementationOnce(async () => {
        await secondGate
        return { exported: ['d2.json'], failed: [], success: true }
      })
      .mockResolvedValue({ exported: ['d3.json'], failed: [], success: true })

    const { result } = renderHook(() => useBatchUnityExport(toastMock))

    let exportPromise: Promise<void>
    act(() => {
      exportPromise = result.current.startBatchExport(['d1', 'd2', 'd3', 'd4', 'd5'])
    })

    await waitFor(() => {
      expect(batchExportMock).toHaveBeenCalledTimes(2)
    })

    act(() => {
      result.current.cancelBatchExport()
      unblockSecond!()
    })

    await act(async () => {
      await exportPromise!
    })

    expect(batchExportMock.mock.calls.length).toBe(2)
    expect(result.current.batchSummary?.cancelled).toBe(true)
    expect(result.current.batchSummary?.exportedCount).toBe(2)
  })

  it('respecte skip_validation quand validateBeforeExport est false', async () => {
    batchExportMock.mockResolvedValue({ exported: ['x.json'], failed: [], success: true })

    const { result } = renderHook(() => useBatchUnityExport(toastMock))

    act(() => {
      result.current.setBatchOptions({
        validateBeforeExport: false,
        filenameStrategy: 'preserve',
      })
    })

    await act(async () => {
      await result.current.startBatchExport(['doc_x'])
    })

    expect(batchExportMock).toHaveBeenCalledWith(
      expect.objectContaining({ skip_validation: true }),
      expect.any(AbortSignal),
    )
  })
})
