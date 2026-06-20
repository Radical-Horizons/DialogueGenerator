/**
 * Modal preview export Unity single ou batch (Story 5.5 / FR53).
 */
import { memo, useCallback, useState } from 'react'
import { theme } from '../../theme'
import { useNarrowInlineSize } from '../../hooks/useNarrowInlineSize'
import { modalTypography } from '../../theme/responsiveChrome'
import { formatBytes } from '../../utils/formatBytes'
import { LARGE_DOWNLOAD_THRESHOLD_BYTES } from '../../utils/downloadBlob'
import type { ExportPreviewResponse } from '../../types/graph'
import type { BatchExportPreviewResponse } from '../../types/api'
import * as dialoguesAPI from '../../api/dialogues'
import { ExportPreviewJsonTree } from './ExportPreviewJsonTree'

const modalStyle: React.CSSProperties = {
  position: 'fixed',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  backgroundColor: 'rgba(0, 0, 0, 0.6)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 2000,
}

const panelStyle: React.CSSProperties = {
  backgroundColor: theme.background.panel,
  padding: '1.5rem',
  borderRadius: '8px',
  minWidth: '420px',
  width: 'min(92vw, 760px)',
  maxHeight: '88vh',
  overflow: 'auto',
  border: `1px solid ${theme.border.primary}`,
}

export type ExportPreviewModalMode = 'single' | 'batch'

export interface ExportPreviewModalProps {
  isOpen: boolean
  mode: ExportPreviewModalMode
  isLoading?: boolean
  error?: string | null
  singlePreview?: ExportPreviewResponse | null
  batchPreview?: BatchExportPreviewResponse | null
  isExporting?: boolean
  onClose: () => void
  onExport?: () => void
}

