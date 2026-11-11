/**
 * Regroupe les deltas d'un flux SSE avant de toucher au store.
 *
 * Un `set` Zustand déclenche un rendu synchrone de tous ses abonnés. Par delta, le coût
 * se paie aussi souvent que le réseau livre : quand le rendu est plus lent que le flux,
 * le navigateur reçoit plusieurs messages d'un coup, les rend tous dans la même tâche et
 * ne peint plus. Le texte reste figé sur ses premiers mots jusqu'à la fin du flux.
 */

/** Une mise à jour par 80 ms : fluide à l'œil, et un rendu lent laisse la main au paint. */
export const STREAM_FLUSH_INTERVAL_MS = 80

export interface ChunkCoalescer<T> {
  push: (item: T) => void
  /** Livre tout de suite ce qui attend : à appeler avant un événement terminal. */
  flush: () => void
  /** Abandonne ce qui attend. */
  cancel: () => void
}

export function createChunkCoalescer<T>(
  onFlush: (items: T[]) => void,
  intervalMs: number = STREAM_FLUSH_INTERVAL_MS
): ChunkCoalescer<T> {
  let pending: T[] = []
  let timer: ReturnType<typeof setTimeout> | null = null

  const clearTimer = () => {
    if (timer !== null) {
      clearTimeout(timer)
      timer = null
    }
  }

  const flush = () => {
    clearTimer()
    if (pending.length === 0) return
    const items = pending
    pending = []
    onFlush(items)
  }

  return {
    push: (item) => {
      pending.push(item)
      if (timer === null) timer = setTimeout(flush, intervalMs)
    },
    flush,
    cancel: () => {
      clearTimer()
      pending = []
    },
  }
}
