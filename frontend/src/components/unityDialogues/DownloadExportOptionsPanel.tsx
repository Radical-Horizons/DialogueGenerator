/**
 * Panneau options téléchargement export (Story 5.4 / FR52).
 */
import type { CSSProperties } from 'react'
import { theme } from '../../theme'
import { remSize } from '../../theme/uiTypography'
import type { DownloadExportOptions } from '../../utils/downloadExportOptions'

export interface DownloadExportOptionsPanelProps {
  options: DownloadExportOptions
  onChange: (options: DownloadExportOptions) => void
}

export function DownloadExportOptionsPanel({
  options,
  onChange,
}: DownloadExportOptionsPanelProps) {
  return (
    <div
      data-testid="download-export-options-panel"
      style={{
        padding: '0.5rem',
        border: `1px solid ${theme.border.primary}`,
        borderRadius: '6px',
        backgroundColor: theme.background.primary,
        display: 'flex',
        flexDirection: 'column',
        gap: '0.35rem',
        fontSize: remSize('small'),
      }}
    >
      <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
        <span>Format batch :</span>
        <select
          data-testid="download-option-batch-format"
          value={options.batchFormat}
          onChange={(e) =>
            onChange({
              ...options,
              batchFormat: e.target.value as DownloadExportOptions['batchFormat'],
            })
          }
          style={selectStyle}
        >
          <option value="zip">Archive ZIP</option>
          <option value="individual">JSON individuels</option>
        </select>
      </label>
      <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
        <span>Compression ZIP :</span>
        <select
          data-testid="download-option-zip-compression"
          value={options.zipCompression}
          onChange={(e) =>
            onChange({
              ...options,
              zipCompression: e.target.value as DownloadExportOptions['zipCompression'],
            })
          }
          disabled={options.batchFormat === 'individual'}
          style={selectStyle}
        >
          <option value="deflate">Deflate (compressé)</option>
          <option value="store">Store (sans compression)</option>
        </select>
      </label>
      <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
        <span>Nom de fichier :</span>
        <select
          data-testid="download-option-filename-strategy"
          value={options.filenameStrategy}
          onChange={(e) =>
            onChange({
              ...options,
              filenameStrategy: e.target.value as DownloadExportOptions['filenameStrategy'],
            })
          }
          style={selectStyle}
        >
          <option value="preserve">Conserver le filename existant</option>
          <option value="slug">Slug depuis le titre</option>
        </select>
      </label>
    </div>
  )
}

const selectStyle: CSSProperties = {
  padding: '0.25rem',
  border: `1px solid ${theme.input.border}`,
  borderRadius: '4px',
  backgroundColor: theme.input.background,
  color: theme.input.color,
}
