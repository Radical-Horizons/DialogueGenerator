/**
 * Panneau sync des catégories GDD depuis Notion (FR18).
 */
import type { CSSProperties } from 'react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  deleteGddFullSyncCheckpoint,
  getGddFullSyncCheckpoint,
  getGddNotebooklmExportZip,
  getGddNotionArchives,
  getGddNotionSyncConfig,
  getGddNotionSyncProgress,
  getGddNotionSyncStatus,
  postGddFullSyncCancel,
  postGddFullSyncPause,
  postGddFullSyncUnpause,
  postGddNotionArchiveRestore,
  postGddNotionPreviewDatabaseRow,
  postGddNotionSync,
  postGddNotionTestConnection,
  putGddNotionSyncConfig,
  type GddArchiveEntry,
  type GddFullSyncCheckpointResponse,
  type GddNotionPreviewDatabaseResponse,
  type GddNotionSyncConfigPublic,
  type GddNotionSyncProgressResponse,
  type GddNotionSyncStatusResponse,
  type PostGddNotionSyncOptions,
} from '../../api/gddNotionSync'
import { GddNotionSyncProgressModal } from './GddNotionSyncProgressModal'
import { useGddNotionSyncUi, type GddNotionSyncOutcomeTone } from '../../hooks/useGddNotionSyncUi'
import { useContextStore } from '../../store/contextStore'
import { theme } from '../../theme'
import {
  GDD_NOTION_SYNC_SECONDARY_DATABASE_FILES,
  isGddNotionSyncSecondaryDatabase,
} from '../../constants/gddNotionSyncSecondaryDatabases'

function categoryFileMatchesIncluded(categoryFile: string, includedCategories: string[]): boolean {
  const normalized = new Set(
    includedCategories.map((x) => x.trim().toLowerCase()).filter(Boolean),
  )
  if (normalized.size === 0) {
    return true
  }
  const raw = (categoryFile || '').trim().toLowerCase()
  const stem = raw.endsWith('.json') ? raw.slice(0, -5) : raw
  for (const f of normalized) {
    if (f === raw || f === stem) {
      return true
    }
  }
  return false
}

function deriveIncludedDbFilesFromConfig(c: GddNotionSyncConfigPublic): string[] {
  const inc = c.included_categories || []
  const dbs = (c.sources || []).filter((s) => s.kind === 'database')
  if (inc.length === 0) {
    return dbs.map((s) => s.category_file)
  }
  return dbs
    .filter((s) => categoryFileMatchesIncluded(s.category_file, inc))
    .map((s) => s.category_file)
}

/** Listes contexte + cache scène : recharger après changement des fichiers GDD sur disque. */
function refreshContextAfterGddDiskChange(): void {
  const st = useContextStore.getState()
  st.invalidateCache()
  st.bumpGddDataRevision()
}

function gddSyncOutcomeBannerPalette(tone: GddNotionSyncOutcomeTone): {
  border: string
  background: string
  accent: string
  title: string
} {
  if (tone === 'error') {
    return {
      border: theme.state.error.border,
      background: theme.state.error.background,
      accent: theme.state.error.color,
      title: 'Synchronisation échouée',
    }
  }
  if (tone === 'warning') {
    return {
      border: theme.state.warning.border ?? '#ffc107',
      background: theme.state.warning.background,
      accent: theme.state.warning.color,
      title: 'Synchronisation terminée — action requise',
    }
  }
  return {
    border: theme.state.success.color,
    background: theme.state.success.background,
    accent: theme.state.success.color,
    title: 'Synchronisation réussie',
  }
}

export interface GddNotionSyncSectionProps {
  /** Après mise à jour locale du checkpoint (sync / abandon), rafraîchir l’UI parent (ex. onglet Options). */
  onCheckpointDiskChanged?: () => void
}

