/**
 * « Tout sélectionner » du menu Actions : une case visuelle, plus de glyphes ☐/☑.
 */
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { UnityBatchExportActionsMenuItems } from './UnityBatchExportActionsMenuItems'
import type { UnityBatchExportMenuSnapshot } from '../../store/unityBatchExportMenuStore'

function makeBatch(overrides: Partial<UnityBatchExportMenuSnapshot> = {}): UnityBatchExportMenuSnapshot {
  return {
    filteredCount: 3,
    checkedCount: 0,
    isBatchExporting: false,
    batchProgressLabel: null,
    allSelected: false,
    showBatchOptionsPanel: false,
    showDownloadOptionsPanel: false,
    actions: {
      onToggleSelectAll: vi.fn(),
      onStartExport: vi.fn(),
      onStartPreview: vi.fn(),
      onCancelExport: vi.fn(),
      onToggleBatchOptions: vi.fn(),
      onOpenExportLogs: vi.fn(),
      onToggleDownloadOptions: vi.fn(),
    },
    ...overrides,
  }
}

describe('UnityBatchExportActionsMenuItems', () => {
  it('rend « Tout sélectionner » avec une case vide, sans glyphe', () => {
    render(<UnityBatchExportActionsMenuItems batch={makeBatch()} onClose={vi.fn()} />)
    const button = screen.getByTestId('batch-select-all')
    expect(button).toHaveTextContent('Tout sélectionner')
    expect(button.textContent).not.toMatch(/[☐☑]/)
    expect(screen.getByTestId('batch-select-all-mark')).toBeEmptyDOMElement()
  })

  it('coche la case et inverse le libellé quand tout est sélectionné', () => {
    const batch = makeBatch({ allSelected: true, checkedCount: 3 })
    const onClose = vi.fn()
    render(<UnityBatchExportActionsMenuItems batch={batch} onClose={onClose} />)
    const button = screen.getByTestId('batch-select-all')
    expect(button).toHaveTextContent('Tout désélectionner (3)')
    expect(screen.getByTestId('batch-select-all-mark')).toHaveTextContent('✓')

    fireEvent.click(button)
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(batch.actions.onToggleSelectAll).toHaveBeenCalledTimes(1)
  })
})
