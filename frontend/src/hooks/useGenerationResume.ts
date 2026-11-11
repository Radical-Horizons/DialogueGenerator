/**
 * Reprise, après un rechargement de page, de la génération qui tournait.
 *
 * Le serveur poursuit le job sans client et rejoue son journal à la reconnexion : il
 * suffit de rebrancher les flux. Chaque issue est dite à l'utilisateur — reprise,
 * job perdu au redémarrage du serveur, serveur injoignable, job arrêté entre-temps.
 */
import { useEffect, useRef } from 'react'
import * as dialoguesAPI from '../api/dialogues'
import { useGenerationStore } from '../store/generationStore'
import {
  attachBackgroundOption,
  useGenerationOptionsStore,
} from '../store/generationOptionsStore'
import {
  clearPersistedRun,
  readPersistedRun,
  type PersistedGenerationRun,
} from '../utils/generationRunSession'

export const RESUME_LOST_MESSAGE =
  'La génération lancée avant le rechargement est perdue : le serveur a redémarré entre-temps. Relancez-la.'
export const RESUME_UNREACHABLE_MESSAGE =
  'Serveur injoignable : impossible de reprendre la génération lancée avant le rechargement. Relancez-la quand il répond.'
export const RESUME_CANCELLED_MESSAGE =
  'La génération lancée avant le rechargement a été interrompue.'
export const RESUME_RUNNING_MESSAGE = 'Génération en cours reprise après le rechargement.'
export const RESUME_COMPLETED_MESSAGE =
  'La génération s’est terminée pendant le rechargement : résultat récupéré.'
export const OPTION_LOST_ON_RELOAD = 'Option non lancée avant le rechargement'

export interface UseGenerationResumeOptions {
  connectSSE: (streamUrl: string) => void
  setError: (error: string | null) => void
  toast: (message: string, type?: 'success' | 'error' | 'info' | 'warning', duration?: number) => unknown
}

function isWriting(slots: ReadonlyArray<{ status: string }>): boolean {
  return slots.some((s) => s.status === 'running' || s.status === 'pending')
}

type ResumeOutcome =
  | { kind: 'resumed'; completed: boolean; startedAt?: number }
  | { kind: 'failed'; message: string }

async function checkMainJob(jobId: string): Promise<ResumeOutcome> {
  try {
    const status = await dialoguesAPI.getGenerationJobStatus(jobId)
    if (status.status === 'cancelled') return { kind: 'failed', message: RESUME_CANCELLED_MESSAGE }
    if (status.status === 'error') {
      return {
        kind: 'failed',
        message: `La génération lancée avant le rechargement a échoué : ${status.error ?? 'erreur inconnue'}`,
      }
    }
    const startedAt = Date.parse(status.created_at)
    return {
      kind: 'resumed',
      completed: status.status === 'completed',
      ...(Number.isFinite(startedAt) ? { startedAt } : {}),
    }
  } catch (err) {
    const httpStatus = (err as { response?: { status?: number } } | null)?.response?.status
    if (httpStatus === 404) {
      return { kind: 'failed', message: RESUME_LOST_MESSAGE }
    }
    if (typeof httpStatus === 'number') {
      return {
        kind: 'failed',
        message: `Impossible de reprendre la génération lancée avant le rechargement (HTTP ${httpStatus}).`,
      }
    }
    return { kind: 'failed', message: RESUME_UNREACHABLE_MESSAGE }
  }
}

/** Rebranche les flux d'un lot gardé ; renvoie ce qu'il faut dire à l'utilisateur. */
export async function resumePersistedRun(
  run: PersistedGenerationRun,
  connectSSE: (streamUrl: string) => void,
): Promise<ResumeOutcome> {
  const main = run.jobs[0]
  let outcome: ResumeOutcome = { kind: 'resumed', completed: false }
  if (main) {
    outcome = await checkMainJob(main.jobId)
    if (outcome.kind === 'failed') return outcome
  }

  const options = useGenerationOptionsStore.getState()
  options.startRun(run.optionCount, null)
  if (main) {
    options.updateSlot(0, { jobId: main.jobId, status: 'running' })
    useGenerationStore.getState().startGeneration(main.jobId)
    if (outcome.kind === 'resumed' && outcome.startedAt !== undefined) {
      // Le compteur du header repart de l'heure de lancement, pas du rechargement.
      useGenerationStore.setState({ generationStartedAt: outcome.startedAt })
    }
    connectSSE(main.streamUrl)
  }
  for (let index = 0; index < run.optionCount; index++) {
    const job = run.jobs[index]
    if (index === 0 && main) continue
    if (job) {
      attachBackgroundOption(index, { job_id: job.jobId, stream_url: job.streamUrl })
    } else {
      options.updateSlot(index, { status: 'error', error: OPTION_LOST_ON_RELOAD })
    }
  }
  return outcome
}

export function useGenerationResume({ connectSSE, setError, toast }: UseGenerationResumeOptions): void {
  const resumeStartedRef = useRef(false)
  const latest = useRef({ connectSSE, setError, toast })
  latest.current = { connectSSE, setError, toast }

  useEffect(() => {
    if (resumeStartedRef.current) return
    resumeStartedRef.current = true
    const run = readPersistedRun()
    if (!run) return
    void resumePersistedRun(run, (url) => latest.current.connectSSE(url)).then((outcome) => {
      const { setError: reportError, toast: notify } = latest.current
      if (outcome.kind === 'failed') {
        clearPersistedRun()
        reportError(outcome.message)
        notify(outcome.message, 'error', 10_000)
      } else {
        notify(outcome.completed ? RESUME_COMPLETED_MESSAGE : RESUME_RUNNING_MESSAGE, 'info')
      }
    })
  }, [])

  // Un lot dont plus rien n'écrit n'a plus rien à reprendre. Sur la transition seulement :
  // un réglage touché au repos ne doit pas effacer un lot en attente de reprise.
  useEffect(
    () =>
      useGenerationOptionsStore.subscribe((state, previous) => {
        if (isWriting(previous.slots) && !isWriting(state.slots)) {
          clearPersistedRun()
        }
      }),
    [],
  )
}
