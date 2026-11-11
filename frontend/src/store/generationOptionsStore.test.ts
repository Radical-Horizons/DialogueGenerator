/**
 * Multi-options (2b) : store, runner d'arrière-plan et annulation.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { GenerateUnityDialogueRequest } from '../types/api'

vi.mock('../api/dialogues', () => ({
  createGenerationJob: vi.fn(),
  cancelGenerationJob: vi.fn().mockResolvedValue({ success: true }),
}))

import * as dialoguesAPI from '../api/dialogues'
import {
  BACKGROUND_RECONNECT_GRACE_MS,
  MAX_GENERATION_OPTIONS,
  cancelBackgroundOptions,
  launchBackgroundOption,
  markMainOptionCancelled,
  releaseRunIfEmpty,
  useGenerationOptionsStore,
} from './generationOptionsStore'
import { STREAM_FLUSH_INTERVAL_MS } from '../utils/chunkCoalescer'
import { clearPersistedRun, readPersistedRun } from '../utils/generationRunSession'
import { SSE_HEARTBEAT_EVENT, SSE_STALL_TIMEOUT_MS } from '../utils/sseStallWatchdog'

/** Faux EventSource contrôlable depuis les tests. */
class FakeEventSource {
  static CONNECTING = 0
  static OPEN = 1
  static CLOSED = 2
  static instances: FakeEventSource[] = []
  url: string
  readyState = 0
  onmessage: ((e: { data: string }) => void) | null = null
  onerror: (() => void) | null = null
  onopen: (() => void) | null = null
  listeners: Record<string, () => void> = {}
  addEventListener(type: string, fn: () => void) {
    this.listeners[type] = fn
  }
  constructor(url: string) {
    this.url = url
    FakeEventSource.instances.push(this)
  }
  close() {
    this.readyState = 2
  }
  emit(payload: unknown) {
    this.onmessage?.({ data: JSON.stringify(payload) })
  }
}

const REQUEST = { user_instructions: 'test' } as GenerateUnityDialogueRequest

