/**
 * Items export batch Unity pour le menu Actions global (Header).
 */
import type { CSSProperties } from 'react'
import { theme } from '../../theme'
import { remSize } from '../../theme/uiTypography'
import type { UnityBatchExportMenuSnapshot } from '../../store/unityBatchExportMenuStore'

function menuItemStyle(active: boolean, disabled: boolean): CSSProperties {
  return {
    width: '100%',
    padding: '0.5rem 0.75rem',
    fontSize: remSize('accent'),
    backgroundColor: active ? theme.background.secondary : 'transparent',
    color: disabled ? theme.text.secondary : theme.text.primary,
    border: 'none',
    textAlign: 'left',
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.6 : 1,
  }
}

function menuSeparatorStyle(): CSSProperties {
  return {
    height: 1,
    margin: '0.25rem 0.5rem',
    backgroundColor: theme.border.primary,
  }
}

export interface UnityBatchExportActionsMenuItemsProps {
  batch: UnityBatchExportMenuSnapshot
  onClose: () => void
}

export function UnityBatchExportActionsMenuItems({
  batch,
  onClose,
}: UnityBatchExportActionsMenuItemsProps) {
  const batchDisabled = batch.isBatchExporting
  const batchExportDisabled = batchDisabled || batch.checkedCount === 0

  const run = (fn: () => void) => {
    onClose()
    fn()
  }

  return (
    <>
      <div role="separator" style={menuSeparatorStyle()} />
      <button
        type="button"
        data-testid="batch-select-all"
        onClick={(e) => {
          e.stopPropagation()
          run(batch.actions.onToggleSelectAll)
        }}
        disabled={batchDisabled || batch.filteredCount === 0}
        style={menuItemStyle(batch.allSelected, batchDisabled || batch.filteredCount === 0)}
        onMouseEnter={(e) => {
          if (!batchDisabled && batch.filteredCount > 0) {
            e.currentTarget.style.backgroundColor = theme.background.secondary
          }
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = batch.allSelected
            ? theme.background.secondary
            : 'transparent'
        }}
      >
        {batch.allSelected ? '☑ Tout désélectionner' : '☐ Tout sélectionner'}
        {batch.checkedCount > 0 ? ` (${batch.checkedCount})` : ''}
      </button>
      <button
        type="button"
        data-testid="batch-export-start"
        onClick={(e) => {
          e.stopPropagation()
          run(batch.actions.onStartExport)
        }}
        disabled={batchExportDisabled}
        style={menuItemStyle(false, batchExportDisabled)}
        onMouseEnter={(e) => {
          if (!batchExportDisabled) e.currentTarget.style.backgroundColor = theme.background.secondary
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = 'transparent'
        }}
      >
        Exporter batch
      </button>
      <button
        type="button"
        data-testid="batch-preview-export"
        onClick={(e) => {
          e.stopPropagation()
          run(batch.actions.onStartPreview)
        }}
        disabled={batchExportDisabled}
        style={menuItemStyle(false, batchExportDisabled)}
        onMouseEnter={(e) => {
          if (!batchExportDisabled) e.currentTarget.style.backgroundColor = theme.background.secondary
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = 'transparent'
        }}
      >
        Prévisualiser export batch
      </button>
      {batch.isBatchExporting && (
        <button
          type="button"
          data-testid="batch-export-stop"
          onClick={(e) => {
            e.stopPropagation()
            run(batch.actions.onCancelExport)
          }}
          style={{ ...menuItemStyle(false, false), color: theme.state.error.color }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = theme.background.secondary
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'transparent'
          }}
        >
          Arrêter l&apos;export batch
        </button>
      )}
      <button
        type="button"
        data-testid="batch-export-options"
        onClick={(e) => {
          e.stopPropagation()
          run(batch.actions.onToggleBatchOptions)
        }}
        disabled={batchDisabled}
        style={menuItemStyle(batch.showBatchOptionsPanel, batchDisabled)}
        onMouseEnter={(e) => {
          if (!batchDisabled) e.currentTarget.style.backgroundColor = theme.background.secondary
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = batch.showBatchOptionsPanel
            ? theme.background.secondary
            : 'transparent'
        }}
      >
        Options export batch
      </button>
      <button
        type="button"
        data-testid="export-logs-toggle"
        onClick={(e) => {
          e.stopPropagation()
          run(batch.actions.onOpenExportLogs)
        }}
        style={menuItemStyle(false, false)}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = theme.background.secondary
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = 'transparent'
        }}
      >
        Logs d&apos;export
      </button>
      <button
        type="button"
        data-testid="download-export-options-toggle"
        onClick={(e) => {
          e.stopPropagation()
          run(batch.actions.onToggleDownloadOptions)
        }}
        style={menuItemStyle(batch.showDownloadOptionsPanel, false)}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = theme.background.secondary
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = batch.showDownloadOptionsPanel
            ? theme.background.secondary
            : 'transparent'
        }}
      >
        Options téléchargement
      </button>
    </>
  )
}
