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
  MAX_GENERATION_OPTIONS,
  cancelBackgroundOptions,
  launchBackgroundOption,
  useGenerationOptionsStore,
} from './generationOptionsStore'

/** Faux EventSource contrôlable depuis les tests. */
class FakeEventSource {
  static instances: FakeEventSource[] = []
  url: string
  readyState = 0
  onmessage: ((e: { data: string }) => void) | null = null
  onerror: (() => void) | null = null
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
      lastRequest: null,
      keptIndex: null,
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
})
