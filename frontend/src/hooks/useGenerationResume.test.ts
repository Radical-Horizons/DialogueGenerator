/**
 * F5 pendant une génération : au retour, l'interface reprend le job (flux rebranché,
 * le serveur rejouant son journal) ou dit clairement pourquoi elle ne le peut pas.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'

vi.mock('../api/dialogues', () => ({
  getGenerationJobStatus: vi.fn(),
  cancelGenerationJob: vi.fn().mockResolvedValue({ success: true }),
  createGenerationJob: vi.fn(),
}))

import * as dialoguesAPI from '../api/dialogues'
import {
  OPTION_LOST_ON_RELOAD,
  RESUME_LOST_MESSAGE,
  RESUME_RUNNING_MESSAGE,
  RESUME_UNREACHABLE_MESSAGE,
  useGenerationResume,
} from './useGenerationResume'
import { useGenerationStore } from '../store/generationStore'
import { closeAllBackgroundSources, useGenerationOptionsStore } from '../store/generationOptionsStore'
import {
  clearPersistedRun,
  persistRunJob,
  readPersistedRun,
  startPersistedRun,
} from '../utils/generationRunSession'
import type { GenerationJobStatus } from '../types/api'

class FakeEventSource {
  static CONNECTING = 0
  static OPEN = 1
  static CLOSED = 2
  static urls: string[] = []
  readyState = 0
  onmessage: ((e: { data: string }) => void) | null = null
  onerror: (() => void) | null = null
  onopen: (() => void) | null = null
  listeners: Record<string, () => void> = {}
  addEventListener(type: string, fn: () => void) {
    this.listeners[type] = fn
  }
  constructor(url: string) {
    FakeEventSource.urls.push(url)
  }
  close() {
    this.readyState = 2
  }
}

function status(partial: Partial<GenerationJobStatus>): GenerationJobStatus {
  return {
    job_id: 'job-main',
    status: 'running',
    result: null,
    error: null,
    created_at: '2026-11-11T00:00:00Z',
    updated_at: '2026-11-11T00:00:00Z',
    ...partial,
  }
}

function renderResume() {
  const connectSSE = vi.fn()
  const setError = vi.fn()
  const toast = vi.fn()
  renderHook(() => useGenerationResume({ connectSSE, setError, toast }))
  return { connectSSE, setError, toast }
}

describe('useGenerationResume', () => {
  beforeEach(() => {
    FakeEventSource.urls = []
    vi.stubGlobal('EventSource', FakeEventSource as unknown as typeof EventSource)
    vi.mocked(dialoguesAPI.getGenerationJobStatus).mockReset()
    clearPersistedRun()
    useGenerationStore.getState().resetStreamingState()
    useGenerationOptionsStore.setState({ slots: [], liveText: {}, keptIndex: null, parkedRun: null })
  })

  afterEach(() => {
    closeAllBackgroundSources()
    vi.unstubAllGlobals()
  })

  it('sans génération en cours avant le rechargement, ne fait rien', () => {
    const { connectSSE, toast } = renderResume()
    expect(dialoguesAPI.getGenerationJobStatus).not.toHaveBeenCalled()
    expect(connectSSE).not.toHaveBeenCalled()
    expect(toast).not.toHaveBeenCalled()
  })

  it('rebranche le flux principal et les options du lot, et le dit', async () => {
    startPersistedRun(3, { jobId: 'job-main', streamUrl: '/stream-main' })
    persistRunJob(1, { jobId: 'job-opt', streamUrl: '/stream-opt' }, 3)
    vi.mocked(dialoguesAPI.getGenerationJobStatus).mockResolvedValue(status({}))

    const { connectSSE, toast } = renderResume()

    await waitFor(() => expect(connectSSE).toHaveBeenCalledWith('/stream-main'))
    const generation = useGenerationStore.getState()
    expect(generation.isGenerating).toBe(true)
    expect(generation.currentJobId).toBe('job-main')
    expect(generation.generationStartedAt).toBe(Date.parse('2026-11-11T00:00:00Z'))
    const slots = useGenerationOptionsStore.getState().slots
    expect(slots.map((s) => s.status)).toEqual(['running', 'running', 'error'])
    expect(slots[1].jobId).toBe('job-opt')
    expect(slots[2].error).toBe(OPTION_LOST_ON_RELOAD)
    expect(FakeEventSource.urls).toEqual(['/stream-opt'])
    expect(toast).toHaveBeenCalledWith(RESUME_RUNNING_MESSAGE, 'info')
  })

  it('job inconnu (serveur redémarré) : message explicite, rien ne reste « en cours »', async () => {
    startPersistedRun(1, { jobId: 'job-main', streamUrl: '/stream-main' })
    vi.mocked(dialoguesAPI.getGenerationJobStatus).mockRejectedValue({ response: { status: 404 } })

    const { connectSSE, setError, toast } = renderResume()

    await waitFor(() => expect(setError).toHaveBeenCalledWith(RESUME_LOST_MESSAGE))
    expect(toast).toHaveBeenCalledWith(RESUME_LOST_MESSAGE, 'error', 10_000)
    expect(connectSSE).not.toHaveBeenCalled()
    expect(useGenerationStore.getState().isGenerating).toBe(false)
    expect(readPersistedRun()).toBeNull()
  })

  it('serveur injoignable : message explicite', async () => {
    startPersistedRun(1, { jobId: 'job-main', streamUrl: '/stream-main' })
    vi.mocked(dialoguesAPI.getGenerationJobStatus).mockRejectedValue(new Error('Network Error'))

    const { setError } = renderResume()

    await waitFor(() => expect(setError).toHaveBeenCalledWith(RESUME_UNREACHABLE_MESSAGE))
  })

  it('le lot gardé disparaît quand plus rien n’écrit', async () => {
    startPersistedRun(1, { jobId: 'job-main', streamUrl: '/stream-main' })
    vi.mocked(dialoguesAPI.getGenerationJobStatus).mockResolvedValue(status({}))
    const { connectSSE } = renderResume()
    await waitFor(() => expect(connectSSE).toHaveBeenCalled())
    expect(readPersistedRun()).not.toBeNull()

    act(() => {
      useGenerationOptionsStore.getState().updateSlot(0, { status: 'completed' })
    })
    expect(readPersistedRun()).toBeNull()
  })
})
