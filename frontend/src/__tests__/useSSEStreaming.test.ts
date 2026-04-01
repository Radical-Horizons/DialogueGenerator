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
interface MockEventSourceInstance {
  readyState: number
  close: () => void
  onmessage: ((event: MessageEvent) => void) | null
  onopen: (() => void) | null
  onerror: (() => void) | null
}
const MockEventSource = vi.fn().mockImplementation(function (
  this: MockEventSourceInstance
) {
  this.readyState = 1
  this.close = mockClose
  this.onmessage = null
  this.onopen = null
  this.onerror = null
  return this
})
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

  it('should not create a second EventSource if already connected', async () => {
    const { result } = renderHook(() => useSSEStreaming({}))
    await act(async () => {
      result.current.connect('/stream/1')
      result.current.connect('/stream/2')
    })
    expect(MockEventSource).toHaveBeenCalledTimes(1)
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
    const spy = vi.spyOn(useGenerationStore.getState(), 'appendChunk')
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

    expect(spy).toHaveBeenCalledWith('', 1)
    spy.mockRestore()
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
