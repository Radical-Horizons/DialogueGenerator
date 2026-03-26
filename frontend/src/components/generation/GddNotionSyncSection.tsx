/**
 * Panneau sync des catégories GDD depuis Notion (FR18).
 */
import type { CSSProperties } from 'react'
import { useCallback, useEffect, useState } from 'react'
import {
  getGddNotionSyncStatus,
  postGddNotionSync,
  postGddNotionTestConnection,
  type GddNotionSyncStatusResponse,
} from '../../api/gddNotionSync'
import { useGddNotionSyncUi } from '../../hooks/useGddNotionSyncUi'
import { theme } from '../../theme'

export function GddNotionSyncSection() {
  const { phase, userMessage, run, resetMessage } = useGddNotionSyncUi()
  const [serverStatus, setServerStatus] = useState<GddNotionSyncStatusResponse | null>(null)
  const [statusLoadError, setStatusLoadError] = useState<string | null>(null)

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
    void refreshStatus()
  }, [refreshStatus, phase])

  const busy = phase === 'loading'

  return (
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
        Met à jour les fichiers JSON des catégories GDD configurés (API + manifeste incrémental).
        Le token n&apos;est jamais affiché ici.
      </p>
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
          onClick={() =>
            run(async () => {
              const r = await postGddNotionSync(false)
              await refreshStatus()
              return { success: r.success, message: r.message }
            })
          }
          style={buttonStyle(busy, true)}
        >
          {busy ? 'Synchronisation…' : 'Synchroniser maintenant'}
        </button>
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
        <p style={{ margin: 0, color: theme.text.secondary, fontSize: '0.85rem' }}>
          Dernière sync GDD : {new Date(serverStatus.last_finished_at).toLocaleString('fr-FR')}
          {serverStatus.last_success === false && ' (échec)'}
          {typeof serverStatus.updated_entities === 'number' &&
            serverStatus.updated_entities > 0 &&
            ` — ${serverStatus.updated_entities} entité(s)`}
        </p>
      )}
    </div>
  )
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
