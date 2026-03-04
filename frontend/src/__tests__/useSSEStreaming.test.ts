/**
 * Tests unitaires pour le hook useSSEStreaming.
 * L'API actuelle utilise connect(jobId) pour ouvrir le stream ; les tests vérifient l'état initial et le cycle connect/disconnect.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { useSSEStreaming } from '@/hooks/useSSEStreaming'
import { useGenerationStore } from '@/store/generationStore'

// Mock EventSource pour éviter les appels réseau en test
const mockClose = vi.fn()
const MockEventSource = vi.fn().mockImplementation(function (this: any) {
  this.readyState = 1
  this.close = mockClose
  return this
})
global.EventSource = MockEventSource as any

describe('useSSEStreaming', () => {
  beforeEach(() => {
    mockClose.mockClear()
    MockEventSource.mockClear()
    const store = useGenerationStore.getState()
    if (store.resetStreamingState) {
      store.resetStreamingState()
    }
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('should have initial state disconnected', () => {
    const { result } = renderHook(() => useSSEStreaming({}))
    expect(result.current.isConnected).toBe(false)
    expect(result.current.eventSource).toBeNull()
  })

  it('should create EventSource when connect is called', async () => {
    const { result } = renderHook(() => useSSEStreaming({}))

    await act(async () => {
      result.current.connect('job-123')
    })

    await waitFor(() => {
      expect(MockEventSource).toHaveBeenCalled()
      expect(result.current.eventSource).not.toBeNull()
    })
  })

  it('should call disconnect and close EventSource', async () => {
    const { result } = renderHook(() => useSSEStreaming({}))

    await act(async () => {
      result.current.connect('job-123')
    })

    await waitFor(() => expect(result.current.eventSource).not.toBeNull())

    act(() => {
      result.current.disconnect()
    })

    await waitFor(() => {
      expect(mockClose).toHaveBeenCalled()
    })
  })
})
