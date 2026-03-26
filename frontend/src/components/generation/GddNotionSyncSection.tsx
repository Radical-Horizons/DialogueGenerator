/**
 * Panneau sync des catégories GDD depuis Notion (FR18).
 */
import type { CSSProperties } from 'react'
import { useCallback, useEffect, useState } from 'react'
import {
  getGddNotionArchives,
  getGddNotionSyncConfig,
  getGddNotionSyncProgress,
  getGddNotionSyncStatus,
  postGddNotionArchiveRestore,
  postGddNotionSync,
  postGddNotionTestConnection,
  putGddNotionSyncConfig,
  type GddArchiveEntry,
  type GddNotionSyncConfigPublic,
  type GddNotionSyncProgressResponse,
  type GddNotionSyncStatusResponse,
} from '../../api/gddNotionSync'
import { GddNotionSyncProgressModal } from './GddNotionSyncProgressModal'
import { useGddNotionSyncUi } from '../../hooks/useGddNotionSyncUi'
import { theme } from '../../theme'

export function GddNotionSyncSection() {
  const { phase, userMessage, run, resetMessage } = useGddNotionSyncUi()
  const [serverStatus, setServerStatus] = useState<GddNotionSyncStatusResponse | null>(null)
  const [statusLoadError, setStatusLoadError] = useState<string | null>(null)

  const [config, setConfig] = useState<GddNotionSyncConfigPublic | null>(null)
  const [configLoadError, setConfigLoadError] = useState<string | null>(null)
  const [intervalMin, setIntervalMin] = useState(60)
  const [autoSync, setAutoSync] = useState(false)
  const [includedText, setIncludedText] = useState('')
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
      setIncludedText((r.config.included_categories || []).join('\n'))
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

  const runGddSync = useCallback(
    (full: boolean) => {
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
          const r = await postGddNotionSync(full)
          await refreshStatus()
          if (full) {
            await refreshArchives()
          }
          return { success: r.success, message: r.message }
        } finally {
          window.clearInterval(poll)
          setProgressOpen(false)
          setSyncStartedAt(null)
          setProgressSnapshot(null)
        }
      })
    },
    [run, refreshStatus, refreshArchives],
  )

  const handleSaveSettings = async () => {
    setSaveError(null)
    setSaveMessage(null)
    setSaving(true)
    try {
      const lines = includedText
        .split(/[\n,]+/)
        .map((s) => s.trim())
        .filter(Boolean)
      const body: Parameters<typeof putGddNotionSyncConfig>[0] = {
        sync_interval_minutes: Math.max(1, Math.floor(Number(intervalMin)) || 60),
        auto_sync_enabled: autoSync,
        included_categories: lines,
        archive_retention_count: Math.max(1, Math.floor(Number(archiveRetentionSetting)) || 10),
      }
      if (tokenInput.trim()) {
        body.notion_token = tokenInput.trim()
      }
      const r = await putGddNotionSyncConfig(body)
      setConfig(r.config)
      setTokenInput('')
      setSaveMessage('Paramètres enregistrés.')
      void refreshArchives()
    } catch (e) {
      const text = e instanceof Error ? e.message : 'Échec de l’enregistrement'
      setSaveError(text)
    } finally {
      setSaving(false)
    }
  }

  const sources = config?.sources ?? []
  const dbCount = sources.filter((s) => s.kind === 'database').length
  const pageCount = sources.filter((s) => s.kind === 'page').length

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
                Filtre catégories :{' '}
                {config.included_categories?.length
                  ? `${config.included_categories.length} entrée(s) (seules ces cibles sont sync)`
                  : 'aucun → toutes les sources sont synchronisées'}
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
            <label style={labelStyle}>
              <span>
                Catégories incluses (optionnel, une par ligne ou séparées par des virgules)
              </span>
              <textarea
                rows={4}
                disabled={!config || saving || busy}
                value={includedText}
                onChange={(e) => setIncludedText(e.target.value)}
                placeholder="Vide = toutes. Ex. Personnages.json ou Personnages"
                style={{ ...inputStyle, resize: 'vertical', minHeight: '80px' }}
              />
            </label>
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
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center' }}>
              <button
                type="button"
                disabled={!config || saving || busy}
                onClick={() => void handleSaveSettings()}
                style={buttonStyle(saving || busy, true)}
              >
                {saving ? 'Enregistrement…' : 'Enregistrer les paramètres'}
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

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.75rem' }}>
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
          <button
            type="button"
            disabled={busy}
            onClick={() => runGddSync(true)}
            style={buttonStyle(busy)}
          >
            {busy ? '…' : 'Sync complète'}
          </button>
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
            complète en crée un automatiquement avant mise à jour.
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
        {userMessage && (
          <p
            style={{
              margin: '0 0 0.5rem 0',
              color: phase === 'error' ? theme.state.error.color : theme.text.secondary,
              fontSize: '0.9rem',
            }}
          >
            {userMessage}
            {phase !== 'idle' && phase !== 'loading' && (
              <button
                type="button"
                onClick={resetMessage}
                style={{
                  marginLeft: '0.5rem',
                  border: 'none',
                  background: 'transparent',
                  color: theme.text.secondary,
                  cursor: 'pointer',
                  textDecoration: 'underline',
                }}
              >
                Fermer
              </button>
            )}
          </p>
        )}
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
      />

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
