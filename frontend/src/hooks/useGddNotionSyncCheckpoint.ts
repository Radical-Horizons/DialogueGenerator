/**
 * Checkpoint de sync complète GDD : lecture de l'état serveur et bannière d'erreur.
 */
import { useCallback, useEffect, useState } from 'react'
import {
  getGddFullSyncCheckpoint,
  type GddFullSyncCheckpointResponse,
} from '../api/gddNotionSync'

export interface UseGddNotionSyncCheckpointState {
  checkpoint: GddFullSyncCheckpointResponse | null
  checkpointBannerError: string | null
  /** Exposé pour les actions du panneau (pause, reprise, annulation, abandon). */
  setCheckpointBannerError: (message: string | null) => void
  refreshCheckpoint: () => Promise<void>
}

export function useGddNotionSyncCheckpoint(): UseGddNotionSyncCheckpointState {
  const [checkpoint, setCheckpoint] = useState<GddFullSyncCheckpointResponse | null>(null)
  const [checkpointBannerError, setCheckpointBannerError] = useState<string | null>(null)

  const refreshCheckpoint = useCallback(async () => {
    setCheckpointBannerError(null)
    try {
      const c = await getGddFullSyncCheckpoint()
      setCheckpoint(c)
    } catch (e) {
      setCheckpoint(null)
      setCheckpointBannerError(
        e instanceof Error ? e.message : 'Impossible de lire le checkpoint de sync complète',
      )
    }
  }, [])

  useEffect(() => {
    void refreshCheckpoint()
  }, [refreshCheckpoint])

  return {
    checkpoint,
    checkpointBannerError,
    setCheckpointBannerError,
    refreshCheckpoint,
  }
}
