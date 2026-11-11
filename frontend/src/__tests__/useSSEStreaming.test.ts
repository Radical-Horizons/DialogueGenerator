/**
 * Tests unitaires pour le hook useSSEStreaming.
 * L'API actuelle utilise connect(jobId) pour ouvrir le stream ; les tests vérifient l'état initial et le cycle connect/disconnect.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import {
  SSE_CONNECTION_LOST_MESSAGE,
  SSE_RECONNECT_GRACE_MS,
  useSSEStreaming,
} from '@/hooks/useSSEStreaming'
import { useGenerationStore } from '@/store/generationStore'
import { STREAM_FLUSH_INTERVAL_MS } from '@/utils/chunkCoalescer'
import { SSE_HEARTBEAT_EVENT, SSE_STALL_TIMEOUT_MS } from '@/utils/sseStallWatchdog'

// Mock EventSource pour éviter les appels réseau en test
const mockClose = vi.fn()
interface MockEventSourceInstance {
  readyState: number
  close: () => void
  onmessage: ((event: MessageEvent) => void) | null
  onopen: (() => void) | null
  onerror: (() => void) | null
  listeners: Record<string, () => void>
  addEventListener: (type: string, fn: () => void) => void
}
const MockEventSource = vi.fn().mockImplementation(function (
  this: MockEventSourceInstance
) {
  this.readyState = 1
  this.close = mockClose
  this.onmessage = null
  this.onopen = null
  this.onerror = null
  this.listeners = {}
  this.addEventListener = (type: string, fn: () => void) => {
    this.listeners[type] = fn
  }
  return this
})
Object.assign(MockEventSource, { CONNECTING: 0, OPEN: 1, CLOSED: 2 })
global.EventSource = MockEventSource as unknown as typeof EventSource

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

  it('should create EventSource when connect is called with full stream URL', async () => {
    const { result } = renderHook(() => useSSEStreaming({}))
    const streamUrl =
      '/api/v1/dialogues/generate/jobs/job-123/stream?sse_token=signed'

    await act(async () => {
      result.current.connect(streamUrl)
    })

    await waitFor(() => {
      expect(MockEventSource).toHaveBeenCalledWith(streamUrl)
      expect(result.current.eventSource).not.toBeNull()
    })
  })

  it('should replace an existing EventSource when connect is called again', async () => {
    const { result } = renderHook(() => useSSEStreaming({}))
    await act(async () => {
      result.current.connect('/stream/1')
      result.current.connect('/stream/2')
    })
    expect(MockEventSource).toHaveBeenCalledTimes(2)
    expect(mockClose).toHaveBeenCalled()
  })

  it('should call setTokensUsed when metadata.tokens is 0', async () => {
    const spy = vi.spyOn(useGenerationStore.getState(), 'setTokensUsed')
    const { result } = renderHook(() => useSSEStreaming({}))

    await act(async () => {
      result.current.connect('http://localhost/sse')
    })

    const inst = MockEventSource.mock.results[0]?.value as MockEventSourceInstance
    expect(inst?.onmessage).toBeTruthy()

    await act(async () => {
      inst.onmessage!({
        data: JSON.stringify({ type: 'metadata', tokens: 0 }),
      } as MessageEvent)
    })

    expect(spy).toHaveBeenCalledWith(0)
    spy.mockRestore()
  })

  it('should prefer usage_prompt_tokens + usage_completion_tokens over estimate tokens', async () => {
    const spy = vi.spyOn(useGenerationStore.getState(), 'setTokensUsed')
    const { result } = renderHook(() => useSSEStreaming({}))

    await act(async () => {
      result.current.connect('http://localhost/sse')
    })

    const inst = MockEventSource.mock.results[0]?.value as MockEventSourceInstance
    await act(async () => {
      inst.onmessage!({
        data: JSON.stringify({
          type: 'metadata',
          tokens: 9999,
          usage_prompt_tokens: 10,
          usage_completion_tokens: 5,
        }),
      } as MessageEvent)
    })

    expect(spy).toHaveBeenCalledWith(15)
    spy.mockRestore()
  })

  it('should debounce onerror before calling onError callback', async () => {
    vi.useFakeTimers()
    const onError = vi.fn()
    const { result } = renderHook(() => useSSEStreaming({ onError }))

    await act(async () => {
      result.current.connect('http://localhost/sse')
    })

    const inst = MockEventSource.mock.results[0]?.value as MockEventSourceInstance
    inst.readyState = 1

    act(() => {
      inst.onerror!()
      inst.onerror!()
    })

    await act(async () => {
      vi.advanceTimersByTime(600)
    })

    expect(onError).toHaveBeenCalledTimes(1)
    vi.useRealTimers()
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

  it('should append chunk with empty string content', async () => {
    const spy = vi.spyOn(useGenerationStore.getState(), 'appendChunks')
    const { result } = renderHook(() => useSSEStreaming({}))

    await act(async () => {
      result.current.connect('http://localhost/sse')
    })

    const inst = MockEventSource.mock.results[0]?.value as MockEventSourceInstance
    await act(async () => {
      inst.onmessage!({
        data: JSON.stringify({ type: 'chunk', content: '', sequence: 1 }),
      } as MessageEvent)
    })
    act(() => result.current.disconnect())

    expect(spy).toHaveBeenCalledWith([{ content: '', sequence: 1 }])
    spy.mockRestore()
  })

  it('regroupe les deltas : un rendu par intervalle, pas un par message', async () => {
    useGenerationStore.getState().startGeneration('job')
    const { result } = renderHook(() => useSSEStreaming({}))
    await act(async () => {
      result.current.connect('http://localhost/sse')
    })
    const updates = vi.fn()
    const unsubscribe = useGenerationStore.subscribe(updates)

    vi.useFakeTimers()
    try {
      const inst = MockEventSource.mock.results[0]?.value as MockEventSourceInstance
      act(() => {
        for (let sequence = 0; sequence < 50; sequence++) {
          inst.onmessage!({
            data: JSON.stringify({ type: 'chunk', content: 'x', sequence }),
          } as MessageEvent)
        }
      })
      expect(updates).not.toHaveBeenCalled()

      act(() => {
        vi.advanceTimersByTime(STREAM_FLUSH_INTERVAL_MS)
      })
      expect(updates).toHaveBeenCalledTimes(1)
      expect(useGenerationStore.getState().streamingContent).toHaveLength(50)
    } finally {
      vi.useRealTimers()
      unsubscribe()
    }
  })

  it('livre les deltas en attente avant le résultat final', async () => {
    useGenerationStore.getState().startGeneration('job')
    const { result } = renderHook(() => useSSEStreaming({}))
    await act(async () => {
      result.current.connect('http://localhost/sse')
    })

    const inst = MockEventSource.mock.results[0]?.value as MockEventSourceInstance
    await act(async () => {
      inst.onmessage!({
        data: JSON.stringify({ type: 'chunk', content: 'fin', sequence: 0 }),
      } as MessageEvent)
      inst.onmessage!({
        data: JSON.stringify({ type: 'complete', result: { json_content: '{}' } }),
      } as MessageEvent)
    })

    expect(useGenerationStore.getState().streamingContent).toBe('fin')
  })

  it('should ignore step events after complete (out-of-order)', async () => {
    const setStep = vi.spyOn(useGenerationStore.getState(), 'setStep')
    const { result } = renderHook(() => useSSEStreaming({}))

    await act(async () => {
      result.current.connect('http://localhost/sse')
    })

    const inst = MockEventSource.mock.results[0]?.value as MockEventSourceInstance
    await act(async () => {
      inst.onmessage!({
        data: JSON.stringify({ type: 'complete', result: { json_content: '{}' } }),
      } as MessageEvent)
    })
    setStep.mockClear()
    await act(async () => {
      inst.onmessage!({
        data: JSON.stringify({ type: 'step', step: 'Late' }),
      } as MessageEvent)
    })

    expect(setStep).not.toHaveBeenCalled()
    setStep.mockRestore()
  })

  it('should close EventSource 500ms after complete', async () => {
    vi.useFakeTimers()
    mockClose.mockClear()
    const { result } = renderHook(() => useSSEStreaming({}))

    await act(async () => {
      result.current.connect('http://localhost/sse')
    })

    const inst = MockEventSource.mock.results[0]?.value as MockEventSourceInstance
    await act(async () => {
      inst.onmessage!({
        data: JSON.stringify({ type: 'complete', result: { json_content: '{}' } }),
      } as MessageEvent)
    })

    expect(mockClose).not.toHaveBeenCalled()
    await act(async () => {
      vi.advanceTimersByTime(500)
    })
    expect(mockClose).toHaveBeenCalled()
    vi.useRealTimers()
  })

  describe('serveur coupé pendant une génération', () => {
    async function connectWithFirstChunk(options: Parameters<typeof useSSEStreaming>[0] = {}) {
      useGenerationStore.getState().startGeneration('job-coupe')
      const hook = renderHook(() => useSSEStreaming(options))
      await act(async () => {
        hook.result.current.connect('http://localhost/sse')
      })
      const inst = MockEventSource.mock.results[0]?.value as MockEventSourceInstance
      await act(async () => {
        inst.onmessage!({
          data: JSON.stringify({ type: 'chunk', content: 'Bon', sequence: 0 }),
        } as MessageEvent)
      })
      return { ...hook, inst }
    }

    it('rend la main quand le navigateur abandonne le flux (CLOSED), au lieu de rester bloqué', async () => {
      const setIsLoading = vi.fn()
      const toast = vi.fn()
      const { inst } = await connectWithFirstChunk({ setIsLoading, toast })

      inst.readyState = 2
      act(() => inst.onerror!())

      const state = useGenerationStore.getState()
      expect(state.isGenerating).toBe(false)
      expect(state.error).toBe(SSE_CONNECTION_LOST_MESSAGE)
      expect(setIsLoading).toHaveBeenCalledWith(false)
      expect(toast).toHaveBeenCalledWith(SSE_CONNECTION_LOST_MESSAGE, 'error')
    })

    it('F5 : la coupure du flux par le navigateur qui quitte la page n’est pas une panne', async () => {
      const onError = vi.fn()
      const { inst } = await connectWithFirstChunk({ onError })
      vi.useFakeTimers()
      try {
        window.dispatchEvent(new Event('beforeunload'))
        inst.readyState = 2
        act(() => inst.onerror!())

        expect(onError).not.toHaveBeenCalled()
        expect(useGenerationStore.getState().isGenerating).toBe(true)
      } finally {
        vi.advanceTimersByTime(1_000)
        vi.useRealTimers()
      }
    })

    it('laisse EventSource se reconnecter, puis abandonne au bout du délai de grâce', async () => {
      vi.useFakeTimers()
      try {
        const onError = vi.fn()
        const { inst } = await connectWithFirstChunk({ onError })

        inst.readyState = 0
        act(() => inst.onerror!())
        act(() => {
          vi.advanceTimersByTime(SSE_RECONNECT_GRACE_MS - 1)
        })
        expect(onError).not.toHaveBeenCalled()
        expect(useGenerationStore.getState().isGenerating).toBe(true)

        act(() => {
          vi.advanceTimersByTime(1)
        })
        expect(onError).toHaveBeenCalledWith(SSE_CONNECTION_LOST_MESSAGE)
        expect(useGenerationStore.getState().isGenerating).toBe(false)
      } finally {
        vi.useRealTimers()
      }
    })

    it('API tombée derrière un proxy qui garde la connexion : plus de battement, la main revient', async () => {
      vi.useFakeTimers()
      try {
        const onError = vi.fn()
        const { inst } = await connectWithFirstChunk({ onError })
        expect(vi.getTimerCount()).toBeGreaterThan(0)

        act(() => {
          vi.advanceTimersByTime(SSE_STALL_TIMEOUT_MS - 1_000)
          inst.listeners[SSE_HEARTBEAT_EVENT]()
          vi.advanceTimersByTime(SSE_STALL_TIMEOUT_MS - 1_000)
        })
        expect(onError).not.toHaveBeenCalled()

        act(() => {
          vi.advanceTimersByTime(1_000)
        })
        expect(onError).toHaveBeenCalledWith(SSE_CONNECTION_LOST_MESSAGE)
        expect(useGenerationStore.getState().isGenerating).toBe(false)
        expect(mockClose).toHaveBeenCalled()
      } finally {
        vi.useRealTimers()
      }
    })

    it('une reconnexion réussie annule l’abandon', async () => {
      vi.useFakeTimers()
      try {
        const onError = vi.fn()
        const { inst } = await connectWithFirstChunk({ onError })

        inst.readyState = 0
        act(() => inst.onerror!())
        act(() => {
          inst.readyState = 1
          inst.onopen!()
          vi.advanceTimersByTime(SSE_RECONNECT_GRACE_MS + 1_000)
        })
        expect(onError).not.toHaveBeenCalled()
        expect(useGenerationStore.getState().isGenerating).toBe(true)
      } finally {
        vi.useRealTimers()
      }
    })

    it('un résultat rejoué deux fois ne se charge qu’une fois', async () => {
      const onComplete = vi.fn()
      const { inst } = await connectWithFirstChunk({ onComplete })
      const complete = {
        data: JSON.stringify({ type: 'complete', result: { json_content: '{}' } }),
      } as MessageEvent
      await act(async () => {
        inst.onmessage!(complete)
        inst.onmessage!(complete)
      })
      expect(onComplete).toHaveBeenCalledTimes(1)
    })
  })

  it('should surface error payload on error event', async () => {
    const setErr = vi.spyOn(useGenerationStore.getState(), 'setError')
    const { result } = renderHook(() => useSSEStreaming({}))

    await act(async () => {
      result.current.connect('http://localhost/sse')
    })

    const inst = MockEventSource.mock.results[0]?.value as MockEventSourceInstance
    await act(async () => {
      inst.onmessage!({
        data: JSON.stringify({ type: 'error', message: 'fail-msg' }),
      } as MessageEvent)
    })

    expect(setErr).toHaveBeenCalledWith('fail-msg')
    setErr.mockRestore()
  })
})
