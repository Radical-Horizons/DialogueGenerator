/**
 * Bannière post-export single avec action Télécharger (Story 5.4 / FR52).
 */
import type { CSSProperties } from 'react'
import { theme } from '../../theme'
import { remSize } from '../../theme/uiTypography'
import { buildUnityExportFilename } from '../graph/graphEditorStandalone'
import type { LastExportDownload } from '../../hooks/useUnityExportDownload'

export interface ExportDownloadBannerProps {
  exportDownload: LastExportDownload
  isDownloading: boolean
  onDownload: () => void
  onDismiss: () => void
}

export function ExportDownloadBanner({
  exportDownload,
  isDownloading,
  onDownload,
  onDismiss,
}: ExportDownloadBannerProps) {
  const displayFilename = buildUnityExportFilename(exportDownload.filename)

  return (
    <div
      data-testid="export-download-banner"
      role="status"
      style={{
        margin: '0.35rem 0.5rem 0',
        padding: '0.55rem 0.65rem',
        borderRadius: '6px',
        border: `1px solid ${theme.border.primary}`,
        backgroundColor: theme.background.panelHeader,
        fontSize: remSize('small'),
        color: theme.text.primary,
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: '0.5rem',
      }}
    >
      <span>
        Export réussi —{' '}
        <strong data-testid="export-download-filename">{displayFilename}</strong>
      </span>
      <button
        type="button"
        data-testid="export-download-button"
        onClick={onDownload}
        disabled={isDownloading}
        style={actionButtonStyle}
      >
        Télécharger
      </button>
      {isDownloading && (
        <span data-testid="export-download-progress">Téléchargement en cours…</span>
      )}
      <button
        type="button"
        data-testid="export-download-dismiss"
        onClick={onDismiss}
        style={actionButtonStyle}
      >
        Fermer
      </button>
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
