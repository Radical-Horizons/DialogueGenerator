/**
 * Historique des sauvegardes GDD (snapshots `.archive/`) et cible de restauration.
 */
import { useCallback, useEffect, useState } from 'react'
import { getGddNotionArchives, type GddArchiveEntry } from '../api/gddNotionSync'

export interface UseGddNotionSyncArchivesState {
  archives: GddArchiveEntry[]
  archivesLoadError: string | null
  restoreTargetId: string | null
  setRestoreTargetId: (id: string | null) => void
  restoreBackupCurrent: boolean
  setRestoreBackupCurrent: (v: boolean) => void
  refreshArchives: () => Promise<void>
}

/**
 * @param archiveRetentionSetting Rétention configurée ; borne le nombre de snapshots demandés.
 */
export function useGddNotionSyncArchives(
  archiveRetentionSetting: number,
): UseGddNotionSyncArchivesState {
  const [archives, setArchives] = useState<GddArchiveEntry[]>([])
  const [archivesLoadError, setArchivesLoadError] = useState<string | null>(null)
  const [restoreTargetId, setRestoreTargetId] = useState<string | null>(null)
  const [restoreBackupCurrent, setRestoreBackupCurrent] = useState(true)

  const refreshArchives = useCallback(async () => {
    setArchivesLoadError(null)
    try {
      const cap = Math.max(1, archiveRetentionSetting || 10)
      const r = await getGddNotionArchives(Math.min(100, cap + 5))
      setArchives(r.archives ?? [])
    } catch (e) {
      setArchives([])
      setArchivesLoadError(
        e instanceof Error ? e.message : 'Impossible de charger l’historique des sauvegardes',
      )
    }
  }, [archiveRetentionSetting])

  useEffect(() => {
    void refreshArchives()
  }, [refreshArchives])

  return {
    archives,
    archivesLoadError,
    restoreTargetId,
    setRestoreTargetId,
    restoreBackupCurrent,
    setRestoreBackupCurrent,
    refreshArchives,
  }
}
