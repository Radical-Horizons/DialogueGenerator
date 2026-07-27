/**
 * Config serveur de la sync Notion : chargement, statut, formulaire de réglages,
 * et persistance du périmètre des bases.
 */
import { useCallback, useEffect, useState } from 'react'
import {
  getGddNotionSyncConfig,
  getGddNotionSyncStatus,
  putGddNotionSyncConfig,
  type GddNotionSyncConfigPublic,
  type GddNotionSyncStatusResponse,
} from '../api/gddNotionSync'
import {
  computeIncludedCategoriesPayloadFromSelection,
  deriveIncludedDbFilesFromConfig,
} from '../utils/gddNotionSyncPerimeter'

export interface UseGddNotionSyncConfigState {
  config: GddNotionSyncConfigPublic | null
  configLoadError: string | null
  serverStatus: GddNotionSyncStatusResponse | null
  statusLoadError: string | null
  intervalMin: number
  setIntervalMin: (v: number) => void
  autoSync: boolean
  setAutoSync: (v: boolean) => void
  tokenInput: string
  setTokenInput: (v: string) => void
  archiveRetentionSetting: number
  setArchiveRetentionSetting: (v: number) => void
  /** ``category_file`` des bases cochées ; vide = toutes (équiv. ``included_categories`` []). */
  includedDbFiles: string[]
  setIncludedDbFiles: React.Dispatch<React.SetStateAction<string[]>>
  saving: boolean
  perimeterSaving: boolean
  saveMessage: string | null
  saveError: string | null
  loadConfig: () => Promise<void>
  refreshStatus: () => Promise<void>
  handleSaveSettings: () => Promise<void>
  persistIncludedPerimeter: (files: string[]) => Promise<void>
}

/**
 * @param phase Phase de l'UI de sync ; un changement redéclenche la lecture du statut.
 * @param onSettingsSaved Appelé après un enregistrement réussi des réglages.
 */
export function useGddNotionSyncConfig(
  phase: string,
  onSettingsSaved?: () => void,
): UseGddNotionSyncConfigState {
  const [config, setConfig] = useState<GddNotionSyncConfigPublic | null>(null)
  const [configLoadError, setConfigLoadError] = useState<string | null>(null)
  const [serverStatus, setServerStatus] = useState<GddNotionSyncStatusResponse | null>(null)
  const [statusLoadError, setStatusLoadError] = useState<string | null>(null)
  const [intervalMin, setIntervalMin] = useState(60)
  const [autoSync, setAutoSync] = useState(false)
  const [tokenInput, setTokenInput] = useState('')
  const [archiveRetentionSetting, setArchiveRetentionSetting] = useState(10)
  const [includedDbFiles, setIncludedDbFiles] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [perimeterSaving, setPerimeterSaving] = useState(false)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)

  const loadConfig = useCallback(async () => {
    setConfigLoadError(null)
    try {
      const r = await getGddNotionSyncConfig()
      setConfig(r.config)
      setIntervalMin(Math.max(1, r.config.sync_interval_minutes || 60))
      setAutoSync(r.config.auto_sync_enabled)
      setIncludedDbFiles(deriveIncludedDbFilesFromConfig(r.config))
      setArchiveRetentionSetting(Math.max(1, r.config.archive_retention_count ?? 10))
      setTokenInput('')
    } catch (e) {
      setConfig(null)
      setConfigLoadError(
        e instanceof Error ? e.message : 'Impossible de charger la configuration Notion sync',
      )
    }
  }, [])

  const refreshStatus = useCallback(async () => {
    setStatusLoadError(null)
    try {
      const s = await getGddNotionSyncStatus()
      setServerStatus(s)
    } catch (e) {
      setServerStatus(null)
      setStatusLoadError(
        e instanceof Error ? e.message : 'Impossible de charger le statut de synchronisation',
      )
    }
  }, [])

  useEffect(() => {
    void loadConfig()
  }, [loadConfig])

  useEffect(() => {
    void refreshStatus()
  }, [refreshStatus, phase])

  const persistIncludedPerimeter = useCallback(
    async (files: string[]) => {
      if (!config) {
        return
      }
      const payload = computeIncludedCategoriesPayloadFromSelection(config.sources ?? [], files)
      setPerimeterSaving(true)
      setSaveError(null)
      try {
        const r = await putGddNotionSyncConfig({ included_categories: payload })
        setConfig(r.config)
        setIncludedDbFiles(deriveIncludedDbFilesFromConfig(r.config))
        setSaveMessage('Périmètre des bases enregistré.')
      } catch (e) {
        const text = e instanceof Error ? e.message : 'Échec enregistrement du périmètre'
        setSaveError(text)
      } finally {
        setPerimeterSaving(false)
      }
    },
    [config],
  )

  const handleSaveSettings = useCallback(async () => {
    setSaveError(null)
    setSaveMessage(null)
    setSaving(true)
    try {
      const includedPayload = computeIncludedCategoriesPayloadFromSelection(
        config?.sources ?? [],
        includedDbFiles,
      )
      const body: Parameters<typeof putGddNotionSyncConfig>[0] = {
        sync_interval_minutes: Math.max(1, Math.floor(Number(intervalMin)) || 60),
        auto_sync_enabled: autoSync,
        included_categories: includedPayload,
        archive_retention_count: Math.max(1, Math.floor(Number(archiveRetentionSetting)) || 10),
      }
      if (tokenInput.trim()) {
        body.notion_token = tokenInput.trim()
      }
      const r = await putGddNotionSyncConfig(body)
      setConfig(r.config)
      setIncludedDbFiles(deriveIncludedDbFilesFromConfig(r.config))
      setTokenInput('')
      setSaveMessage('Réglages sauvegardés sur le serveur.')
      onSettingsSaved?.()
    } catch (e) {
      const text = e instanceof Error ? e.message : 'Échec de l’enregistrement'
      setSaveError(text)
    } finally {
      setSaving(false)
    }
  }, [
    config?.sources,
    includedDbFiles,
    intervalMin,
    autoSync,
    archiveRetentionSetting,
    tokenInput,
    onSettingsSaved,
  ])

  return {
    config,
    configLoadError,
    serverStatus,
    statusLoadError,
    intervalMin,
    setIntervalMin,
    autoSync,
    setAutoSync,
    tokenInput,
    setTokenInput,
    archiveRetentionSetting,
    setArchiveRetentionSetting,
    includedDbFiles,
    setIncludedDbFiles,
    saving,
    perimeterSaving,
    saveMessage,
    saveError,
    loadConfig,
    refreshStatus,
    handleSaveSettings,
    persistIncludedPerimeter,
  }
}
