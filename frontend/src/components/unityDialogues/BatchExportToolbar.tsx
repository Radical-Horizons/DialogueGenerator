/**
 * Barre d'actions export batch Unity (Story 5.2).
 */
import type { CSSProperties } from 'react'
import { theme } from '../../theme'
import { remSize } from '../../theme/uiTypography'
import {
  type BatchExportOptions,
  formatBatchExportProgress,
} from '../../utils/batchExportOptions'
import type { BatchExportProgress } from '../../hooks/useBatchUnityExport'

export interface BatchExportToolbarProps {
  checkedCount: number
  filteredCount: number
  isBatchExporting: boolean
  batchProgress: BatchExportProgress | null
  showOptionsPanel: boolean
  batchOptions: BatchExportOptions
  onToggleSelectAll: () => void
  onStartExport: () => void
  onStartPreview?: () => void
  onCancelExport: () => void
  onToggleOptions: () => void
  onOptionsChange: (options: BatchExportOptions) => void
}

export function BatchExportToolbar({
  checkedCount,
  filteredCount,
  isBatchExporting,
  batchProgress,
  showOptionsPanel,
  batchOptions,
  onToggleSelectAll,
  onStartExport,
  onStartPreview,
  onCancelExport,
  onToggleOptions,
  onOptionsChange,
}: BatchExportToolbarProps) {
  const allSelected = filteredCount > 0 && checkedCount === filteredCount

  return (
    <div
      data-testid="batch-export-toolbar"
      style={{
        padding: '0.45rem 0.5rem',
        borderBottom: `1px solid ${theme.border.primary}`,
        backgroundColor: theme.background.panelHeader,
        display: 'flex',
        flexDirection: 'column',
        gap: '0.35rem',
      }}
    >
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', alignItems: 'center' }}>
        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.25rem',
            fontSize: remSize('small'),
            color: theme.text.secondary,
            cursor: 'pointer',
          }}
        >
          <input
            type="checkbox"
            data-testid="batch-select-all"
            checked={allSelected}
            onChange={onToggleSelectAll}
            disabled={isBatchExporting || filteredCount === 0}
          />
          Tout sélectionner
        </label>
        <button
          type="button"
          data-testid="batch-export-start"
          onClick={onStartExport}
          disabled={isBatchExporting || checkedCount === 0}
          style={toolbarButtonStyle}
        >
          Exporter batch
        </button>
        {onStartPreview && (
          <button
            type="button"
            data-testid="batch-preview-export"
            onClick={onStartPreview}
            disabled={isBatchExporting || checkedCount === 0}
            style={toolbarButtonStyle}
          >
            Prévisualiser export batch
          </button>
        )}
        {isBatchExporting && (
          <button
            type="button"
            data-testid="batch-export-stop"
            onClick={onCancelExport}
            style={{ ...toolbarButtonStyle, color: theme.state.error.color }}
          >
            Arrêter
          </button>
        )}
        <button
          type="button"
          data-testid="batch-export-options"
          onClick={onToggleOptions}
          disabled={isBatchExporting}
          style={toolbarButtonStyle}
        >
          Options export batch
        </button>
      </div>

      {isBatchExporting && batchProgress && (
        <div
          data-testid="batch-export-progress"
          style={{ fontSize: remSize('small'), color: theme.text.primary }}
        >
          {formatBatchExportProgress(batchProgress.current, batchProgress.total)}
        </div>
      )}

      {showOptionsPanel && (
        <div
          data-testid="batch-export-options-panel"
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
            <input
              type="checkbox"
              data-testid="batch-option-validate"
              checked={batchOptions.validateBeforeExport}
              onChange={(e) =>
                onOptionsChange({ ...batchOptions, validateBeforeExport: e.target.checked })
              }
            />
            Valider avant export
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <span>Nom de fichier :</span>
            <select
              data-testid="batch-option-filename-strategy"
              value={batchOptions.filenameStrategy}
              onChange={(e) =>
                onOptionsChange({
                  ...batchOptions,
                  filenameStrategy: e.target.value as BatchExportOptions['filenameStrategy'],
                })
              }
              style={{
                padding: '0.25rem',
                border: `1px solid ${theme.input.border}`,
                borderRadius: '4px',
                backgroundColor: theme.input.background,
                color: theme.input.color,
              }}
            >
              <option value="preserve">Conserver le filename existant</option>
              <option value="slug">Slug depuis le titre</option>
            </select>
          </label>
        </div>
      )}
    </div>
  )
}

const toolbarButtonStyle: CSSProperties = {
  padding: '0.35rem 0.55rem',
  fontSize: remSize('small'),
  border: `1px solid ${theme.border.primary}`,
  borderRadius: '6px',
  backgroundColor: theme.button.default.background,
  color: theme.button.default.color,
  cursor: 'pointer',
}
