/** Modal de progression / rapport validation batch FR87. */
import type { CSSProperties } from 'react'
import { theme } from '../../theme'
import { remSize } from '../../theme/uiTypography'
import { TOUCH_TARGET_MIN_PX } from '../../constants'
import type {
  BatchValidateReport,
  BatchValidationItem,
} from '../../api/batchValidation'
import type { BatchValidationProgress } from '../../hooks/useBatchDialogueValidation'

export interface BatchValidationModalProps {
  open: boolean
  isValidating: boolean
  progress: BatchValidationProgress | null
  report: BatchValidateReport | null
  onCancel: () => void
  onClose: () => void
  onOpenDialogue: (documentId: string, focusNodeId?: string) => void
}

function downloadBlob(filename: string, content: string, mime: string): void {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

function reportToJson(report: BatchValidateReport): string {
  return JSON.stringify(report, null, 2)
}

function reportToCsv(report: BatchValidateReport): string {
  const header = 'document_id,status,issue_type,severity,source,node_id,message,validated_at'
  const rows: string[] = [header]
  for (const item of report.items) {
    if (item.issues.length === 0) {
      rows.push(
        [
          item.document_id,
          item.status,
          '',
          '',
          '',
          '',
          '',
          item.validated_at,
        ]
          .map(csvEscape)
          .join(',')
      )
      continue
    }
    for (const issue of item.issues) {
      rows.push(
        [
          item.document_id,
          item.status,
          issue.type,
          issue.severity,
          issue.source,
          issue.node_id ?? '',
          issue.message,
          item.validated_at,
        ]
          .map(csvEscape)
          .join(',')
      )
    }
  }
  return rows.join('\n')
}

function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

function firstErrorNodeId(item: BatchValidationItem): string | undefined {
  const hit = item.issues.find((issue) => issue.node_id && issue.severity === 'error')
  return hit?.node_id ?? item.issues.find((issue) => issue.node_id)?.node_id ?? undefined
}

const actionStyle: CSSProperties = {
  minHeight: TOUCH_TARGET_MIN_PX,
  padding: '0.45rem 0.8rem',
  borderRadius: 6,
  border: `1px solid ${theme.border.primary}`,
  backgroundColor: theme.button.secondary.background,
  color: theme.button.secondary.color,
  cursor: 'pointer',
  fontSize: remSize('small'),
}

export function BatchValidationModal({
  open,
  isValidating,
  progress,
  report,
  onCancel,
  onClose,
  onOpenDialogue,
}: BatchValidationModalProps) {
  if (!open) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="batch-validation-title"
      data-testid="batch-validation-modal"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1900,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem',
        backgroundColor: 'rgba(0,0,0,0.45)',
      }}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !isValidating) onClose()
      }}
    >
      <div
        style={{
          width: 'min(720px, 100%)',
          maxHeight: 'min(80vh, 820px)',
          overflowY: 'auto',
          padding: '1.1rem',
          borderRadius: 8,
          border: `1px solid ${theme.border.primary}`,
          backgroundColor: theme.background.secondary,
          color: theme.text.primary,
        }}
      >
        <h2 id="batch-validation-title" style={{ marginTop: 0, fontSize: '1.1rem' }}>
          {isValidating
            ? `Validation batch : ${progress?.current ?? 0}/${progress?.total ?? 0} dialogues`
            : 'Rapport de validation batch'}
        </h2>

        {isValidating && (
          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem' }}>
            <button type="button" style={actionStyle} onClick={onCancel}>
              Interrompre
            </button>
          </div>
        )}

        {report && (
          <>
            <p style={{ color: theme.text.secondary, fontSize: remSize('small') }}>
              {report.valid_count} valide(s) · {report.invalid_count} avec erreurs ·{' '}
              {report.skipped_count} ignoré(s)
              {report.cancelled ? ' · annulé' : ''}
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginBottom: '0.75rem' }}>
              <button
                type="button"
                style={actionStyle}
                data-testid="batch-validation-export-json"
                onClick={() =>
                  downloadBlob(
                    `batch-validation-${Date.now()}.json`,
                    reportToJson(report),
                    'application/json'
                  )
                }
              >
                Exporter JSON
              </button>
              <button
                type="button"
                style={actionStyle}
                data-testid="batch-validation-export-csv"
                onClick={() =>
                  downloadBlob(
                    `batch-validation-${Date.now()}.csv`,
                    reportToCsv(report),
                    'text/csv'
                  )
                }
              >
                Exporter CSV
              </button>
            </div>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {report.items.map((item) => (
                <li
                  key={item.document_id}
                  data-testid={`batch-validation-item-${item.document_id}`}
                  style={{
                    borderTop: `1px solid ${theme.border.primary}`,
                    padding: '0.55rem 0',
                  }}
                >
                  <button
                    type="button"
                    style={{
                      ...actionStyle,
                      border: 'none',
                      background: 'transparent',
                      color: theme.text.primary,
                      padding: 0,
                      textAlign: 'left',
                      fontWeight: 600,
                    }}
                    onClick={() =>
                      onOpenDialogue(item.document_id, firstErrorNodeId(item))
                    }
                  >
                    {item.document_id} — {item.status}
                  </button>
                  {item.issues.length > 0 && (
                    <ul style={{ margin: '0.35rem 0 0', paddingLeft: '1.1rem' }}>
                      {item.issues.slice(0, 8).map((issue, index) => (
                        <li
                          key={`${issue.type}-${index}`}
                          style={{
                            fontSize: remSize('small'),
                            color:
                              issue.severity === 'error'
                                ? theme.state.error.color
                                : theme.text.secondary,
                          }}
                        >
                          [{issue.source}] {issue.message}
                          {issue.node_id ? ` (${issue.node_id})` : ''}
                        </li>
                      ))}
                      {item.issues.length > 8 && (
                        <li style={{ fontSize: remSize('small'), color: theme.text.tertiary }}>
                          +{item.issues.length - 8} autre(s)…
                        </li>
                      )}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}

        {!isValidating && (
          <div style={{ marginTop: '1rem', textAlign: 'right' }}>
            <button type="button" style={actionStyle} onClick={onClose}>
              Fermer
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
