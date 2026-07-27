/**
 * Déclenchement d'un run de sync GDD et suivi de sa progression.
 */
import { useCallback, useEffect, useState } from 'react'
import {
  getGddNotionSyncProgress,
  postGddNotionSync,
  type GddNotionSyncProgressResponse,
  type PostGddNotionSyncOptions,
} from '../api/gddNotionSync'
import { useContextStore } from '../store/contextStore'
import type { GddNotionSyncUiRunResult } from './useGddNotionSyncUi'

/** Intervalle de sondage de la progression serveur pendant un run, en ms. */
const SYNC_PROGRESS_POLL_MS = 400
/** Cadence de rafraîchissement du compteur de temps écoulé affiché, en ms. */
const SYNC_ELAPSED_TICK_MS = 250

/** Listes contexte + cache scène : recharger après changement des fichiers GDD sur disque. */
export function refreshContextAfterGddDiskChange(): void {
  const st = useContextStore.getState()
  st.invalidateCache()
  st.bumpGddDataRevision()
}

export interface UseGddNotionSyncRunParams {
  run: (fn: () => Promise<GddNotionSyncUiRunResult>) => Promise<void>
  refreshStatus: () => Promise<void>
  refreshArchives: () => Promise<void>
  refreshCheckpoint: () => Promise<void>
  runIncludedCategories: () => string[] | undefined
  onCheckpointDiskChanged?: () => void
}

export interface UseGddNotionSyncRunState {
  progressOpen: boolean
  progressSnapshot: GddNotionSyncProgressResponse | null
  syncModeFull: boolean
  elapsedSec: number
  runGddSync: (full: boolean, syncOpts?: PostGddNotionSyncOptions) => void
}

export function useGddNotionSyncRun({
  run,
  refreshStatus,
  refreshArchives,
  refreshCheckpoint,
  runIncludedCategories,
  onCheckpointDiskChanged,
}: UseGddNotionSyncRunParams): UseGddNotionSyncRunState {
  const [progressOpen, setProgressOpen] = useState(false)
  const [progressSnapshot, setProgressSnapshot] = useState<GddNotionSyncProgressResponse | null>(
    null,
  )
  const [syncStartedAt, setSyncStartedAt] = useState<number | null>(null)
  const [syncModeFull, setSyncModeFull] = useState(false)
  const [elapsedTick, setElapsedTick] = useState(0)

  useEffect(() => {
    if (!progressOpen) {
      return
    }
    const t = window.setInterval(() => {
      setElapsedTick((n) => n + 1)
    }, SYNC_ELAPSED_TICK_MS)
    return () => window.clearInterval(t)
  }, [progressOpen])

  const elapsedSec =
    progressOpen && syncStartedAt !== null ? (Date.now() - syncStartedAt) / 1000 : 0
  void elapsedTick

  const runGddSync = useCallback(
    (full: boolean, syncOpts?: PostGddNotionSyncOptions) => {
      setSyncModeFull(full)
      setProgressOpen(true)
      setProgressSnapshot(null)
      setSyncStartedAt(Date.now())
      void run(async () => {
        const poll = window.setInterval(async () => {
          try {
            const prog = await getGddNotionSyncProgress()
            setProgressSnapshot(prog)
          } catch {
            /* polling best-effort */
          }
        }, SYNC_PROGRESS_POLL_MS)
        try {
          const r = await postGddNotionSync(full, {
            ...syncOpts,
            includedCategories: runIncludedCategories(),
          })
          await refreshStatus()
          if (full) {
            await refreshArchives()
          }
          await refreshCheckpoint()
          onCheckpointDiskChanged?.()
          if (r.success) {
            refreshContextAfterGddDiskChange()
          }
          return {
            success: r.success,
            message: r.message,
            softFailure: !r.success && Boolean(r.mirror_promotion_pending),
          }
        } finally {
          window.clearInterval(poll)
          setProgressOpen(false)
          setSyncStartedAt(null)
          setProgressSnapshot(null)
        }
      })
    },
    [
      run,
      refreshStatus,
      refreshArchives,
      refreshCheckpoint,
      onCheckpointDiskChanged,
      runIncludedCategories,
    ],
  )

  return { progressOpen, progressSnapshot, syncModeFull, elapsedSec, runGddSync }
}
