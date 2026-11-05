/**
 * Génération multi-options (écran 2b) — N appels LLM parallèles, plafonnés.
 *
 * Chaque option est un job de génération distinct (`POST /dialogues/generate/jobs`).
 * Le backend n'exécute un job que lorsqu'un consommateur SSE réclame son stream
 * (`try_claim_stream_job`) : les options d'arrière-plan ouvrent donc chacune leur
 * EventSource. L'option 1 passe par le pipeline principal ; les autres écrivent leur
 * texte dans `liveText`, que l'écran 2a affiche dès que l'option 1 a fini.
 *
 * Décision produit (août 2026) : plusieurs appels autorisés, parallèles, limités
 * à un nombre raisonnable — `MAX_GENERATION_OPTIONS`.
 */
import { create } from 'zustand'
import * as dialoguesAPI from '../api/dialogues'
import type { GenerateUnityDialogueRequest, GenerateUnityDialogueResponse } from '../types/api'
import { createChunkCoalescer } from '../utils/chunkCoalescer'

/** Plafond dur du nombre d'appels LLM parallèles par génération. */
export const MAX_GENERATION_OPTIONS = 4

export type GenerationOptionStatus = 'pending' | 'running' | 'completed' | 'error' | 'cancelled'

export interface GenerationOptionSlot {
  /** 0 = option principale (streamée par le pipeline SSE existant). */
  index: number
  jobId: string | null
  status: GenerationOptionStatus
  result: GenerateUnityDialogueResponse | null
  error: string | null
}

interface GenerationOptionsState {
  /** Réglage utilisateur : nombre d'options par génération (1 = comportement historique). */
  optionCount: number
  /**
   * Identité du lot courant, incrémentée à chaque `startRun`.
   * Deux lots successifs peuvent avoir la même taille : c'est ce compteur, et non
   * `slots.length`, qui permet de réagir « une fois par lot » (repli du rail GDD).
   */
  runId: number
  /** Slots du run affiché ; `[]` au repos, ou tant que le lot est rangé (`parkedRun`). */
  slots: GenerationOptionSlot[]
  /**
   * Texte brut reçu par option d'arrière-plan. Hors de `slots` : chaque delta changerait
   * sinon l'identité des slots, donc tout ce qui en dérive (diagnostics, comparaison).
   */
  liveText: Record<number, string>
  /** Dernière requête envoyée — sert aux « Variante » (relance d'une seule option). */
  lastRequest: GenerateUnityDialogueRequest | null
  /** Index de l'option gardée (bordure accent dans la comparaison). */
  keptIndex: number | null
  /** Lot rangé par « Garder » : le brief revient, le lot reste rappelable. */
  parkedRun: { slots: GenerationOptionSlot[]; keptIndex: number | null } | null

  setOptionCount: (n: number) => void
  startRun: (count: number, request: GenerateUnityDialogueRequest) => void
  updateSlot: (index: number, patch: Partial<Omit<GenerationOptionSlot, 'index'>>) => void
  appendLiveText: (index: number, text: string) => void
  setKeptIndex: (index: number | null) => void
  parkRun: () => void
  restoreRun: () => void
  clearRun: () => void
}

export const useGenerationOptionsStore = create<GenerationOptionsState>()((set) => ({
  optionCount: 1,
  runId: 0,
  slots: [],
  liveText: {},
  lastRequest: null,
  keptIndex: null,
  parkedRun: null,

  setOptionCount: (n) =>
    set({ optionCount: Math.min(MAX_GENERATION_OPTIONS, Math.max(1, Math.round(n))) }),

  startRun: (count, request) =>
    set((state) => ({
      runId: state.runId + 1,
      slots: Array.from({ length: count }, (_, index) => ({
        index,
        jobId: null,
        status: 'pending' as const,
        result: null,
        error: null,
      })),
      liveText: {},
      lastRequest: request,
      keptIndex: null,
      parkedRun: null,
    })),

  updateSlot: (index, patch) =>
    set((state) => ({
      slots: state.slots.map((s) => (s.index === index ? { ...s, ...patch } : s)),
    })),

  appendLiveText: (index, text) =>
    set((state) => ({
      liveText: { ...state.liveText, [index]: (state.liveText[index] ?? '') + text },
    })),

  setKeptIndex: (index) => set({ keptIndex: index }),

  parkRun: () =>
    set((state) => ({
      parkedRun: { slots: state.slots, keptIndex: state.keptIndex },
      slots: [],
      keptIndex: null,
    })),

  restoreRun: () =>
    set((state) =>
      state.parkedRun
        ? { slots: state.parkedRun.slots, keptIndex: state.parkedRun.keptIndex, parkedRun: null }
        : state
    ),

  clearRun: () => {
    // Vider les slots sans fermer les flux laisserait des EventSource écrire dans
    // le vide : `updateSlot` deviendrait muet, mais la connexion resterait ouverte.
    closeAllBackgroundSources()
    set({ slots: [], liveText: {}, keptIndex: null, parkedRun: null })
  },
}))

/** EventSources des options d'arrière-plan, par index — pour l'annulation. */
const backgroundSources = new Map<number, EventSource>()

function closeBackgroundSource(index: number): void {
  const es = backgroundSources.get(index)
  if (es) {
    es.close()
    backgroundSources.delete(index)
  }
}

/** Ferme tous les flux d'arrière-plan encore ouverts, quel que soit leur lot. */
export function closeAllBackgroundSources(): void {
  for (const es of backgroundSources.values()) es.close()
  backgroundSources.clear()
}

