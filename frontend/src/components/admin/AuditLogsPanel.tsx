import { FormEvent, useCallback, useEffect, useState } from 'react'
import axios from 'axios'

import * as auditLogsApi from '../../api/auditLogs'
import type { AuditLogEntry } from '../../types/api'
import { TOUCH_TARGET_MIN_PX } from '../../constants'
import { theme } from '../../theme'

const fieldStyle: React.CSSProperties = {
  minHeight: TOUCH_TARGET_MIN_PX,
  boxSizing: 'border-box',
  padding: '0.55rem 0.7rem',
  color: theme.input.color,
  background: theme.input.background,
  border: `1px solid ${theme.input.border}`,
  borderRadius: 4,
}

const ACTION_OPTIONS = [
  '',
  'user.created',
  'user.role_status.updated',
  'dialogue.saved',
  'dialogue.deleted',
  'dialogue.share.granted',
  'dialogue.share.revoked',
] as const

function apiErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data
    if (data && typeof data === 'object' && !(data instanceof Blob)) {
      const message = (data as { error?: { message?: unknown } }).error?.message
      if (typeof message === 'string') {
        return message
      }
    }
    if (error.response?.status === 403) {
      return 'Accès réservé aux administrateurs.'
    }
    if (error.response?.status === 422) {
      return 'Filtres invalides (vérifiez la plage de dates).'
    }
  }
  return 'Impossible de charger les journaux d’audit.'
}

