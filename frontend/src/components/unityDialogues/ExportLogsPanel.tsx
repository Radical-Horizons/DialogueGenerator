/**
 * Panneau « Logs d'export » bibliothèque Unity (Story 5.6 / FR54).
 */
import { useCallback, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getExportLogs, type ExportLogEntry, type ExportLogStatus } from '../../api/exports'
import { previewUnityDialogueExport, downloadUnityDialogue } from '../../api/dialogues'
import { getErrorMessage } from '../../types/errors'
import { formatBytes } from '../../utils/formatBytes'
import {
  csvEscape,
  downloadLogBlob,
  formatLogTimestamp,
  getPeriodRange,
  type PeriodFilter,
} from '../../utils/logPanelUtils'
import { StyledSelect } from '../shared/StyledSelect'
import { ExportPreviewModal } from './ExportPreviewModal'
import type { ExportPreviewResponse } from '../../types/graph'
import './ExportLogsPanel.css'

type StatusFilter = 'all' | ExportLogStatus

function formatCostEur(eur: number | null): string {
  if (eur === null) return '—'
  if (eur < 0.0001) return `€${eur.toFixed(6)}`
  return `€${eur.toFixed(4)}`
}

export interface ExportLogsPanelProps {
  onClose?: () => void
}

export function ExportLogsPanel({ onClose }: ExportLogsPanelProps) {
  const [period, setPeriod] = useState<PeriodFilter>('week')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [selectedEntry, setSelectedEntry] = useState<ExportLogEntry | null>(null)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [singlePreview, setSinglePreview] = useState<ExportPreviewResponse | null>(null)

  const queryParams = useMemo(() => {
    const { start_date, end_date } = getPeriodRange(period)
    return {
      start_date,
      end_date,
      ...(statusFilter === 'all' ? {} : { status: statusFilter }),
    }
  }, [period, statusFilter])

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['export-logs', queryParams],
    queryFn: () => getExportLogs(queryParams),
    staleTime: 15_000,
  })

  const entries = useMemo(() => data?.entries ?? [], [data?.entries])
  const totalCount = data?.total_count ?? 0
  const successCount = data?.success_count ?? 0
  const failureCount = data?.failure_count ?? 0

  const onRowClick = useCallback((entry: ExportLogEntry) => {
    setSelectedEntry((prev) => (prev?.id === entry.id ? null : entry))
  }, [])

  const handleViewJson = useCallback(async (entry: ExportLogEntry) => {
    if (entry.export_status !== 'success') return
    setPreviewOpen(true)
    setPreviewLoading(true)
    setPreviewError(null)
    setSinglePreview(null)
    try {
      const preview = await previewUnityDialogueExport(entry.dialogue_id)
      setSinglePreview(preview)
    } catch (previewErr) {
      try {
        const blob = await downloadUnityDialogue(entry.dialogue_id)
        const jsonContent = await blob.text()
        const parsed = JSON.parse(jsonContent) as { nodes?: unknown[] }
        setSinglePreview({
          json_content: jsonContent,
          size_bytes: blob.size,
          node_count: Array.isArray(parsed.nodes) ? parsed.nodes.length : 0,
          filename: entry.filename,
          schema_valid: true,
          errors: [],
        })
      } catch {
        setPreviewError(getErrorMessage(previewErr))
      }
    } finally {
      setPreviewLoading(false)
    }
  }, [])

  const exportLogs = useCallback(
    (format: 'json' | 'csv') => {
      const blob =
        format === 'json'
          ? new Blob([JSON.stringify(entries, null, 2)], { type: 'application/json' })
          : (() => {
              const header = [
                'timestamp',
                'dialogue_id',
                'filename',
                'export_status',
                'validation_status',
                'cost_eur',
                'file_size_bytes',
                'errors',
                'warnings_gdd',
                'source',
              ].join(',')
              const rows = entries.map((e) =>
                [
                  e.timestamp,
                  e.dialogue_id,
                  e.filename,
                  e.export_status,
                  e.validation_status,
                  e.cost_eur ?? '',
                  e.file_size_bytes ?? '',
                  e.errors.join('; '),
                  JSON.stringify(e.warnings_gdd),
                  e.source,
                ]
                  .map(csvEscape)
                  .join(','),
              )
              return new Blob([[header, ...rows].join('\n')], { type: 'text/csv;charset=utf-8' })
            })()
      downloadLogBlob(blob, 'export-logs', format)
    },
    [entries],
  )

  if (isLoading) {
    return <div className="elp elp--loading">Chargement des logs d&apos;export…</div>
  }

  if (isError) {
    return (
      <div className="elp elp--error">
        Erreur : {getErrorMessage(error)}
      </div>
    )
  }

  return (
    <div className="elp" data-testid="export-logs-panel">
      <div className="elp__header">
        <h3>Logs d&apos;export</h3>
        {onClose && (
          <button type="button" className="elp__close" onClick={onClose} aria-label="Fermer">
            ×
          </button>
        )}
        <div className="elp__summary" data-testid="export-logs-summary">
          {totalCount} export{totalCount !== 1 ? 's' : ''}, {successCount} succès, {failureCount}{' '}
          échec{failureCount !== 1 ? 's' : ''}
        </div>
      </div>

      <div className="elp__toolbar">
        <label>
          Période
          <StyledSelect
            value={period}
            onChange={(e) => setPeriod(e.target.value as PeriodFilter)}
            className="elp__select"
            wrapperStyle={{ width: 'auto' }}
          >
            <option value="today">Aujourd&apos;hui</option>
            <option value="week">Cette semaine</option>
            <option value="month">Ce mois</option>
          </StyledSelect>
        </label>
        <label>
          Statut
          <StyledSelect
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            className="elp__select"
            wrapperStyle={{ width: 'auto' }}
          >
            <option value="all">Tous</option>
            <option value="success">Succès</option>
            <option value="failure">Échec</option>
          </StyledSelect>
        </label>
        <div className="elp__export-actions">
          <button type="button" onClick={() => exportLogs('json')}>
            Exporter logs (JSON)
          </button>
          <button type="button" onClick={() => exportLogs('csv')}>
            Exporter logs (CSV)
          </button>
        </div>
      </div>

      {entries.length === 0 ? (
        <p className="elp__empty">Aucun log d&apos;export pour cette période.</p>
      ) : (
        <ul className="elp__list">
          {entries.map((entry) => (
            <li key={entry.id}>
              <button
                type="button"
                className={`elp__row${selectedEntry?.id === entry.id ? ' elp__row--selected' : ''}`}
                onClick={() => onRowClick(entry)}
              >
                <span className="elp__date">{formatLogTimestamp(entry.timestamp)}</span>
                <span className="elp__dialogue">{entry.dialogue_id}</span>
                <span className="elp__file">{entry.filename}</span>
                <span
                  className={`elp__badge elp__badge--${entry.export_status}`}
                  data-testid={`export-status-${entry.export_status}`}
                >
                  {entry.export_status === 'success' ? 'Succès' : 'Échec'}
                </span>
                <span className="elp__size">
                  {entry.file_size_bytes != null ? formatBytes(entry.file_size_bytes) : '—'}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {selectedEntry && (
        <div className="elp__detail" data-testid="export-log-detail">
          <h4>Détail export</h4>
          <dl>
            <dt>Timestamp</dt>
            <dd>{formatLogTimestamp(selectedEntry.timestamp)}</dd>
            <dt>Dialogue ID</dt>
            <dd>{selectedEntry.dialogue_id}</dd>
            <dt>Coût LLM</dt>
            <dd>{formatCostEur(selectedEntry.cost_eur)}</dd>
            <dt>Validation</dt>
            <dd>{selectedEntry.validation_status}</dd>
            {selectedEntry.errors.length > 0 && (
              <>
                <dt>Erreurs</dt>
                <dd>
                  <ul>
                    {selectedEntry.errors.map((err) => (
                      <li key={err}>{err}</li>
                    ))}
                  </ul>
                </dd>
              </>
            )}
            {selectedEntry.warnings_gdd.length > 0 && (
              <>
                <dt>Warnings GDD</dt>
                <dd>
                  <ul>
                    {selectedEntry.warnings_gdd.map((w, i) => (
                      <li key={i}>{String(w.message ?? JSON.stringify(w))}</li>
                    ))}
                  </ul>
                </dd>
              </>
            )}
          </dl>
          {selectedEntry.export_status === 'success' && (
            <button type="button" onClick={() => void handleViewJson(selectedEntry)}>
              Voir JSON
            </button>
          )}
        </div>
      )}

      <ExportPreviewModal
        isOpen={previewOpen}
        mode="single"
        isLoading={previewLoading}
        error={previewError}
        singlePreview={singlePreview}
        onClose={() => {
          setPreviewOpen(false)
          setSinglePreview(null)
          setPreviewError(null)
        }}
      />
    </div>
  )
}
