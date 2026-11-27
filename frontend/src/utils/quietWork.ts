/**
 * Travaux qui peuvent attendre une pause de l'auteur (Story 20.2, prototype de cartes).
 * À 500 répliques, le journal local et la validation d'après enregistrement bloquaient le fil
 * principal 30 à 100 ms après chaque glisser et chaque frappe. L'enregistrement automatique
 * n'est pas différé.
 */
import {
  acknowledgeSnapshot,
  setPending,
  type GraphPending,
  type GraphSnapshot,
} from './graphJournal'

export const QUIET_WORK_DELAY_MS = 1000
const JOURNAL_MAX_WAIT_MS = 10_000

export interface QuietTask {
  /** Remplace le travail en attente et relance le délai. */
  schedule: (work: () => void) => void
  /** Exécute tout de suite le travail en attente. */
  flush: () => void
}

export function createQuietTask(quietMs: number, maxWaitMs = Number.POSITIVE_INFINITY): QuietTask {
  let work: (() => void) | null = null
  let timer: ReturnType<typeof setTimeout> | null = null
  let since = 0
  const flush = () => {
    if (timer !== null) clearTimeout(timer)
    timer = null
    const next = work
    work = null
    next?.()
  }
  return {
    flush,
    schedule: (next) => {
      if (work === null) since = Date.now()
      work = next
      if (timer !== null) clearTimeout(timer)
      timer = setTimeout(flush, Math.max(0, Math.min(quietMs, since + maxWaitMs - Date.now())))
    },
  }
}

interface JournalQueue {
  documentId: string
  ack: GraphSnapshot | null
  pending: GraphPending | null
}

let queue: JournalQueue | null = null
const journalTask = createQuietTask(QUIET_WORK_DELAY_MS, JOURNAL_MAX_WAIT_MS)
let journalWrites: Promise<unknown> = Promise.resolve()
let flushOnHideBound = false

function writeJournalQueue(): void {
  const entry = queue
  queue = null
  if (!entry) return
  const { documentId, ack, pending } = entry
  journalWrites = journalWrites
    .then(() => (ack ? acknowledgeSnapshot(documentId, ack) : undefined))
    .then(() => (pending ? setPending(documentId, pending) : undefined))
    .catch((error: unknown) => console.warn('Journal différé:', error))
}

function queueFor(documentId: string): JournalQueue {
  if (queue && queue.documentId !== documentId) journalTask.flush()
  queue ??= { documentId, ack: null, pending: null }
  if (!flushOnHideBound && typeof window !== 'undefined') {
    // Page masquée ou quittée : le journal part tout de suite.
    flushOnHideBound = true
    window.addEventListener('pagehide', () => journalTask.flush())
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') journalTask.flush()
    })
  }
  return queue
}

/** `setPending` différé : seul le dernier état en attente s'écrit. */
export function queueJournalPending(documentId: string, pending: GraphPending): void {
  queueFor(documentId).pending = pending
  journalTask.schedule(writeJournalQueue)
}

/**
 * `acknowledgeSnapshot` différé. Une attente plus récente encore en mémoire est gardée et écrite
 * après lui. Une attente déjà dans le journal est effacée quel que soit son rang :
 * `acknowledgeSnapshot` met toujours `pending` à null, comme avant la story 20.2.
 */
export function queueJournalAck(documentId: string, snapshot: GraphSnapshot): void {
  const entry = queueFor(documentId)
  entry.ack = snapshot
  if (entry.pending && entry.pending.seq <= snapshot.ackSeq) entry.pending = null
  journalTask.schedule(writeJournalQueue)
}