export const ExportPreviewModal = memo(function ExportPreviewModal({
  isOpen,
  mode,
  isLoading = false,
  error = null,
  singlePreview = null,
  batchPreview = null,
  isExporting = false,
  onClose,
  onExport,
}: ExportPreviewModalProps) {
  const { ref: panelRef, isNarrow } = useNarrowInlineSize(520)
  const typo = isNarrow ? modalTypography.narrow : modalTypography.comfortable
  const [copied, setCopied] = useState(false)
  const [expandedBatchItems, setExpandedBatchItems] = useState<Set<string>>(() => new Set())

  const copyText =
    mode === 'single' && singlePreview ? singlePreview.json_content : null

  const handleCopy = useCallback(async () => {
    if (!copyText) return
    try {
      await navigator.clipboard.writeText(copyText)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Copy failed:', err)
    }
  }, [copyText])

  const handleCopyBatchItem = useCallback(
    async (documentId: string, jsonPreview: string, truncated: boolean) => {
      try {
        let text = jsonPreview
        if (truncated) {
          const full = await dialoguesAPI.previewUnityDialogueExport(documentId)
          text = full.json_content
        }
        await navigator.clipboard.writeText(text)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      } catch (err) {
        console.error('Copy failed:', err)
      }
    },
    [],
  )

  const toggleBatchItem = useCallback((documentId: string) => {
    setExpandedBatchItems((prev) => {
      const next = new Set(prev)
      if (next.has(documentId)) {
        next.delete(documentId)
      } else {
        next.add(documentId)
      }
      return next
    })
  }, [])

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget && !isExporting) onClose()
  }

  if (!isOpen) return null

  const sizeBytes =
    mode === 'single' && singlePreview
      ? singlePreview.size_bytes
      : batchPreview?.total_size_bytes ?? 0
  const showLargeWarning = sizeBytes >= LARGE_DOWNLOAD_THRESHOLD_BYTES

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="export-preview-modal-title"
      style={modalStyle}
      onClick={handleBackdropClick}
      data-testid="export-preview-modal"
    >
      <div
        ref={panelRef}
        onClick={(e) => e.stopPropagation()}
        style={{
          ...panelStyle,
          padding: isNarrow ? '0.9rem' : panelStyle.padding,
          minWidth: isNarrow ? 'unset' : panelStyle.minWidth,
        }}
      >
        <h3
          id="export-preview-modal-title"
          style={{
            marginTop: 0,
            marginBottom: '1rem',
            color: theme.text.primary,
            fontSize: `${typo.titleFontRem}rem`,
          }}
        >
          {mode === 'batch' ? 'Prévisualisation export batch' : 'Prévisualisation export'}
        </h3>

        {isLoading && (
          <p
            data-testid="export-preview-loading"
            style={{ color: theme.text.secondary, fontSize: `${typo.bodyFontRem}rem` }}
          >
            Chargement…
          </p>
        )}

        {error && (
          <p role="alert" data-testid="export-preview-error" style={{ color: theme.state.error.color }}>
            {error}
          </p>
        )}

        {showLargeWarning && (
          <p
            role="status"
            data-testid="export-preview-large-warning"
            style={{
              padding: '0.5rem 0.75rem',
              marginBottom: '1rem',
              backgroundColor: theme.state.warning?.background ?? 'rgba(241, 196, 15, 0.15)',
              border: `1px solid ${theme.state.warning?.color ?? '#F1C40F'}`,
              borderRadius: '4px',
              fontSize: `${typo.bodyFontRem}rem`,
            }}
          >
            Fichier volumineux — téléchargement peut être lent
          </p>
        )}

        {mode === 'single' && singlePreview && !isLoading && (
          <div data-testid="export-preview-single-meta">
            <p style={{ fontSize: `${typo.bodyFontRem}rem`, color: theme.text.secondary }}>
              <span data-testid="export-preview-node-count">{singlePreview.node_count}</span> nœud
              {singlePreview.node_count !== 1 ? 's' : ''} ·{' '}
              <span data-testid="export-preview-size">{formatBytes(singlePreview.size_bytes)}</span> ·{' '}
              {singlePreview.filename}
            </p>
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem' }}>
              <button
                type="button"
                data-testid="export-preview-copy"
                onClick={() => void handleCopy()}
                disabled={!copyText}
                style={{
                  padding: '0.35rem 0.75rem',
                  borderRadius: '4px',
                  border: `1px solid ${theme.border.primary}`,
                  background: theme.background.secondary,
                  cursor: copyText ? 'pointer' : 'not-allowed',
                }}
              >
                {copied ? 'Copié !' : 'Copier'}
              </button>
            </div>
            <ExportPreviewJsonTree jsonContent={singlePreview.json_content} />
          </div>
        )}

        {mode === 'batch' && batchPreview && !isLoading && (
          <div data-testid="export-preview-batch-summary">
            <p style={{ fontSize: `${typo.bodyFontRem}rem`, color: theme.text.secondary }}>
              <span data-testid="export-preview-batch-count">{batchPreview.dialogue_count}</span>{' '}
              dialogue{batchPreview.dialogue_count !== 1 ? 's' : ''} · Total{' '}
              <span data-testid="export-preview-batch-total-size">
                {formatBytes(batchPreview.total_size_bytes)}
              </span>
            </p>
            <ul style={{ listStyle: 'none', padding: 0, margin: '0.75rem 0 0' }}>
              {batchPreview.items.map((item) => {
                const expanded = expandedBatchItems.has(item.document_id)
                return (
                  <li
                    key={item.document_id}
                    style={{
                      marginBottom: '0.5rem',
                      border: `1px solid ${theme.border.primary}`,
                      borderRadius: '6px',
                      padding: '0.5rem',
                    }}
                    data-testid={`export-preview-batch-item-${item.document_id}`}
                  >
                    <button
                      type="button"
                      style={{
                        background: 'transparent',
                        border: 'none',
                        width: '100%',
                        textAlign: 'left',
                        cursor: 'pointer',
                        color: theme.text.primary,
                      }}
                      onClick={() => toggleBatchItem(item.document_id)}
                    >
                      {expanded ? '▼' : '▶'} {item.filename} — {formatBytes(item.size_bytes)} —{' '}
                      {item.node_count} nœud{item.node_count !== 1 ? 's' : ''}
                    </button>
                    {expanded && (
                      <div style={{ marginTop: '0.5rem' }}>
                        <button
                          type="button"
                          data-testid={`export-preview-batch-copy-${item.document_id}`}
                          onClick={() =>
                            void handleCopyBatchItem(
                              item.document_id,
                              item.json_preview,
                              item.json_preview_truncated,
                            )
                          }
                          style={{
                            marginBottom: '0.35rem',
                            padding: '0.25rem 0.5rem',
                            fontSize: '0.75rem',
                          }}
                        >
                          {item.json_preview_truncated ? 'Copier JSON complet' : 'Copier'}
                        </button>
                        {item.json_preview_truncated && (
                          <p style={{ fontSize: '0.75rem', color: theme.text.secondary }}>
                            Aperçu tronqué — export complet via bibliothèque
                          </p>
                        )}
                        <ExportPreviewJsonTree
                          jsonContent={item.json_preview}
                          testIdPrefix={`batch-${item.document_id}`}
                        />
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          </div>
        )}

        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '0.5rem',
            marginTop: '1.25rem',
          }}
        >
          {mode === 'single' && onExport && (
            <button
              type="button"
              data-testid="export-preview-export-button"
              disabled={isExporting || isLoading || !singlePreview?.schema_valid}
              onClick={() => void onExport()}
              style={{
                padding: '0.5rem 1rem',
                borderRadius: '4px',
                border: 'none',
                background: theme.button.primary.background,
                color: theme.button.primary.text,
                cursor: isExporting ? 'wait' : 'pointer',
              }}
            >
              {isExporting ? 'Export…' : 'Exporter'}
            </button>
          )}
          <button
            type="button"
            data-testid="export-preview-close"
            disabled={isExporting}
            onClick={onClose}
            style={{
              padding: '0.5rem 1rem',
              borderRadius: '4px',
              border: `1px solid ${theme.border.primary}`,
              background: theme.background.secondary,
              cursor: 'pointer',
            }}
          >
            Fermer
          </button>
        </div>
      </div>
    </div>
  )
})