async function resolveApiErrorMessage(error: unknown): Promise<string> {
  if (axios.isAxiosError(error) && error.response?.data instanceof Blob) {
    try {
      const text = await error.response.data.text()
      const parsed = JSON.parse(text) as { error?: { message?: unknown }; detail?: unknown }
      if (typeof parsed.error?.message === 'string') {
        return parsed.error.message
      }
      if (typeof parsed.detail === 'string') {
        return parsed.detail
      }
    } catch {
      // fall through to generic message
    }
  }
  return apiErrorMessage(error)
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function AuditLogsPanel() {
  const [items, setItems] = useState<AuditLogEntry[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize] = useState(50)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [username, setUsername] = useState('')
  const [action, setAction] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [appliedUsername, setAppliedUsername] = useState('')
  const [appliedAction, setAppliedAction] = useState('')
  const [appliedStartDate, setAppliedStartDate] = useState('')
  const [appliedEndDate, setAppliedEndDate] = useState('')

  const loadLogs = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const response = await auditLogsApi.listAuditLogs({
        page,
        page_size: pageSize,
        username: appliedUsername || undefined,
        action: appliedAction || undefined,
        start_date: appliedStartDate || undefined,
        end_date: appliedEndDate || undefined,
      })
      const maxPage = Math.max(1, Math.ceil(response.total / pageSize) || 1)
      if (page > maxPage) {
        setPage(maxPage)
        return
      }
      setItems(response.items)
      setTotal(response.total)
    } catch (loadError) {
      setError(await resolveApiErrorMessage(loadError))
      setItems([])
      setTotal(0)
    } finally {
      setIsLoading(false)
    }
  }, [
    page,
    pageSize,
    appliedUsername,
    appliedAction,
    appliedStartDate,
    appliedEndDate,
  ])

  useEffect(() => {
    void loadLogs()
  }, [loadLogs])

  const handleFilterSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (startDate && endDate && startDate > endDate) {
      setError('La date de début doit être antérieure ou égale à la date de fin.')
      return
    }
    setPage(1)
    setAppliedUsername(username.trim())
    setAppliedAction(action)
    setAppliedStartDate(startDate)
    setAppliedEndDate(endDate)
  }

  const handleExport = async (format: 'json' | 'csv') => {
    setError(null)
    if (appliedStartDate && appliedEndDate && appliedStartDate > appliedEndDate) {
      setError('La date de début doit être antérieure ou égale à la date de fin.')
      return
    }
    try {
      const blob = await auditLogsApi.exportAuditLogs(format, {
        username: appliedUsername || undefined,
        action: appliedAction || undefined,
        start_date: appliedStartDate || undefined,
        end_date: appliedEndDate || undefined,
      })
      downloadBlob(blob, `audit-logs.${format}`)
    } catch (exportError) {
      setError(await resolveApiErrorMessage(exportError))
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  return (
    <section aria-labelledby="audit-logs-title" style={{ padding: '1rem' }}>
      <h1
        id="audit-logs-title"
        style={{ color: theme.text.primary, marginBottom: '1rem' }}
      >
        Journaux d’audit
      </h1>

      <form
        onSubmit={handleFilterSubmit}
        style={{
          display: 'grid',
          gap: '0.75rem',
          gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
          marginBottom: '1rem',
          alignItems: 'end',
        }}
      >
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ color: theme.text.secondary, fontSize: 14 }}>Utilisateur</span>
          <input
            aria-label="Filtrer par utilisateur"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            style={fieldStyle}
          />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ color: theme.text.secondary, fontSize: 14 }}>Action</span>
          <select
            aria-label="Filtrer par action"
            value={action}
            onChange={(event) => setAction(event.target.value)}
            style={fieldStyle}
          >
            {ACTION_OPTIONS.map((option) => (
              <option key={option || 'all'} value={option}>
                {option || 'Toutes'}
              </option>
            ))}
          </select>
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ color: theme.text.secondary, fontSize: 14 }}>Début</span>
          <input
            aria-label="Date de début"
            type="date"
            value={startDate}
            onChange={(event) => setStartDate(event.target.value)}
            style={fieldStyle}
          />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ color: theme.text.secondary, fontSize: 14 }}>Fin</span>
          <input
            aria-label="Date de fin"
            type="date"
            value={endDate}
            onChange={(event) => setEndDate(event.target.value)}
            style={fieldStyle}
          />
        </label>
        <button
          type="submit"
          style={{
            ...fieldStyle,
            cursor: 'pointer',
            background: theme.button.primary.background,
            color: theme.button.primary.color,
            border: 'none',
          }}
        >
          Filtrer
        </button>
      </form>

      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={() => void handleExport('json')}
          style={{
            minHeight: TOUCH_TARGET_MIN_PX,
            padding: '0.5rem 0.75rem',
            cursor: 'pointer',
            background: theme.button.default.background,
            color: theme.button.default.color,
            border: `1px solid ${theme.border.primary}`,
            borderRadius: 4,
          }}
        >
          Exporter JSON
        </button>
        <button
          type="button"
          onClick={() => void handleExport('csv')}
          style={{
            minHeight: TOUCH_TARGET_MIN_PX,
            padding: '0.5rem 0.75rem',
            cursor: 'pointer',
            background: theme.button.default.background,
            color: theme.button.default.color,
            border: `1px solid ${theme.border.primary}`,
            borderRadius: 4,
          }}
        >
          Exporter CSV
        </button>
      </div>

      {error && (
        <p role="alert" style={{ color: theme.state.error.color, marginBottom: '1rem' }}>
          {error}
        </p>
      )}

      {isLoading ? (
        <p style={{ color: theme.text.secondary }}>Chargement…</p>
      ) : items.length === 0 ? (
        <p style={{ color: theme.text.secondary }}>Aucune entrée d’audit.</p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              color: theme.text.primary,
            }}
          >
            <thead>
              <tr>
                <th style={{ textAlign: 'left', padding: '0.5rem', borderBottom: `1px solid ${theme.border.primary}` }}>Date</th>
                <th style={{ textAlign: 'left', padding: '0.5rem', borderBottom: `1px solid ${theme.border.primary}` }}>Acteur</th>
                <th style={{ textAlign: 'left', padding: '0.5rem', borderBottom: `1px solid ${theme.border.primary}` }}>Action</th>
                <th style={{ textAlign: 'left', padding: '0.5rem', borderBottom: `1px solid ${theme.border.primary}` }}>Cible</th>
              </tr>
            </thead>
            <tbody>
              {items.map((entry) => (
                <tr key={entry.id}>
                  <td style={{ padding: '0.5rem', borderBottom: `1px solid ${theme.border.primary}` }}>
                    {new Date(entry.created_at).toLocaleString('fr-FR')}
                  </td>
                  <td style={{ padding: '0.5rem', borderBottom: `1px solid ${theme.border.primary}` }}>
                    {entry.actor_username}
                  </td>
                  <td style={{ padding: '0.5rem', borderBottom: `1px solid ${theme.border.primary}` }}>
                    {entry.action}
                  </td>
                  <td style={{ padding: '0.5rem', borderBottom: `1px solid ${theme.border.primary}` }}>
                    {entry.target_type}/{entry.target_id}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div
        style={{
          display: 'flex',
          gap: '0.75rem',
          alignItems: 'center',
          marginTop: '1rem',
        }}
      >
        <button
          type="button"
          disabled={page <= 1}
          onClick={() => setPage((current) => Math.max(1, current - 1))}
          style={{
            minHeight: TOUCH_TARGET_MIN_PX,
            padding: '0.4rem 0.75rem',
            cursor: page <= 1 ? 'not-allowed' : 'pointer',
          }}
        >
          Précédent
        </button>
        <span style={{ color: theme.text.secondary }}>
          Page {page} / {totalPages} ({total} entrée{total === 1 ? '' : 's'})
        </span>
        <button
          type="button"
          disabled={page >= totalPages}
          onClick={() => setPage((current) => current + 1)}
          style={{
            minHeight: TOUCH_TARGET_MIN_PX,
            padding: '0.4rem 0.75rem',
            cursor: page >= totalPages ? 'not-allowed' : 'pointer',
          }}
        >
          Suivant
        </button>
      </div>
    </section>
  )
}