export function GddNotionSyncSection({ onCheckpointDiskChanged }: GddNotionSyncSectionProps) {
  const { phase, userMessage, outcomeTone, run, resetMessage } = useGddNotionSyncUi()
  const [serverStatus, setServerStatus] = useState<GddNotionSyncStatusResponse | null>(null)
  const [statusLoadError, setStatusLoadError] = useState<string | null>(null)

  const [config, setConfig] = useState<GddNotionSyncConfigPublic | null>(null)
  const [configLoadError, setConfigLoadError] = useState<string | null>(null)
  const [intervalMin, setIntervalMin] = useState(60)
  const [autoSync, setAutoSync] = useState(false)
  /** Noms ``category_file`` des bases cochées ; vide = toutes les bases (équiv. ``included_categories`` []). */
  const [includedDbFiles, setIncludedDbFiles] = useState<string[]>([])
  const [tokenInput, setTokenInput] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)

  const [progressOpen, setProgressOpen] = useState(false)
  const [progressSnapshot, setProgressSnapshot] = useState<GddNotionSyncProgressResponse | null>(null)
  const [syncStartedAt, setSyncStartedAt] = useState<number | null>(null)
  const [syncModeFull, setSyncModeFull] = useState(false)
  const [archiveRetentionSetting, setArchiveRetentionSetting] = useState(10)
  const [elapsedTick, setElapsedTick] = useState(0)

  const [archives, setArchives] = useState<GddArchiveEntry[]>([])
  const [archivesLoadError, setArchivesLoadError] = useState<string | null>(null)
  const [restoreTargetId, setRestoreTargetId] = useState<string | null>(null)
  const [restoreBackupCurrent, setRestoreBackupCurrent] = useState(true)
  const [checkpoint, setCheckpoint] = useState<GddFullSyncCheckpointResponse | null>(null)
  const [checkpointBannerError, setCheckpointBannerError] = useState<string | null>(null)

  const [previewOpen, setPreviewOpen] = useState(false)
  const [previewForFile, setPreviewForFile] = useState<string | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [previewData, setPreviewData] = useState<GddNotionPreviewDatabaseResponse | null>(null)

  const [notebooklmExporting, setNotebooklmExporting] = useState(false)
  const [notebooklmExportError, setNotebooklmExportError] = useState<string | null>(null)

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

  useEffect(() => {
    void loadConfig()
  }, [loadConfig])

  useEffect(() => {
    void refreshCheckpoint()
  }, [refreshCheckpoint])

  useEffect(() => {
    void refreshStatus()
  }, [refreshStatus, phase])

  useEffect(() => {
    void refreshArchives()
  }, [refreshArchives])

  useEffect(() => {
    if (!progressOpen) {
      return
    }
    const t = window.setInterval(() => {
      setElapsedTick((n) => n + 1)
    }, 250)
    return () => window.clearInterval(t)
  }, [progressOpen])

  const busy = phase === 'loading'
  const elapsedSec =
    progressOpen && syncStartedAt !== null ? (Date.now() - syncStartedAt) / 1000 : 0
  void elapsedTick

  const sources = useMemo(() => config?.sources ?? [], [config])
  const databaseSources = useMemo(
    () =>
      [...sources.filter((s) => s.kind === 'database')].sort((a, b) =>
        a.category_file.localeCompare(b.category_file, 'fr', { sensitivity: 'base' }),
      ),
    [sources],
  )

  const toggleDbInclusion = useCallback((categoryFile: string, checked: boolean) => {
    setIncludedDbFiles((prev) => {
      if (checked) {
        return prev.includes(categoryFile) ? prev : [...prev, categoryFile]
      }
      return prev.filter((f) => f !== categoryFile)
    })
  }, [])

  const checkAllDatabaseSources = useCallback(() => {
    setIncludedDbFiles(databaseSources.map((s) => s.category_file))
  }, [databaseSources])

  const uncheckAllDatabaseSources = useCallback(() => {
    setIncludedDbFiles([])
  }, [])

  /** Bases listées comme secondaires dans le dépôt : non cochées par ce raccourci. */
  const checkEssentialDatabaseSources = useCallback(() => {
    const secondary = new Set(GDD_NOTION_SYNC_SECONDARY_DATABASE_FILES)
    setIncludedDbFiles(
      databaseSources.map((s) => s.category_file).filter((f) => !secondary.has(f)),
    )
  }, [databaseSources])

  const computeIncludedCategoriesPayload = useCallback((): string[] => {
    const dbs = (config?.sources ?? []).filter((s) => s.kind === 'database')
    const allDbFiles = dbs.map((s) => s.category_file).sort()
    const sortedSel = [...includedDbFiles].sort()
    const allSelected =
      dbs.length > 0 &&
      sortedSel.length === allDbFiles.length &&
      sortedSel.every((f, i) => f === allDbFiles[i])
    if (dbs.length === 0 || sortedSel.length === 0 || allSelected) {
      return []
    }
    return sortedSel
  }, [config?.sources, includedDbFiles])

  const runPreviewOneRow = useCallback(
    async (categoryFile: string) => {
      setPreviewForFile(categoryFile)
      setPreviewOpen(true)
      setPreviewLoading(true)
      setPreviewError(null)
      setPreviewData(null)
      try {
        const r = await postGddNotionPreviewDatabaseRow(categoryFile)
        setPreviewData(r)
        if (!r.ok) {
          setPreviewError(r.message || 'Échec du test')
        }
      } catch (e) {
        setPreviewError(e instanceof Error ? e.message : 'Requête échouée')
      } finally {
        setPreviewLoading(false)
      }
    },
    [],
  )

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
        }, 400)
        try {
          if (config) {
            const includedPayload = computeIncludedCategoriesPayload()
            const rCfg = await putGddNotionSyncConfig({ included_categories: includedPayload })
            setConfig(rCfg.config)
            setIncludedDbFiles(deriveIncludedDbFilesFromConfig(rCfg.config))
          }
          const r = await postGddNotionSync(full, syncOpts)
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
      config,
      computeIncludedCategoriesPayload,
    ],
  )

  const handleSaveSettings = async () => {
    setSaveError(null)
    setSaveMessage(null)
    setSaving(true)
    try {
      const includedPayload = computeIncludedCategoriesPayload()
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
      void refreshArchives()
    } catch (e) {
      const text = e instanceof Error ? e.message : 'Échec de l’enregistrement'
      setSaveError(text)
    } finally {
      setSaving(false)
    }
  }

  const dbCount = databaseSources.length
  const pageCount = sources.filter((s) => s.kind === 'page').length

  const handleNotebooklmExport = useCallback(async () => {
    setNotebooklmExportError(null)
    setNotebooklmExporting(true)
    try {
      const blob = await getGddNotebooklmExportZip()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      const d = new Date().toISOString().slice(0, 10)
      a.download = `gdd-notebooklm-export-${d}.zip`
      a.rel = 'noopener'
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch (e) {
      setNotebooklmExportError(
        e instanceof Error ? e.message : 'Échec du téléchargement de l’export NotebookLM',
      )
    } finally {
      setNotebooklmExporting(false)
    }
  }, [])

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '1.25rem',
      }}
    >
      <div
        style={{
          padding: '1rem',
          border: `1px solid ${theme.border.primary}`,
          borderRadius: '8px',
          backgroundColor: theme.background.secondary,
        }}
      >
        <h3 style={{ margin: '0 0 0.75rem 0', color: theme.text.primary }}>
          Synchronisation GDD (Notion)
        </h3>
        {(() => {
          if (!userMessage || phase === 'loading' || !outcomeTone) {
            return null
          }
          const pal = gddSyncOutcomeBannerPalette(outcomeTone)
          return (
            <div
              role="status"
              aria-live="polite"
              style={{
                margin: '0 0 1rem 0',
                padding: '1rem 1rem 0.9rem',
                borderRadius: '8px',
                border: `2px solid ${pal.border}`,
                backgroundColor: pal.background,
                boxShadow: theme.shadow.card,
              }}
            >
              <div
                style={{
                  color: theme.text.primary,
                  fontWeight: 700,
                  fontSize: '1rem',
                  marginBottom: '0.5rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                }}
              >
                <span aria-hidden style={{ color: pal.accent, fontSize: '1.15rem' }}>
                  {outcomeTone === 'error' ? '✕' : outcomeTone === 'warning' ? '!' : '✓'}
                </span>
                {pal.title}
              </div>
              <p
                style={{
                  margin: '0 0 1rem 0',
                  color: theme.text.primary,
                  fontSize: '0.92rem',
                  lineHeight: 1.5,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                }}
              >
                {userMessage}
              </p>
              <button
                type="button"
                onClick={resetMessage}
                style={{
                  padding: '0.55rem 1.25rem',
                  borderRadius: '6px',
                  border: `1px solid ${theme.button.primary.background}`,
                  backgroundColor: theme.button.primary.background,
                  color: theme.button.primary.color,
                  cursor: 'pointer',
                  fontWeight: 600,
                  fontSize: '0.9rem',
                }}
              >
                Fermer ce message
              </button>
            </div>
          )
        })()}
        <p
          style={{
            margin: '0 0 1rem 0',
            color: theme.text.secondary,
            fontSize: '0.9rem',
          }}
        >
          Met à jour les fichiers JSON sous <code style={{ fontSize: '0.85em' }}>data/GDD_categories/</code>{' '}
          selon <code style={{ fontSize: '0.85em' }}>settings.json</code>. Le token n&apos;est jamais
          renvoyé par l&apos;API.
        </p>
        <p
          style={{
            margin: '0 0 1rem 0',
            color: theme.text.secondary,
            fontSize: '0.88rem',
            lineHeight: 1.45,
          }}
        >
          <strong style={{ color: theme.text.primary }}>Sync complète</strong> interrompue (onglet fermé,
          navigateur quitté, erreur réseau) : rouvrez <strong style={{ color: theme.text.primary }}>Options</strong>{' '}
          → onglet <strong style={{ color: theme.text.primary }}>Notion</strong>, puis{' '}
          <strong style={{ color: theme.text.primary }}>Reprendre la sync</strong> — le serveur conserve le
          checkpoint et le staging tant que vous n&apos;annulez pas.
        </p>

        <div
          style={{
            marginBottom: '1rem',
            padding: '0.75rem',
            borderRadius: '6px',
            border: `1px solid ${theme.border.primary}`,
            backgroundColor: theme.background.panel,
          }}
        >
          <p style={{ margin: '0 0 0.5rem 0', color: theme.text.primary, fontWeight: 'bold' }}>
            Export NotebookLM (présentations)
          </p>
          <p
            style={{
              margin: '0 0 0.75rem 0',
              color: theme.text.secondary,
              fontSize: '0.88rem',
              lineHeight: 1.45,
            }}
          >
            Télécharge un ZIP Markdown : le GDD local (bases/pages du périmètre Notion ci-dessous, comme une
            sync) regroupé par thèmes, plus <code style={{ fontSize: '0.85em' }}>Vision.json</code> en tête du
            volet univers. Chaque thème reste sous une limite de taille NotebookLM : les gros regroupements sont
            découpés en plusieurs fichiers (<code style={{ fontSize: '0.85em' }}>-part02.md</code>, etc.) sans
            tronquer le texte.
          </p>
          <button
            type="button"
            onClick={() => void handleNotebooklmExport()}
            disabled={notebooklmExporting || busy || !config || sources.length === 0}
            style={{
              padding: '0.5rem 1rem',
              borderRadius: '6px',
              border: `1px solid ${theme.border.primary}`,
              backgroundColor: theme.background.secondary,
              color: theme.text.primary,
              cursor:
                notebooklmExporting || busy || !config || sources.length === 0 ? 'not-allowed' : 'pointer',
              opacity: notebooklmExporting || busy || !config || sources.length === 0 ? 0.6 : 1,
            }}
          >
            {notebooklmExporting ? 'Préparation du ZIP…' : 'Télécharger export NotebookLM (.zip)'}
          </button>
          {notebooklmExportError && (
            <p style={{ margin: '0.5rem 0 0 0', color: theme.state.error.color, fontSize: '0.88rem' }}>
              {notebooklmExportError}
            </p>
          )}
        </div>

        {configLoadError && (
          <p style={{ color: theme.state.error.color, fontSize: '0.9rem', margin: '0 0 1rem 0' }}>
            {configLoadError}
          </p>
        )}

        {config && (
          <div
            style={{
              marginBottom: '1rem',
              padding: '0.75rem',
              borderRadius: '6px',
              backgroundColor: theme.background.panel,
              border: `1px solid ${theme.border.primary}`,
            }}
          >
            <p style={{ margin: '0 0 0.5rem 0', color: theme.text.primary, fontWeight: 'bold' }}>
              Résumé configuration
            </p>
            <ul
              style={{
                margin: 0,
                paddingLeft: '1.25rem',
                color: theme.text.secondary,
                fontSize: '0.88rem',
                lineHeight: 1.5,
              }}
            >
              <li>Schéma : {config.schema_version}</li>
              <li>
                Token Notion :{' '}
                <strong style={{ color: theme.text.primary }}>
                  {config.token_configured ? 'configuré' : 'non configuré'}
                </strong>{' '}
                (.env ou fichier côté serveur)
              </li>
              <li>
                Sources : <strong style={{ color: theme.text.primary }}>{sources.length}</strong> au total
                ({dbCount} base{dbCount !== 1 ? 's' : ''}, {pageCount} page{pageCount !== 1 ? 's' : ''})
              </li>
              <li>
                Filtre bases (Notion) :{' '}
                {config.included_categories?.length
                  ? `${config.included_categories.length} base(s) — sur chaque sync, seules ces bases (pas les fiches page)`
                  : 'aucun — toutes les bases et toutes les fiches (pages) sont synchronisées'}
              </li>
            </ul>
            {sources.length > 0 && (
              <details style={{ marginTop: '0.75rem' }}>
                <summary
                  style={{
                    cursor: 'pointer',
                    color: theme.text.primary,
                    fontSize: '0.88rem',
                  }}
                >
                  Liste des sources ({sources.length})
                </summary>
                <div
                  style={{
                    marginTop: '0.5rem',
                    maxHeight: '220px',
                    overflow: 'auto',
                    fontSize: '0.8rem',
                    fontFamily: 'monospace',
                    color: theme.text.secondary,
                  }}
                >
                  {sources.map((s, idx) => (
                    <div key={`${idx}-${s.kind}-${s.notion_id}`} style={{ marginBottom: '0.25rem' }}>
                      [{s.kind}] {s.category_file} · {s.notion_id}
                    </div>
                  ))}
                </div>
              </details>
            )}
          </div>
        )}

        <div
          style={{
            marginBottom: '1rem',
            padding: '0.75rem',
            borderRadius: '6px',
            backgroundColor: theme.background.panel,
            border: `1px solid ${theme.border.primary}`,
          }}
        >
          <p style={{ margin: '0 0 0.75rem 0', color: theme.text.primary, fontWeight: 'bold' }}>
            Paramètres
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <label style={labelStyle}>
              <span>Intervalle auto-sync (minutes)</span>
              <input
                type="number"
                min={1}
                disabled={!config || saving || busy}
                value={intervalMin}
                onChange={(e) => setIntervalMin(Number(e.target.value))}
                style={inputStyle}
              />
            </label>
            <label style={{ ...labelStyle, flexDirection: 'row', alignItems: 'center', gap: '0.5rem' }}>
              <input
                type="checkbox"
                disabled={!config || saving || busy}
                checked={autoSync}
                onChange={(e) => setAutoSync(e.target.checked)}
              />
              <span>Activer la synchronisation automatique (côté serveur)</span>
            </label>
            <label style={labelStyle}>
              <span>Conserver les N dernières sauvegardes automatiques (dossiers sous .archive/)</span>
              <input
                type="number"
                min={1}
                disabled={!config || saving || busy}
                value={archiveRetentionSetting}
                onChange={(e) => setArchiveRetentionSetting(Number(e.target.value))}
                style={inputStyle}
              />
            </label>
            <div style={labelStyle}>
              <span>Bases de données à synchroniser</span>
              <p
                style={{
                  margin: 0,
                  fontSize: '0.82rem',
                  lineHeight: 1.45,
                  color: theme.text.secondary,
                }}
              >
                Cochez les bases Notion à inclure. <strong style={{ color: theme.text.primary }}>Aucune case</strong>{' '}
                ou <strong style={{ color: theme.text.primary }}>toutes les cases</strong> cochées = pas de filtre
                (toutes les bases + toutes les fiches page). Si vous restreignez les bases, chaque sync ne traite{' '}
                <strong style={{ color: theme.text.primary }}>que</strong> ces bases — les fiches (sources page) sont
                alors ignorées sur ce run (évite de parcourir tout le hub). Retirez le filtre pour tout resynchroniser.
                <br />
                <strong style={{ color: theme.text.primary }}>Cocher essentiels</strong> : coche toutes les bases sauf
                celles marquées « secondaire » (liste dans le dépôt, ex. assets, prompts,{' '}
                <code style={{ fontSize: '0.85em' }}>Caractéristiques_—_Uresaïr_(FP).json</code>) — ce n’est pas un
                périmètre « jeu minimal », seulement un raccourci pour décocher les tables plutôt outil / hors cœur
                narratif.
                <br />
                <strong style={{ color: theme.text.primary }}>Sync complète (bouton global) avec filtre :</strong> les
                fichiers (ou dossiers shards) des bases <em>non</em> cochées sont <strong>retirés</strong> du dossier GDD
                local après promotion du miroir (les fiches page déjà sur disque ne sont pas effacées). Utilisez le
                bouton <strong>Sync cette base</strong> sur une ligne pour une sync complète <em>uniquement</em> sur cette
                base sans toucher aux autres.
                <br />
                <strong style={{ color: theme.text.primary }}>Sync normale ou complète :</strong> les cases sont
                enregistrées automatiquement sur le serveur au lancement (inutile de cliquer « Enregistrer » avant).
              </p>
              {databaseSources.length === 0 ? (
                <p style={{ margin: 0, fontSize: '0.85rem', color: theme.text.secondary }}>
                  Aucune source <code style={{ fontSize: '0.85em' }}>database</code> dans la configuration.
                </p>
              ) : (
                <>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.35rem' }}>
                    <button
                      type="button"
                      disabled={!config || saving || busy}
                      onClick={checkAllDatabaseSources}
                      style={buttonStyle(saving || busy)}
                    >
                      Tout cocher
                    </button>
                    <button
                      type="button"
                      disabled={!config || saving || busy}
                      onClick={uncheckAllDatabaseSources}
                      style={buttonStyle(saving || busy)}
                    >
                      Tout décocher
                    </button>
                    <button
                      type="button"
                      disabled={!config || saving || busy}
                      onClick={checkEssentialDatabaseSources}
                      style={buttonStyle(saving || busy)}
                      title="Coche toutes les bases sauf la liste « secondaires » du dépôt (voir constante gddNotionSyncSecondaryDatabases)"
                    >
                      Cocher essentiels
                    </button>
                  </div>
                  <div
                    role="group"
                    aria-label="Bases de données Notion à inclure dans la synchronisation"
                    style={{
                      maxHeight: '220px',
                      overflowY: 'auto',
                      padding: '0.5rem',
                      borderRadius: '6px',
                      border: `1px solid ${theme.border.primary}`,
                      backgroundColor: theme.background.secondary,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.35rem',
                    }}
                  >
                    {databaseSources.map((s) => {
                      const checked = includedDbFiles.includes(s.category_file)
                      const id = `gdd-sync-db-${s.notion_id}-${s.category_file}`
                      return (
                        <div
                          key={`${s.notion_id}:${s.category_file}`}
                          style={{
                            display: 'flex',
                            flexWrap: 'wrap',
                            alignItems: 'flex-start',
                            gap: '0.35rem 0.5rem',
                            justifyContent: 'space-between',
                          }}
                        >
                          <label
                            htmlFor={id}
                            style={{
                              display: 'flex',
                              alignItems: 'flex-start',
                              gap: '0.5rem',
                              cursor: !config || saving || busy ? 'not-allowed' : 'pointer',
                              fontSize: '0.86rem',
                              color: theme.text.primary,
                              flex: '1 1 200px',
                              minWidth: 0,
                            }}
                          >
                            <input
                              id={id}
                              type="checkbox"
                              disabled={!config || saving || busy}
                              checked={checked}
                              onChange={(e) => toggleDbInclusion(s.category_file, e.target.checked)}
                            />
                            <span style={{ wordBreak: 'break-word' }}>
                              <span style={{ fontWeight: 600 }}>{s.category_file}</span>
                              {isGddNotionSyncSecondaryDatabase(s.category_file) ? (
                                <span style={{ color: theme.text.secondary, fontSize: '0.78rem' }}>
                                  {' '}
                                  (secondaire)
                                </span>
                              ) : null}
                              <span style={{ color: theme.text.secondary, fontSize: '0.8rem' }}>
                                {' '}
                                · {s.notion_id}
                              </span>
                            </span>
                          </label>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                            <button
                              type="button"
                              disabled={!config || saving || busy || previewLoading}
                              onClick={() => void runPreviewOneRow(s.category_file)}
                              style={buttonStyle(saving || busy || previewLoading)}
                              title="Récupère la première ligne Notion et le JSON mappé (comme la sync)"
                            >
                              Tester 1 ligne
                            </button>
                            <button
                              type="button"
                              disabled={!config || saving || busy}
                              onClick={() => runGddSync(true, { categoryFiles: [s.category_file] })}
                              style={buttonStyle(saving || busy)}
                              title="Sync complète miroir pour cette base seule ; n’efface pas les autres bases du disque"
                            >
                              Sync cette base
                            </button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </>
              )}
            </div>
            <label style={labelStyle}>
              <span>Nouveau token Notion (laisser vide pour ne pas changer)</span>
              <input
                type="password"
                autoComplete="off"
                disabled={!config || saving || busy}
                value={tokenInput}
                onChange={(e) => setTokenInput(e.target.value)}
                placeholder="secret…"
                style={inputStyle}
              />
            </label>
            <p
              style={{
                margin: 0,
                fontSize: '0.8rem',
                color: theme.text.secondary,
                lineHeight: 1.45,
              }}
            >
              <strong style={{ color: theme.text.primary }}>Sauver sans sync</strong> : écrit sur le serveur
              l’intervalle, l’auto-sync, la rétention <code style={{ fontSize: '0.85em' }}>.archive/</code>, le token
              ci-dessus et les cases des bases — <strong style={{ color: theme.text.primary }}>sans</strong>{' '}
              lancer de synchronisation. Une sync enregistre déjà les cases automatiquement.
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center' }}>
              <button
                type="button"
                disabled={!config || saving || busy}
                onClick={() => void handleSaveSettings()}
                style={buttonStyle(saving || busy, true)}
              >
                {saving ? 'Sauvegarde…' : 'Sauver sans sync'}
              </button>
              <button
                type="button"
                disabled={!config || saving || busy}
                onClick={() => void loadConfig()}
                style={buttonStyle(saving || busy)}
              >
                Recharger la config
              </button>
              {saveMessage && (
                <span style={{ color: theme.state.success.color, fontSize: '0.88rem' }}>
                  {saveMessage}
                </span>
              )}
            </div>
            {saveError && (
              <p style={{ color: theme.state.error.color, fontSize: '0.85rem', margin: 0 }}>{saveError}</p>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.35rem', alignItems: 'flex-start' }}>
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              run(async () => {
                const r = await postGddNotionTestConnection()
                return { ok: r.ok, message: r.message }
              })
            }
            style={buttonStyle(busy)}
          >
            {busy ? '…' : 'Tester la connexion'}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => runGddSync(false)}
            style={buttonStyle(busy, true)}
          >
            {busy ? 'Synchronisation…' : 'Synchroniser (incrémental)'}
          </button>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.4rem' }}>
              <button
                type="button"
                disabled={busy}
                onClick={() => runGddSync(true)}
                style={buttonStyle(busy)}
                title={
                  checkpoint?.resumable
                    ? 'Démarre une nouvelle sync complète (archive + staging neufs). L’ancien checkpoint est abandonné.'
                    : 'Lance une sync complète avec archive puis miroir Notion → disque.'
                }
              >
                {busy ? '…' : 'Sync complète'}
              </button>
              {checkpoint?.resumable ? (
                <span
                  style={{
                    fontSize: '0.7rem',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                    padding: '0.2rem 0.5rem',
                    borderRadius: '4px',
                    backgroundColor: theme.border.focus,
                    color: theme.background.panel,
                    whiteSpace: 'nowrap',
                  }}
                  title="Une sync complète est en cours côté serveur (staging). Utilisez Reprendre ci-dessous."
                >
                  Incomplet {checkpoint.sources_completed}/{checkpoint.sources_total}
                </span>
              ) : null}
              {checkpoint &&
              !checkpoint.resumable &&
              (checkpoint.checkpoint_status === 'stale' || checkpoint.checkpoint_status === 'invalid_file') ? (
                <span
                  style={{
                    fontSize: '0.72rem',
                    fontWeight: 600,
                    color: theme.state.error.color,
                    whiteSpace: 'nowrap',
                  }}
                >
                  Checkpoint expiré
                </span>
              ) : null}
            </div>
          </div>
        </div>
        <p
          style={{
            margin: '0 0 0.65rem 0',
            fontSize: '0.78rem',
            color: theme.text.secondary,
            lineHeight: 1.4,
          }}
        >
          <strong style={{ color: theme.text.primary }}>Reprendre la sync</strong> reprend une sync complète
          en cours sur le serveur (même après fermeture du site ou de l’application).{' '}
          <strong style={{ color: theme.text.primary }}>Sync complète</strong> sans reprise démarre un nouveau
          run et abandonne l’ancien checkpoint. L’annulation <em>pendant</em> la sync supprime le checkpoint.
        </p>

        <div
          style={{
            marginBottom: '1rem',
            padding: '0.65rem 0.75rem',
            borderRadius: '6px',
            backgroundColor: theme.background.panel,
            border: `1px solid ${
              checkpoint?.resumable ? theme.border.focus : theme.border.primary
            }`,
          }}
        >
          <p
            style={{
              margin: '0 0 0.35rem 0',
              color: theme.text.secondary,
              fontSize: '0.72rem',
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
            }}
          >
            État reprise (sync complète)
          </p>
          {checkpointBannerError ? (
            <p style={{ margin: '0 0 0.5rem 0', color: theme.state.error.color, fontSize: '0.88rem' }}>
              {checkpointBannerError}
            </p>
          ) : (
            <p style={{ margin: '0 0 0.5rem 0', color: theme.text.primary, fontSize: '0.88rem', lineHeight: 1.45 }}>
              {checkpoint?.message ?? 'Chargement de l’état…'}
            </p>
          )}
          {checkpoint && checkpoint.orphan_staging_runs > 0 ? (
            <p style={{ margin: '0 0 0.5rem 0', color: theme.text.secondary, fontSize: '0.8rem' }}>
              Dossiers sous <code style={{ fontSize: '0.85em' }}>.staging/</code> :{' '}
              {checkpoint.orphan_staging_runs} — au plus un run incomplet est conservé ; le serveur supprime
              les orphelins à l’abandon ou au démarrage d’une nouvelle sync complète.
            </p>
          ) : null}
          {!checkpointBannerError && checkpoint?.resumable && !busy ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
              {checkpoint.mirror_promotion_pending ? (
                <div
                  style={{
                    padding: '0.55rem 0.65rem',
                    borderRadius: '6px',
                    border: `1px solid ${theme.state.warning.color}`,
                    backgroundColor: theme.background.secondary,
                  }}
                >
                  <p
                    style={{
                      margin: '0 0 0.45rem 0',
                      color: theme.state.warning.color,
                      fontSize: '0.88rem',
                      fontWeight: 600,
                    }}
                  >
                    Miroir prêt mais non appliqué (erreurs Notion sur certaines bases)
                  </p>
                  <p style={{ margin: '0 0 0.45rem 0', color: theme.text.secondary, fontSize: '0.82rem' }}>
                    Vous pouvez appliquer le contenu déjà récupéré : les bases absentes du staging restent
                    inchangées sur disque. Ou reprendre pour retenter les appels Notion.
                  </p>
                  {serverStatus?.partial_errors?.length ? (
                    <ul
                      style={{
                        margin: '0 0 0.5rem 1rem',
                        padding: 0,
                        color: theme.text.primary,
                        fontSize: '0.78rem',
                        maxHeight: '8rem',
                        overflowY: 'auto',
                      }}
                    >
                      {serverStatus.partial_errors.map((line) => (
                        <li key={line} style={{ marginBottom: '0.25rem' }}>
                          {line}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.45rem' }}>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => runGddSync(true, { applyStagingDespiteErrors: true })}
                      style={buttonStyle(busy, true)}
                    >
                      Appliquer le miroir malgré tout
                    </button>
                  </div>
                </div>
              ) : null}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.45rem' }}>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => runGddSync(true, { resume: true })}
                  style={buttonStyle(busy, true)}
                >
                  Reprendre la sync
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => runGddSync(true, { fresh: true })}
                  style={buttonStyle(busy)}
                >
                  Tout recommencer
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    void (async () => {
                      try {
                        await deleteGddFullSyncCheckpoint()
                        await refreshCheckpoint()
                        onCheckpointDiskChanged?.()
                      } catch (e) {
                        setCheckpointBannerError(
                          e instanceof Error ? e.message : 'Abandon du checkpoint impossible',
                        )
                      }
                    })()
                  }
                  style={buttonStyle(busy)}
                >
                  Abandonner (checkpoint + staging)
                </button>
              </div>
            </div>
          ) : null}
          {!checkpointBannerError &&
          checkpoint &&
          !checkpoint.resumable &&
          !busy &&
          (checkpoint.checkpoint_status === 'stale' || checkpoint.checkpoint_status === 'invalid_file') ? (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.45rem' }}>
              <button
                type="button"
                disabled={busy}
                onClick={() => runGddSync(true, { fresh: true })}
                style={buttonStyle(busy, true)}
              >
                Tout recommencer
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  void (async () => {
                    try {
                      await deleteGddFullSyncCheckpoint()
                      await refreshCheckpoint()
                      onCheckpointDiskChanged?.()
                    } catch (e) {
                      setCheckpointBannerError(
                        e instanceof Error ? e.message : 'Nettoyage impossible',
                      )
                    }
                  })()
                }
                style={buttonStyle(busy)}
              >
                Nettoyer checkpoint / staging
              </button>
            </div>
          ) : null}
          {!checkpointBannerError &&
          checkpoint &&
          !checkpoint.resumable &&
          checkpoint.checkpoint_status === 'none' &&
          checkpoint.orphan_staging_runs > 0 &&
          !busy ? (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.45rem' }}>
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  void (async () => {
                    try {
                      await deleteGddFullSyncCheckpoint()
                      await refreshCheckpoint()
                      onCheckpointDiskChanged?.()
                    } catch (e) {
                      setCheckpointBannerError(
                        e instanceof Error ? e.message : 'Nettoyage impossible',
                      )
                    }
                  })()
                }
                style={buttonStyle(busy, true)}
              >
                Supprimer les dossiers .staging orphelins
              </button>
            </div>
          ) : null}
        </div>

        <div
          style={{
            marginBottom: '1rem',
            padding: '0.75rem',
            borderRadius: '6px',
            backgroundColor: theme.background.panel,
            border: `1px solid ${theme.border.primary}`,
          }}
        >
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '0.5rem',
              marginBottom: '0.5rem',
            }}
          >
            <p style={{ margin: 0, color: theme.text.primary, fontWeight: 'bold' }}>
              Historique des sauvegardes
            </p>
            <button
              type="button"
              disabled={busy}
              onClick={() => void refreshArchives()}
              style={buttonStyle(busy)}
            >
              Actualiser la liste
            </button>
          </div>
          <p style={{ margin: '0 0 0.5rem 0', color: theme.text.secondary, fontSize: '0.85rem' }}>
            Snapshots locaux sous <code style={{ fontSize: '0.82em' }}>.archive/</code>. La sync
            complète en crée un avant mise à jour seulement si l’état sur disque diffère du dernier
            snapshot. « Taille » = somme des fichiers du dossier ; « Fiches » = estimation (un JSON
            par fiche dans les sous-dossiers + entrées des listes dans les monolithes à la racine).
            Les sauvegardes sans aucune fiche détectée ne sont pas affichées.
          </p>
          {archivesLoadError && (
            <p style={{ color: theme.state.error.color, fontSize: '0.85rem', margin: '0 0 0.5rem 0' }}>
              {archivesLoadError}
            </p>
          )}
          {archives.length === 0 && !archivesLoadError ? (
            <p style={{ margin: 0, color: theme.text.secondary, fontSize: '0.88rem' }}>
              Aucune sauvegarde pour l’instant (lancez une sync complète pour en créer une).
            </p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem' }}>
                <thead>
                  <tr style={{ textAlign: 'left', color: theme.text.secondary }}>
                    <th style={{ padding: '0.35rem 0.5rem' }}>Date (UTC)</th>
                    <th style={{ padding: '0.35rem 0.5rem' }}>Id</th>
                    <th style={{ padding: '0.35rem 0.5rem', textAlign: 'right' }}>Taille</th>
                    <th style={{ padding: '0.35rem 0.5rem', textAlign: 'right' }}>Fiches</th>
                    <th style={{ padding: '0.35rem 0.5rem' }} />
                  </tr>
                </thead>
                <tbody>
                  {archives.map((a) => (
                    <tr
                      key={a.id}
                      style={{ borderTop: `1px solid ${theme.border.primary}`, color: theme.text.primary }}
                    >
                      <td style={{ padding: '0.35rem 0.5rem', whiteSpace: 'nowrap' }}>
                        {formatArchiveLabel(a.created_at)}
                      </td>
                      <td
                        style={{
                          padding: '0.35rem 0.5rem',
                          fontFamily: 'monospace',
                          fontSize: '0.8rem',
                          wordBreak: 'break-all',
                        }}
                      >
                        {a.id}
                      </td>
                      <td
                        style={{
                          padding: '0.35rem 0.5rem',
                          textAlign: 'right',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {formatArchiveSizeBytes(a.size_bytes)}
                      </td>
                      <td style={{ padding: '0.35rem 0.5rem', textAlign: 'right' }}>
                        {typeof a.fiche_count === 'number' ? a.fiche_count : '—'}
                      </td>
                      <td style={{ padding: '0.35rem 0.5rem', textAlign: 'right' }}>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => {
                            setRestoreBackupCurrent(true)
                            setRestoreTargetId(a.id)
                          }}
                          style={buttonStyle(busy)}
                        >
                          Restaurer
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        {statusLoadError && (
          <p
            style={{
              margin: '0 0 0.5rem 0',
              color: theme.state.error.color,
              fontSize: '0.85rem',
            }}
          >
            Statut serveur indisponible — {statusLoadError}
          </p>
        )}
        {serverStatus?.last_finished_at && (
          <p style={{ margin: '0 0 0.5rem 0', color: theme.text.secondary, fontSize: '0.85rem' }}>
            Dernière sync GDD : {new Date(serverStatus.last_finished_at).toLocaleString('fr-FR')}
            {serverStatus.last_success === false && ' (échec)'}
            {typeof serverStatus.updated_entities === 'number' &&
              serverStatus.updated_entities > 0 &&
              ` — ${serverStatus.updated_entities} entité(s)`}
          </p>
        )}
        {serverStatus && serverStatus.partial_errors.length > 0 && (
          <details style={{ marginTop: '0.25rem' }}>
            <summary style={{ cursor: 'pointer', color: theme.state.error.color, fontSize: '0.85rem' }}>
              Erreurs partielles ({serverStatus.partial_errors.length})
            </summary>
            <ul style={{ fontSize: '0.8rem', color: theme.text.secondary, maxHeight: '160px', overflow: 'auto' }}>
              {serverStatus.partial_errors.map((err, i) => (
                <li key={i}>{err}</li>
              ))}
            </ul>
          </details>
        )}
      </div>

      <GddNotionSyncProgressModal
        open={progressOpen}
        modeFull={syncModeFull}
        progress={progressSnapshot}
        elapsedSeconds={elapsedSec}
        syncActive={phase === 'loading'}
        onPause={() => void postGddFullSyncPause()}
        onUnpause={() => void postGddFullSyncUnpause()}
        onCancel={() => void postGddFullSyncCancel()}
      />

      {previewOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="gdd-preview-title"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 2150,
            backgroundColor: 'rgba(0,0,0,0.65)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem',
          }}
        >
          <div
            style={{
              width: '100%',
              maxWidth: 'min(920px, 100vw - 2rem)',
              maxHeight: 'min(85vh, 720px)',
              borderRadius: '10px',
              padding: '1.25rem 1.5rem',
              backgroundColor: theme.background.panel,
              border: `1px solid ${theme.border.primary}`,
              boxShadow: '0 8px 32px rgba(0,0,0,0.35)',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.75rem',
            }}
          >
            <h3 id="gdd-preview-title" style={{ margin: 0, color: theme.text.primary }}>
              Test Notion — {previewForFile ?? 'base'}
            </h3>
            <p style={{ margin: 0, color: theme.text.secondary, fontSize: '0.88rem' }}>
              Première ligne de la base, même pipeline que la sync (query → get_page → mapping). Aucune écriture sur
              le GDD.
            </p>
            {previewLoading && (
              <p style={{ margin: 0, color: theme.text.secondary }}>Chargement…</p>
            )}
            {previewError && (
              <p style={{ margin: 0, color: theme.state.error.color, fontSize: '0.9rem' }}>{previewError}</p>
            )}
            {previewData && !previewLoading && (
              <>
                <ul
                  style={{
                    margin: 0,
                    paddingLeft: '1.2rem',
                    color: theme.text.secondary,
                    fontSize: '0.82rem',
                    lineHeight: 1.5,
                  }}
                >
                  <li>
                    Data sources (API 2025-09-03) : <strong>{previewData.data_sources_count}</strong>
                  </li>
                  <li>Lignes retournées par query : {previewData.query_total_rows}</li>
                  <li>Clés propriétés (ligne query / get_page) : {previewData.property_keys_from_query_row.length} /{' '}
                    {previewData.property_keys_from_get_page.length}</li>
                  <li>
                    Colonnes dans <code style={{ fontSize: '0.85em' }}>values</code> (hors titre) :{' '}
                    {previewData.mapped_record &&
                    typeof previewData.mapped_record === 'object' &&
                    previewData.mapped_record !== null &&
                    'values' in previewData.mapped_record &&
                    typeof previewData.mapped_record.values === 'object' &&
                    previewData.mapped_record.values !== null
                      ? Object.keys(previewData.mapped_record.values as object).length
                      : 0}
                  </li>
                  <li>Mode compact table : {previewData.compact_table ? 'oui' : 'non'}</li>
                </ul>
                <pre
                  style={{
                    margin: 0,
                    flex: 1,
                    minHeight: '200px',
                    overflow: 'auto',
                    padding: '0.65rem',
                    fontSize: '0.75rem',
                    lineHeight: 1.35,
                    backgroundColor: theme.background.secondary,
                    borderRadius: '6px',
                    border: `1px solid ${theme.border.primary}`,
                    color: theme.text.primary,
                  }}
                >
                  {JSON.stringify(previewData.mapped_record ?? previewData, null, 2)}
                </pre>
              </>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="button"
                disabled={previewLoading}
                onClick={() => {
                  setPreviewOpen(false)
                  setPreviewForFile(null)
                  setPreviewData(null)
                  setPreviewError(null)
                }}
                style={buttonStyle(previewLoading)}
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {restoreTargetId ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="gdd-restore-title"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 2100,
            backgroundColor: 'rgba(0,0,0,0.65)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem',
          }}
        >
          <div
            style={{
              width: '100%',
              maxWidth: '420px',
              borderRadius: '10px',
              padding: '1.25rem 1.5rem',
              backgroundColor: theme.background.panel,
              border: `1px solid ${theme.border.primary}`,
              boxShadow: '0 8px 32px rgba(0,0,0,0.35)',
            }}
          >
            <h3 id="gdd-restore-title" style={{ margin: '0 0 0.75rem 0', color: theme.text.primary }}>
              Restaurer cette sauvegarde ?
            </h3>
            <p style={{ margin: '0 0 0.75rem 0', color: theme.text.secondary, fontSize: '0.9rem' }}>
              Le contenu actuel de <code style={{ fontSize: '0.85em' }}>GDD_categories</code> sera
              remplacé par le snapshot{' '}
              <code style={{ fontSize: '0.8em', wordBreak: 'break-all' }}>{restoreTargetId}</code>.
              Le manifeste Notion sera réinitialisé (prochaine sync incrémentale rechargera depuis
              Notion).
            </p>
            <label
              style={{
                display: 'flex',
                flexDirection: 'row',
                alignItems: 'flex-start',
                gap: '0.5rem',
                marginBottom: '1rem',
                color: theme.text.secondary,
                fontSize: '0.88rem',
              }}
            >
              <input
                type="checkbox"
                checked={restoreBackupCurrent}
                onChange={(e) => setRestoreBackupCurrent(e.target.checked)}
              />
              <span>Sauvegarder l’état actuel dans .archive/ avant restauration</span>
            </label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', justifyContent: 'flex-end' }}>
              <button
                type="button"
                disabled={busy}
                onClick={() => setRestoreTargetId(null)}
                style={buttonStyle(busy)}
              >
                Annuler
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  const id = restoreTargetId
                  if (!id) return
                  void run(async () => {
                    try {
                      const r = await postGddNotionArchiveRestore(id, {
                        backup_current: restoreBackupCurrent,
                      })
                      setRestoreTargetId(null)
                      await refreshArchives()
                      await refreshStatus()
                      if (r.ok) {
                        refreshContextAfterGddDiskChange()
                      }
                      return { ok: r.ok, message: r.message }
                    } catch (e) {
                      return { ok: false, message: apiErrorDetail(e) }
                    }
                  })
                }}
                style={buttonStyle(busy, true)}
              >
                Confirmer la restauration
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function formatArchiveLabel(iso: string): string {
  try {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) {
      return iso
    }
    return d.toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' })
  } catch {
    return iso
  }
}

function formatArchiveSizeBytes(n: number): string {
  if (!Number.isFinite(n) || n < 0) {
    return '—'
  }
  if (n === 0) {
    return '0 o'
  }
  const units = ['o', 'Ko', 'Mo', 'Go'] as const
  let i = 0
  let x = n
  while (x >= 1024 && i < units.length - 1) {
    x /= 1024
    i += 1
  }
  const rounded = i === 0 || x >= 10 ? Math.round(x) : Math.round(x * 10) / 10
  return `${rounded} ${units[i]}`
}

function apiErrorDetail(e: unknown): string {
  if (e && typeof e === 'object' && 'response' in e) {
    const data = (e as { response?: { data?: { detail?: unknown } } }).response?.data
    const d = data?.detail
    if (typeof d === 'string') {
      return d
    }
    if (Array.isArray(d)) {
      const first = d[0] as { msg?: string } | undefined
      if (first && typeof first.msg === 'string') {
        return first.msg
      }
    }
  }
  if (e instanceof Error) {
    return e.message
  }
  return 'Erreur lors de la restauration'
}

const labelStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '0.35rem',
  color: theme.text.secondary,
  fontSize: '0.88rem',
}

const inputStyle: CSSProperties = {
  padding: '0.45rem 0.6rem',
  borderRadius: '4px',
  border: `1px solid ${theme.border.primary}`,
  backgroundColor: theme.background.secondary,
  color: theme.text.primary,
}

function buttonStyle(disabled: boolean, primary = false): CSSProperties {
  return {
    padding: '0.5rem 1rem',
    border: 'none',
    borderRadius: '4px',
    backgroundColor: disabled
      ? theme.button.default.background
      : primary
        ? theme.button.primary.background
        : theme.button.default.background,
    color: primary ? theme.button.primary.color : theme.text.primary,
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.6 : 1,
    fontWeight: primary ? 'bold' : 'normal',
  }
}