describe('generationOptionsStore', () => {
  beforeEach(() => {
    FakeEventSource.instances = []
    vi.stubGlobal('EventSource', FakeEventSource as unknown as typeof EventSource)
    vi.mocked(dialoguesAPI.createGenerationJob).mockReset()
    vi.mocked(dialoguesAPI.cancelGenerationJob).mockClear()
    useGenerationOptionsStore.setState({
      optionCount: 1,
      slots: [],
      liveText: {},
      lastRequest: null,
      keptIndex: null,
      parkedRun: null,
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('setOptionCount borne à [1, MAX_GENERATION_OPTIONS]', () => {
    useGenerationOptionsStore.getState().setOptionCount(99)
    expect(useGenerationOptionsStore.getState().optionCount).toBe(MAX_GENERATION_OPTIONS)
    useGenerationOptionsStore.getState().setOptionCount(0)
    expect(useGenerationOptionsStore.getState().optionCount).toBe(1)
  })

  it('startRun crée N slots pending et mémorise la requête pour les variantes', () => {
    useGenerationOptionsStore.getState().startRun(3, REQUEST)
    const { slots, lastRequest } = useGenerationOptionsStore.getState()
    expect(slots).toHaveLength(3)
    expect(slots.every((s) => s.status === 'pending')).toBe(true)
    expect(lastRequest).toBe(REQUEST)
  })

  it('launchBackgroundOption : job créé → running, complete SSE → completed avec résultat', async () => {
    vi.mocked(dialoguesAPI.createGenerationJob).mockResolvedValue({
      job_id: 'job-2',
      stream_url: '/api/v1/dialogues/generate/jobs/job-2/stream?sse_token=x',
      status: 'queued',
    })
    useGenerationOptionsStore.getState().startRun(2, REQUEST)

    await launchBackgroundOption(1, REQUEST)
    expect(useGenerationOptionsStore.getState().slots[1].status).toBe('running')
    expect(useGenerationOptionsStore.getState().slots[1].jobId).toBe('job-2')

    const es = FakeEventSource.instances[0]
    es.emit({ type: 'chunk', content: 'ignoré' })
    expect(useGenerationOptionsStore.getState().slots[1].status).toBe('running')

    es.emit({ type: 'complete', result: { json_content: '{"nodes":[]}' } })
    const slot = useGenerationOptionsStore.getState().slots[1]
    expect(slot.status).toBe('completed')
    expect(slot.result?.json_content).toBe('{"nodes":[]}')
  })

  it('launchBackgroundOption : erreur SSE → slot en erreur', async () => {
    vi.mocked(dialoguesAPI.createGenerationJob).mockResolvedValue({
      job_id: 'job-3',
      stream_url: '/stream',
      status: 'queued',
    })
    useGenerationOptionsStore.getState().startRun(2, REQUEST)
    await launchBackgroundOption(1, REQUEST)
    FakeEventSource.instances[0].emit({ type: 'error', message: 'Budget dépassé' })
    const slot = useGenerationOptionsStore.getState().slots[1]
    expect(slot.status).toBe('error')
    expect(slot.error).toBe('Budget dépassé')
  })

  it('launchBackgroundOption : échec de création du job → erreur sans EventSource', async () => {
    vi.mocked(dialoguesAPI.createGenerationJob).mockRejectedValue(new Error('500'))
    useGenerationOptionsStore.getState().startRun(2, REQUEST)
    await launchBackgroundOption(1, REQUEST)
    expect(useGenerationOptionsStore.getState().slots[1].status).toBe('error')
    expect(FakeEventSource.instances).toHaveLength(0)
  })

  it('cancelBackgroundOptions annule les jobs non terminés mais pas le slot 0', async () => {
    vi.mocked(dialoguesAPI.createGenerationJob).mockResolvedValue({
      job_id: 'job-bg',
      stream_url: '/stream',
      status: 'queued',
    })
    useGenerationOptionsStore.getState().startRun(3, REQUEST)
    useGenerationOptionsStore.getState().updateSlot(0, { status: 'running', jobId: 'job-main' })
    await launchBackgroundOption(1, REQUEST)
    useGenerationOptionsStore.getState().updateSlot(2, { status: 'completed' })

    cancelBackgroundOptions()

    const { slots } = useGenerationOptionsStore.getState()
    expect(slots[0].status).toBe('running') // principal : géré par le pipeline SSE existant
    expect(slots[1].status).toBe('cancelled')
    expect(slots[2].status).toBe('completed') // terminé : intact
    expect(dialoguesAPI.cancelGenerationJob).toHaveBeenCalledWith('job-bg')
    expect(dialoguesAPI.cancelGenerationJob).not.toHaveBeenCalledWith('job-main')
  })

  it('un lot démarré pendant la création du job ne reçoit pas le résultat du lot périmé', async () => {
    // La création reste en vol le temps qu'un second `startRun` survienne : sans garde
    // sur `runId`, la promesse périmée écrivait son jobId dans le slot du nouveau lot
    // et sa source écrasait l'entrée de `backgroundSources` (connexion orpheline).
    let resolveJob: (v: { job_id: string; stream_url: string; status: string }) => void = () => {}
    vi.mocked(dialoguesAPI.createGenerationJob).mockReturnValue(
      new Promise((resolve) => {
        resolveJob = resolve
      }) as ReturnType<typeof dialoguesAPI.createGenerationJob>
    )

    useGenerationOptionsStore.getState().startRun(2, REQUEST)
    const pending = launchBackgroundOption(1, REQUEST)

    useGenerationOptionsStore.getState().startRun(2, REQUEST) // nouveau lot
    resolveJob({ job_id: 'job-perime', stream_url: '/stream-perime', status: 'queued' })
    await pending

    const slot = useGenerationOptionsStore.getState().slots[1]
    expect(slot.jobId).toBeNull()
    expect(slot.status).toBe('pending')
    expect(FakeEventSource.instances).toHaveLength(0)
    expect(dialoguesAPI.cancelGenerationJob).toHaveBeenCalledWith('job-perime')
  })

  it('clearRun ferme les flux d’arrière-plan encore ouverts', async () => {
    vi.mocked(dialoguesAPI.createGenerationJob).mockResolvedValue({
      job_id: 'job-bg',
      stream_url: '/stream',
      status: 'queued',
    })
    useGenerationOptionsStore.getState().startRun(2, REQUEST)
    await launchBackgroundOption(1, REQUEST)
    expect(FakeEventSource.instances[0].readyState).not.toBe(2)

    useGenerationOptionsStore.getState().clearRun()

    expect(FakeEventSource.instances[0].readyState).toBe(2)
  })

  it('une option d’arrière-plan écrit son texte sans toucher aux slots', async () => {
    vi.mocked(dialoguesAPI.createGenerationJob).mockResolvedValue({
      job_id: 'job-bg',
      stream_url: '/stream',
      status: 'queued',
    })
    useGenerationOptionsStore.getState().startRun(2, REQUEST)
    await launchBackgroundOption(1, REQUEST)
    const slotsBefore = useGenerationOptionsStore.getState().slots

    vi.useFakeTimers()
    try {
      FakeEventSource.instances[0].emit({ type: 'chunk', content: '{"title"', sequence: 0 })
      FakeEventSource.instances[0].emit({ type: 'chunk', content: ':"T"', sequence: 1 })
      vi.advanceTimersByTime(STREAM_FLUSH_INTERVAL_MS)
    } finally {
      vi.useRealTimers()
    }

    expect(useGenerationOptionsStore.getState().liveText[1]).toBe('{"title":"T"')
    expect(useGenerationOptionsStore.getState().slots).toBe(slotsBefore)
  })

  it('une option annulée pendant la création de son job ne démarre pas', async () => {
    let resolveJob!: (job: { job_id: string; stream_url: string; status: string }) => void
    vi.mocked(dialoguesAPI.createGenerationJob).mockReturnValue(
      new Promise((resolve) => {
        resolveJob = resolve
      }) as ReturnType<typeof dialoguesAPI.createGenerationJob>
    )
    useGenerationOptionsStore.getState().startRun(2, REQUEST)
    const pending = launchBackgroundOption(1, REQUEST)

    cancelBackgroundOptions()
    resolveJob({ job_id: 'job-tardif', stream_url: '/stream', status: 'queued' })
    await pending

    expect(useGenerationOptionsStore.getState().slots[1].status).toBe('cancelled')
    expect(FakeEventSource.instances).toHaveLength(0)
    expect(dialoguesAPI.cancelGenerationJob).toHaveBeenCalledWith('job-tardif')
  })

  it('Interrompre coupe aussi l’option 1 relancée en Variante', async () => {
    vi.mocked(dialoguesAPI.createGenerationJob).mockResolvedValue({
      job_id: 'job-variante',
      stream_url: '/stream',
      status: 'queued',
    })
    useGenerationOptionsStore.getState().startRun(1, REQUEST)
    await launchBackgroundOption(0, REQUEST)

    cancelBackgroundOptions()

    expect(useGenerationOptionsStore.getState().slots[0].status).toBe('cancelled')
    expect(FakeEventSource.instances[0].readyState).toBe(2)
    expect(dialoguesAPI.cancelGenerationJob).toHaveBeenCalledWith('job-variante')
  })

  it('markMainOptionCancelled n’écrase pas une option déjà terminée', () => {
    useGenerationOptionsStore.getState().startRun(1, REQUEST)
    useGenerationOptionsStore.getState().updateSlot(0, { status: 'completed' })

    markMainOptionCancelled()

    expect(useGenerationOptionsStore.getState().slots[0].status).toBe('completed')
  })

  it('parkRun range le lot, restoreRun le rend avec l’option gardée', () => {
    const store = useGenerationOptionsStore.getState()
    store.startRun(2, REQUEST)
    store.updateSlot(0, { status: 'completed' })
    store.setKeptIndex(0)

    useGenerationOptionsStore.getState().parkRun()
    expect(useGenerationOptionsStore.getState().slots).toEqual([])
    expect(useGenerationOptionsStore.getState().parkedRun?.keptIndex).toBe(0)

    useGenerationOptionsStore.getState().restoreRun()
    const state = useGenerationOptionsStore.getState()
    expect(state.slots).toHaveLength(2)
    expect(state.keptIndex).toBe(0)
    expect(state.parkedRun).toBeNull()
  })

  it('un nouveau lot oublie le lot rangé', () => {
    const store = useGenerationOptionsStore.getState()
    store.startRun(2, REQUEST)
    store.parkRun()

    useGenerationOptionsStore.getState().startRun(1, REQUEST)

    expect(useGenerationOptionsStore.getState().parkedRun).toBeNull()
  })

  it('releaseRunIfEmpty vide un lot sans résultat et garde un lot qui en a un', () => {
    const store = useGenerationOptionsStore.getState()
    store.startRun(2, REQUEST)
    store.updateSlot(0, { status: 'cancelled' })
    releaseRunIfEmpty()
    expect(useGenerationOptionsStore.getState().slots).toEqual([])

    useGenerationOptionsStore.getState().startRun(2, REQUEST)
    useGenerationOptionsStore.getState().updateSlot(1, { status: 'completed' })
    releaseRunIfEmpty()
    expect(useGenerationOptionsStore.getState().slots).toHaveLength(2)
  })

  describe('serveur coupé', () => {
    async function runningBackgroundOption(): Promise<FakeEventSource> {
      vi.mocked(dialoguesAPI.createGenerationJob).mockResolvedValue({
        job_id: 'job-coupe',
        stream_url: '/stream-coupe',
        status: 'queued',
      })
      useGenerationOptionsStore.getState().startRun(2, REQUEST)
      await launchBackgroundOption(1, REQUEST)
      return FakeEventSource.instances[0]
    }

    afterEach(() => {
      vi.useRealTimers()
      clearPersistedRun()
    })

    it("une option dont le serveur ne répond plus passe en erreur au bout du délai, le lot n'est pas bloqué", async () => {
      const es = await runningBackgroundOption()
      vi.useFakeTimers()
      es.onerror?.()
      vi.advanceTimersByTime(BACKGROUND_RECONNECT_GRACE_MS - 1)
      expect(useGenerationOptionsStore.getState().slots[1].status).toBe('running')
      vi.advanceTimersByTime(1)
      const slot = useGenerationOptionsStore.getState().slots[1]
      expect(slot.status).toBe('error')
      expect(slot.error).toBe('Connexion au serveur perdue')
      expect(es.readyState).toBe(FakeEventSource.CLOSED)
    })

    it('une reconnexion réussie garde l’option en cours', async () => {
      const es = await runningBackgroundOption()
      vi.useFakeTimers()
      es.onerror?.()
      es.onopen?.()
      vi.advanceTimersByTime(BACKGROUND_RECONNECT_GRACE_MS + 1_000)
      expect(useGenerationOptionsStore.getState().slots[1].status).toBe('running')
    })

    it('flux muet (proxy qui garde la connexion, API tombée) : l’option passe en erreur', async () => {
      vi.useFakeTimers()
      const es = await runningBackgroundOption()
      vi.advanceTimersByTime(SSE_STALL_TIMEOUT_MS - 1_000)
      es.listeners[SSE_HEARTBEAT_EVENT]()
      vi.advanceTimersByTime(SSE_STALL_TIMEOUT_MS - 1_000)
      expect(useGenerationOptionsStore.getState().slots[1].status).toBe('running')
      vi.advanceTimersByTime(1_000)
      expect(useGenerationOptionsStore.getState().slots[1]).toMatchObject({
        status: 'error',
        error: 'Connexion au serveur perdue',
      })
    })

    it('le job de l’option est gardé pour une reprise après rechargement', async () => {
      await runningBackgroundOption()
      expect(readPersistedRun()?.jobs[1]).toEqual({ jobId: 'job-coupe', streamUrl: '/stream-coupe' })
    })
  })
})
