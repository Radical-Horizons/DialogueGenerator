/**
 * Panneau "Logs de génération" pour un dialogue (Story 1.15).
 * Liste chronologique (plus récent en premier), détail au clic (prompt, réponse, coût),
 * filtres période et provider, résumé "X générations, Y€ total".
 */
import { useCallback, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  getGenerationLogs,
  type GenerationLogEntry,
  type GetGenerationLogsParams,
} from '../../api/llmUsage'
import { getErrorMessage } from '../../types/errors'
import './GenerationLogsPanel.css'

type PeriodFilter = 'today' | 'week' | 'month'
type ProviderFilter = 'all' | 'openai' | 'mistral'

function toDateString(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function getPeriodRange(period: PeriodFilter): { start_date: string; end_date: string } {
  const end = new Date()
  const end_date = toDateString(end)
  const start = new Date()
  if (period === 'today') {
    start.setHours(0, 0, 0, 0)
    return { start_date: toDateString(start), end_date }
  }
  if (period === 'week') {
    start.setDate(start.getDate() - 7)
    return { start_date: toDateString(start), end_date }
  }
  // month
  start.setDate(start.getDate() - 30)
  return { start_date: toDateString(start), end_date }
}

function formatTimestamp(iso: string): string {
  try {
    return new Date(iso).toLocaleString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
  } catch {
    return iso
  }
}

function formatCostEur(eur: number): string {
  if (eur < 0.0001) return `€${eur.toFixed(6)}`
  return `€${eur.toFixed(4)}`
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms} ms`
  return `${(ms / 1000).toFixed(2)} s`
}

function filterByProvider(entries: GenerationLogEntry[], provider: ProviderFilter): GenerationLogEntry[] {
  if (provider === 'all') return entries
  const lower = (s: string) => s.toLowerCase()
  return entries.filter((e) => {
    const m = lower(e.model_name)
    if (provider === 'openai') return m.includes('gpt') || m.includes('openai')
    if (provider === 'mistral') return m.includes('mistral')
    return true
  })
}

/** Escape and quote CSV field per RFC 4180 (commas, newlines, double-quotes). */
function csvEscape(value: unknown): string {
  const s = value === null || value === undefined ? '' : String(value)
  const escaped = s.replace(/"/g, '""')
  return /[,"\n\r]/.test(escaped) ? `"${escaped}"` : escaped
}

export interface GenerationLogsPanelProps {
  /** ID du dialogue (nom fichier Unity). */
  dialogueId: string
}

export function GenerationLogsPanel({ dialogueId }: GenerationLogsPanelProps) {
  const [period, setPeriod] = useState<PeriodFilter>('week')
  const [provider, setProvider] = useState<ProviderFilter>('all')
  const [selectedEntry, setSelectedEntry] = useState<GenerationLogEntry | null>(null)

  const params: GetGenerationLogsParams = useMemo(() => {
    const { start_date, end_date } = getPeriodRange(period)
    return { start_date, end_date }
  }, [period])

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['generation-logs', dialogueId, params],
    queryFn: () => getGenerationLogs(dialogueId, params),
    enabled: !!dialogueId,
    staleTime: 15_000,
  })

  const entries = useMemo(
    () => filterByProvider(data?.entries ?? [], provider),
    [data?.entries, provider]
  )
  const totalCount = entries.length
  const totalCostEur = useMemo(
    () => entries.reduce((sum, e) => sum + e.cost_eur, 0),
    [entries]
  )

  const onRowClick = useCallback((entry: GenerationLogEntry) => {
    setSelectedEntry((prev) => (prev?.request_id === entry.request_id ? null : entry))
  }, [])

  const exportLogs = useCallback(
    (format: 'json' | 'csv') => {
      const blob =
        format === 'json'
          ? new Blob([JSON.stringify(entries, null, 2)], { type: 'application/json' })
          : (() => {
              const header = [
                'timestamp',
                'node_id',
                'model_name',
                'prompt_tokens',
                'completion_tokens',
                'total_tokens',
                'cost_eur',
                'duration_ms',
                'success',
                'error_message',
                'prompt',
                'response',
              ].join(',')
              const rows = entries.map((e) =>
                [
                  e.timestamp,
                  e.node_id ?? '',
                  e.model_name,
                  e.prompt_tokens,
                  e.completion_tokens,
                  e.total_tokens,
                  e.cost_eur,
                  e.duration_ms,
                  e.success,
                  e.error_message ?? '',
                  e.prompt ?? '',
                  e.response ?? '',
                ]
                  .map(csvEscape)
                  .join(',')
              )
              const csv = [header, ...rows].join('\n')
              return new Blob([csv], { type: 'text/csv;charset=utf-8' })
            })()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `generation-logs-${dialogueId}-${new Date().toISOString().slice(0, 10)}.${format}`
      a.click()
      URL.revokeObjectURL(url)
    },
    [entries, dialogueId]
  )

  if (!dialogueId) {
    return (
      <div className="glp glp--empty">
        <p>Sélectionnez un dialogue pour afficher les logs de génération.</p>
      </div>
    )
  }

  if (isLoading) {
    return <div className="glp glp--loading">Chargement des logs...</div>
  }

  if (isError) {
    return (
      <div className="glp glp--error">
        Erreur : {getErrorMessage(error)}
      </div>
    )
  }

  return (
    <div className="glp">
      <div className="glp__header">
        <h3>Logs de génération</h3>
        <div className="glp__summary">
          {totalCount} génération{totalCount !== 1 ? 's' : ''}, {formatCostEur(totalCostEur)} total
        </div>
      </div>

      <div className="glp__toolbar">
        <div className="glp__filters">
          <label>
            Période
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value as PeriodFilter)}
            className="glp__select"
          >
            <option value="today">Aujourd&apos;hui</option>
            <option value="week">Cette semaine</option>
            <option value="month">Ce mois</option>
          </select>
        </label>
        <label>
          Provider
          <select
            value={provider}
            onChange={(e) => setProvider(e.target.value as ProviderFilter)}
            className="glp__select"
          >
            <option value="all">Tous</option>
            <option value="openai">OpenAI</option>
            <option value="mistral">Mistral</option>
          </select>
        </label>
        </div>
        <div className="glp__export">
          <button
            type="button"
            className="glp__export-btn"
            onClick={() => exportLogs('json')}
            disabled={entries.length === 0}
          >
            Exporter JSON
          </button>
          <button
            type="button"
            className="glp__export-btn"
            onClick={() => exportLogs('csv')}
            disabled={entries.length === 0}
          >
            Exporter CSV
          </button>
        </div>
      </div>

      {entries.length === 0 ? (
        <div className="glp__empty">Aucun log pour cette période ou ce provider.</div>
      ) : (
        <>
          <table className="glp__table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Nœud</th>
                <th>Coût</th>
                <th>Tokens</th>
                <th>Provider</th>
                <th>Statut</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr
                  key={entry.request_id}
                  onClick={() => onRowClick(entry)}
                  className={`glp__row ${!entry.success ? 'glp__row--error' : ''} ${selectedEntry?.request_id === entry.request_id ? 'glp__row--selected' : ''}`}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      onRowClick(entry)
                    }
                  }}
                >
                  <td>{formatTimestamp(entry.timestamp)}</td>
                  <td className="glp__node-id">{entry.node_id ?? '—'}</td>
                  <td>{formatCostEur(entry.cost_eur)}</td>
                  <td>{entry.total_tokens.toLocaleString()}</td>
                  <td>{entry.model_name}</td>
                  <td>
                    <span className={`glp__status ${entry.success ? 'glp__status--ok' : 'glp__status--fail'}`}>
                      {entry.success ? 'Succès' : 'Échec'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {selectedEntry && (
            <div className="glp__detail">
              <div className="glp__detail-header">
                <strong>Détail — {selectedEntry.node_id ?? selectedEntry.request_id}</strong>
                <button
                  type="button"
                  className="glp__detail-close"
                  onClick={() => setSelectedEntry(null)}
                  aria-label="Fermer"
                >
                  ×
                </button>
              </div>
              <div className="glp__detail-meta">
                <span>Durée : {formatDuration(selectedEntry.duration_ms)}</span>
                <span>Coût : {formatCostEur(selectedEntry.cost_eur)}</span>
                {!selectedEntry.success && selectedEntry.error_message && (
                  <span className="glp__detail-error">Erreur : {selectedEntry.error_message}</span>
                )}
              </div>
              {selectedEntry.prompt != null && selectedEntry.prompt !== '' && (
                <div className="glp__detail-block">
                  <div className="glp__detail-label">Prompt</div>
                  <pre className="glp__detail-content">{selectedEntry.prompt}</pre>
                </div>
              )}
              {selectedEntry.response != null && selectedEntry.response !== '' && (
                <div className="glp__detail-block">
                  <div className="glp__detail-label">Réponse LLM</div>
                  <pre className="glp__detail-content">{selectedEntry.response}</pre>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
