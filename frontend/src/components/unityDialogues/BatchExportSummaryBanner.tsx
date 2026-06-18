/**
 * Résumé de fin d'export batch (Story 5.2 AC #3).
 */
import type { CSSProperties } from 'react'
import { theme } from '../../theme'
import { remSize } from '../../theme/uiTypography'
import { formatBatchExportSummary } from '../../utils/batchExportOptions'
import { formatBatchFailuresSummary } from '../../utils/graphApiErrors'
import type { BatchExportSummaryState } from '../../hooks/useBatchUnityExport'

export interface BatchExportSummaryBannerProps {
  summary: BatchExportSummaryState
  onDismiss: () => void
  onRetryFailed: () => void
}

export function BatchExportSummaryBanner({
  summary,
  onDismiss,
  onRetryFailed,
}: BatchExportSummaryBannerProps) {
  const headline = formatBatchExportSummary(
    summary.exportedCount,
    summary.failedCount,
    summary.cancelled,
  )
  const failuresText = formatBatchFailuresSummary(summary.failed)

  return (
    <div
      data-testid="batch-export-summary"
      role="status"
      style={{
        margin: '0.5rem',
        padding: '0.65rem',
        borderRadius: '6px',
        border: `1px solid ${theme.border.primary}`,
        backgroundColor: theme.background.panelHeader,
        fontSize: remSize('small'),
        color: theme.text.primary,
      }}
    >
      <div style={{ fontWeight: 600, marginBottom: '0.35rem' }}>{headline}</div>
      {failuresText && (
        <div
          data-testid="batch-export-failures-list"
          style={{ color: theme.state.error.color, marginBottom: '0.35rem' }}
        >
          {failuresText}
        </div>
      )}
      <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
        {summary.failedCount > 0 && (
          <button
            type="button"
            data-testid="batch-export-retry-failures"
            onClick={onRetryFailed}
            style={actionButtonStyle}
          >
            Réexporter les échecs
          </button>
        )}
        <button type="button" data-testid="batch-export-summary-dismiss" onClick={onDismiss} style={actionButtonStyle}>
          Fermer
        </button>
      </div>
    </div>
  )
}

const actionButtonStyle: CSSProperties = {
  padding: '0.3rem 0.5rem',
  fontSize: remSize('small'),
  border: `1px solid ${theme.border.primary}`,
  borderRadius: '4px',
  backgroundColor: theme.button.default.background,
  color: theme.button.default.color,
  cursor: 'pointer',
}
