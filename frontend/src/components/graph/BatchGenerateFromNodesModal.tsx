/**
 * Modal progression / rapport génération batch multi-parents (Story 8.9 / FR88).
 */
import { theme } from '../../theme'
import type { BatchGenerateProgress } from '../../hooks/useBatchGenerateFromNodes'
import type { BatchGenerateReport } from '../../api/batchNodeGeneration'

export interface BatchGenerateFromNodesModalProps {
  open: boolean
  isGenerating: boolean
  progress: BatchGenerateProgress | null
  report: BatchGenerateReport | null
  onClose: () => void
  onCancel: () => void
  onRetryFailed: () => void
}

export function BatchGenerateFromNodesModal({
  open,
  isGenerating,
  progress,
  report,
  onClose,
  onCancel,
  onRetryFailed,
}: BatchGenerateFromNodesModalProps) {
  if (!open) return null

  const failedCount = report?.error_count ?? 0
  const summary =
    report &&
    `${report.total_nodes_generated} nœuds générés depuis ${report.ok_count} nœuds de départ`

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Génération batch"
      data-testid="batch-generate-modal"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1200,
        backgroundColor: 'rgba(0,0,0,0.45)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem',
      }}
      onClick={onClose}
    >
      <div
        style={{
          minWidth: 320,
          maxWidth: 520,
          maxHeight: '80vh',
          overflow: 'auto',
          backgroundColor: theme.background.secondary,
          color: theme.text.primary,
          borderRadius: 8,
          border: `1px solid ${theme.border.primary}`,
          padding: '1rem 1.25rem',
          boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 style={{ margin: '0 0 0.75rem', fontSize: '1.05rem' }}>
          Génération batch
        </h3>

        {isGenerating && progress && (
          <div data-testid="batch-generate-progress" style={{ marginBottom: '0.75rem' }}>
            <div style={{ fontSize: '0.9rem', marginBottom: 6 }}>
              {progress.detail || `Nœud ${progress.current}/${progress.total}`}
            </div>
            <div
              style={{
                height: 8,
                borderRadius: 4,
                backgroundColor: theme.background.tertiary,
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  height: '100%',
                  width: `${
                    progress.total > 0
                      ? Math.min(100, (100 * progress.current) / progress.total)
                      : 0
                  }%`,
                  backgroundColor: theme.state.info?.color || '#4dabf7',
                  transition: 'width 0.2s ease',
                }}
              />
            </div>
            <button
              type="button"
              data-testid="batch-generate-cancel"
              onClick={onCancel}
              style={{
                marginTop: 10,
                padding: '0.35rem 0.75rem',
                borderRadius: 6,
                border: `1px solid ${theme.border.primary}`,
                background: theme.button.default.background,
                color: theme.button.default.color,
                cursor: 'pointer',
              }}
            >
              Annuler
            </button>
          </div>
        )}

        {report && !isGenerating && (
          <div data-testid="batch-generate-report">
            <p style={{ margin: '0 0 0.5rem', fontWeight: 600 }}>{summary}</p>
            {report.cancelled && (
              <p style={{ margin: '0 0 0.5rem', color: '#ffd43b' }}>Lot annulé (partiel conservé).</p>
            )}
            <ul
              style={{
                listStyle: 'none',
                padding: 0,
                margin: '0 0 0.75rem',
                fontSize: '0.85rem',
                maxHeight: 220,
                overflowY: 'auto',
              }}
            >
              {report.items.map((item) => (
                <li
                  key={item.parent_node_id}
                  style={{
                    padding: '0.35rem 0',
                    borderBottom: `1px solid ${theme.border.primary}`,
                  }}
                >
                  <strong>{item.parent_node_id}</strong> — {item.status}
                  {item.error ? ` : ${item.error}` : ''}
                  {item.warning ? ` : ${item.warning}` : ''}
                  {item.status === 'ok'
                    ? ` (${item.nodes?.length || 0} nœud(s))`
                    : ''}
                </li>
              ))}
            </ul>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {failedCount > 0 && (
                <button
                  type="button"
                  data-testid="batch-generate-retry"
                  onClick={() => void onRetryFailed()}
                  style={{
                    padding: '0.4rem 0.8rem',
                    borderRadius: 6,
                    border: `1px solid ${theme.border.primary}`,
                    background: theme.button.primary?.background || theme.button.default.background,
                    color: theme.button.primary?.color || theme.button.default.color,
                    cursor: 'pointer',
                  }}
                >
                  Réessayer les échecs
                </button>
              )}
              <button
                type="button"
                onClick={onClose}
                style={{
                  padding: '0.4rem 0.8rem',
                  borderRadius: 6,
                  border: `1px solid ${theme.border.primary}`,
                  background: theme.button.default.background,
                  color: theme.button.default.color,
                  cursor: 'pointer',
                }}
              >
                Fermer
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
