/**
 * Jobs de la génération en cours, gardés le temps d'un rechargement de page.
 *
 * Le serveur poursuit un job quand le flux SSE se ferme, et rejoue son journal à qui
 * se reconnecte : retrouver le job après un F5 suffit donc à reprendre l'affichage.
 * On ne garde que les identifiants et les URL de flux, jamais de contenu — et en
 * `sessionStorage` : la reprise concerne cet onglet, pas une autre session.
 */

export const GENERATION_RUN_STORAGE_KEY = 'dg.generationRun'

export interface PersistedGenerationJob {
  jobId: string
  streamUrl: string
}

export interface PersistedGenerationRun {
  /** Nombre d'options du lot (1 = génération simple). */
  optionCount: number
  /** Job par index d'option ; l'index 0 est le flux principal. */
  jobs: Record<number, PersistedGenerationJob>
}

function storage(): Storage | null {
  try {
    return typeof window !== 'undefined' ? window.sessionStorage : null
  } catch {
    return null
  }
}

function isPersistedJob(value: unknown): value is PersistedGenerationJob {
  const v = value as Partial<PersistedGenerationJob> | null
  return !!v && typeof v.jobId === 'string' && typeof v.streamUrl === 'string'
}

export function readPersistedRun(): PersistedGenerationRun | null {
  const raw = storage()?.getItem(GENERATION_RUN_STORAGE_KEY)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as Partial<PersistedGenerationRun>
    if (typeof parsed.optionCount !== 'number' || !parsed.jobs || typeof parsed.jobs !== 'object') {
      return null
    }
    const jobs: Record<number, PersistedGenerationJob> = {}
    for (const [key, job] of Object.entries(parsed.jobs)) {
      const index = Number(key)
      if (Number.isInteger(index) && index >= 0 && isPersistedJob(job)) {
        jobs[index] = { jobId: job.jobId, streamUrl: job.streamUrl }
      }
    }
    return Object.keys(jobs).length > 0 ? { optionCount: parsed.optionCount, jobs } : null
  } catch {
    return null
  }
}

function write(run: PersistedGenerationRun): void {
  try {
    storage()?.setItem(GENERATION_RUN_STORAGE_KEY, JSON.stringify(run))
  } catch {
    // Stockage plein ou interdit : la reprise après F5 est perdue, la génération non.
  }
}

/** Nouveau lot : remplace tout ce qui était gardé. */
export function startPersistedRun(optionCount: number, mainJob: PersistedGenerationJob): void {
  write({ optionCount, jobs: { 0: mainJob } })
}

/** Ajoute (ou remplace) le job d'une option au lot gardé. */
export function persistRunJob(index: number, job: PersistedGenerationJob, optionCount: number): void {
  const current = readPersistedRun()
  write({
    optionCount: Math.max(current?.optionCount ?? 0, optionCount),
    jobs: { ...(current?.jobs ?? {}), [index]: job },
  })
}

export function clearPersistedRun(): void {
  try {
    storage()?.removeItem(GENERATION_RUN_STORAGE_KEY)
  } catch {
    // Rien à nettoyer si le stockage est inaccessible.
  }
}
