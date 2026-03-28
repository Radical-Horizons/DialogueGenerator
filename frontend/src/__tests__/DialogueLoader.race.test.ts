import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useDialogueLoader } from '../hooks/useDialogueLoader'
import { useGraphStore } from '../store/graphStore'
import type { UnityDialogueMetadata } from '../types/api'

const toastMock = vi.fn()

function unityDialogueFixture(
  partial: Pick<UnityDialogueMetadata, 'filename'> & Partial<UnityDialogueMetadata>
): UnityDialogueMetadata {
  return {
    file_path: `/mock/${partial.filename}`,
    size_bytes: 0,
    modified_time: '2020-01-01T00:00:00Z',
    ...partial,
  }
}
const getUnityDialogueMock = vi.fn()

vi.mock('../api/unityDialogues', () => ({
  getUnityDialogue: (...args: unknown[]) => getUnityDialogueMock(...args),
}))

// Mocking documentsAPI to control timing
const getDocumentMock = vi.fn()
const getLayoutMock = vi.fn()
vi.mock('../api/documents', () => ({
  getDocument: (id: string) => getDocumentMock(id),
  getLayout: (id: string) => getLayoutMock(id),
}))

describe('useDialogueLoader Race Conditions', () => {
  beforeEach(() => {
    toastMock.mockReset()
    getUnityDialogueMock.mockReset()
    getDocumentMock.mockReset()
    getLayoutMock.mockReset()
    useGraphStore.getState().resetGraph()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('ignores previous load result when a new load starts (cancellation via sequence)', async () => {
    // 1. Setup first load to be slow
    let resolveFirst!: (value: {
      document: { nodes: Array<{ id: string; line: string }> }
      revision: number
    }) => void
    const firstPromise = new Promise<{
      document: { nodes: Array<{ id: string; line: string }> }
      revision: number
    }>((resolve) => {
      resolveFirst = resolve
    })
    
    // Initial implementation returns the slow promise for 'first' or 'first.json'
    getDocumentMock.mockImplementation((id) => {
      if (id === 'first' || id === 'first.json') return firstPromise
      return Promise.reject({ response: { status: 404 } })
    })
    getLayoutMock.mockImplementation(() => Promise.resolve({ layout: {}, revision: 1 }))

    const { result } = renderHook(() => useDialogueLoader(toastMock, null))

    // Start first load
    await act(async () => {
      result.current.setSelectedDialogue(
        unityDialogueFixture({
          filename: 'first.json',
          title: 'First',
          node_count: 0,
          edge_count: 0,
        })
      )
      // Give some time for the effect to trigger and increment sequence
      await new Promise(r => setTimeout(r, 20))
    })

    // 2. Start second load immediately
    getDocumentMock.mockImplementation((id) => {
      if (id === 'second' || id === 'second.json') {
        return Promise.resolve({
          document: { nodes: [{ id: 'node-second', line: 'Second' }] },
          revision: 1
        })
      }
      return Promise.reject({ response: { status: 404 } })
    })

    await act(async () => {
      result.current.setSelectedDialogue(
        unityDialogueFixture({
          filename: 'second.json',
          title: 'Second',
          node_count: 0,
          edge_count: 0,
        })
      )
      // Give some time for the effect to trigger and increment sequence again
      await new Promise(r => setTimeout(r, 20))
    })

    // Wait for second load to finish
    await waitFor(() => {
      expect(useGraphStore.getState().documentId).toBe('second')
    })

    // 3. Resolve first load (stale)
    await act(async () => {
      resolveFirst({
        document: { nodes: [{ id: 'node-first', line: 'First' }] },
        revision: 1
      })
      // Wait a bit to ensure it doesn't overwrite
      await new Promise(r => setTimeout(r, 100))
    })

    // State should still be 'second'
    expect(useGraphStore.getState().documentId).toBe('second')
    expect(useGraphStore.getState().nodes[0].id).toBe('node-second')
  })
})