/**
 * Lance (ou relance) une option d'arrière-plan : crée le job puis consomme son
 * stream SSE en n'exploitant que les événements terminaux.
 */
export async function launchBackgroundOption(
  index: number,
  request: GenerateUnityDialogueRequest,
  costEstimate?: { promptTokens?: number; completionTokens?: number; llmModelIdentifier?: string }
): Promise<void> {
  const { updateSlot, runId } = useGenerationOptionsStore.getState()
  // `createGenerationJob` est asynchrone : un nouveau lot peut démarrer pendant
  // l'attente. Sans cette garde, la promesse périmée écrit son `jobId` dans le slot
  // du lot suivant et ouvre une EventSource qui écrase l'entrée de `backgroundSources`
  // — une des deux connexions devient alors orpheline et injoignable.
  const launchRunId = runId
  const isStale = (): boolean => useGenerationOptionsStore.getState().runId !== launchRunId

  closeBackgroundSource(index)
  updateSlot(index, { status: 'pending', result: null, error: null, jobId: null })
  useGenerationOptionsStore.setState((state) => ({
    liveText: { ...state.liveText, [index]: '' },
  }))

  let job: { job_id: string; stream_url: string }
  try {
    job = await dialoguesAPI.createGenerationJob(request, costEstimate)
  } catch (err) {
    if (isStale()) return
    updateSlot(index, {
      status: 'error',
      error: err instanceof Error ? err.message : 'Création du job impossible',
    })
    return
  }

  const cancelledMeanwhile =
    useGenerationOptionsStore.getState().slots.find((s) => s.index === index)?.status === 'cancelled'
  if (isStale() || cancelledMeanwhile) {
    // Le lot a changé pendant la création : annuler le job côté serveur plutôt que
    // de le laisser consommer du budget pour un résultat que personne n'affichera.
    void dialoguesAPI.cancelGenerationJob(job.job_id).catch(() => {})
    return
  }

  updateSlot(index, { jobId: job.job_id, status: 'running' })

  const es = new EventSource(job.stream_url)
  backgroundSources.set(index, es)

  const liveChunks = createChunkCoalescer<string>((texts) => {
    if (backgroundSources.get(index) === es) {
      useGenerationOptionsStore.getState().appendLiveText(index, texts.join(''))
    }
  })

  es.onmessage = (event) => {
    if (isStale()) {
      closeBackgroundSource(index)
      return
    }
    try {
      const data = JSON.parse(event.data) as {
        type?: string
        content?: unknown
        result?: GenerateUnityDialogueResponse
        message?: string
      }
      if (data.type === 'chunk') {
        if (data.content !== undefined && data.content !== null) {
          liveChunks.push(String(data.content))
        }
      } else if (data.type === 'complete') {
        liveChunks.cancel()
        useGenerationOptionsStore
          .getState()
          .updateSlot(index, { status: 'completed', result: data.result ?? null })
        closeBackgroundSource(index)
      } else if (data.type === 'error') {
        liveChunks.cancel()
        useGenerationOptionsStore
          .getState()
          .updateSlot(index, { status: 'error', error: data.message ?? 'Erreur de génération' })
        closeBackgroundSource(index)
      }
      // steps/metadata : ignorés, ils ne concernent que le pipeline principal.
    } catch {
      // Événement SSE illisible : ignoré (le terminal arrivera ou l'erreur réseau fermera).
    }
  }

  es.onerror = () => {
    if (isStale()) {
      closeBackgroundSource(index)
      return
    }
    // Une fermeture serveur après `complete` déclenche onerror : ne signaler que si
    // le slot n'est pas déjà terminal.
    const slot = useGenerationOptionsStore.getState().slots.find((s) => s.index === index)
    if (slot && (slot.status === 'running' || slot.status === 'pending')) {
      if (es.readyState === EventSource.CLOSED) {
        useGenerationOptionsStore
          .getState()
          .updateSlot(index, { status: 'error', error: 'Connexion au stream perdue' })
        closeBackgroundSource(index)
      }
    }
  }
}

/** Annule toutes les options d'arrière-plan encore actives (interruption utilisateur). */
export function cancelBackgroundOptions(): void {
  const { slots, updateSlot } = useGenerationOptionsStore.getState()
  for (const slot of slots) {
    // L'option principale est annulée par le pipeline existant, sauf relancée en « Variante ».
    if (slot.index === 0 && slot.status === 'running' && !backgroundSources.has(0)) continue
    closeBackgroundSource(slot.index)
    if (slot.status === 'running' || slot.status === 'pending') {
      if (slot.jobId) {
        void dialoguesAPI.cancelGenerationJob(slot.jobId).catch(() => {
          // Job déjà terminé ou serveur injoignable : l'état local reste `cancelled`.
        })
      }
      updateSlot(slot.index, { status: 'cancelled' })
    }
  }
}

/** L'arrêt du flux principal laisse l'option 1 annulée, pas en échec. */
export function markMainOptionCancelled(): void {
  const { slots, updateSlot } = useGenerationOptionsStore.getState()
  if (slots.find((s) => s.index === 0)?.status === 'running') {
    updateSlot(0, { status: 'cancelled' })
  }
}

/** Un lot arrêté sans aucune option prête n'a rien à comparer : le brief reprend la colonne. */
export function releaseRunIfEmpty(): void {
  const { slots, clearRun } = useGenerationOptionsStore.getState()
  if (!slots.some((s) => s.status === 'completed')) clearRun()
}
