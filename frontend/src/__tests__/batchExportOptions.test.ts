/**
 * Story 5.2 — options export batch persistées (AC #4).
 */
import { describe, it, expect, beforeEach } from 'vitest'
import {
  BATCH_EXPORT_OPTIONS_STORAGE_KEY,
  DEFAULT_BATCH_EXPORT_OPTIONS,
  loadBatchExportOptions,
  saveBatchExportOptions,
  formatBatchExportProgress,
  formatBatchExportSummary,
} from '../utils/batchExportOptions'

describe('batchExportOptions', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('retourne les valeurs par défaut si localStorage vide', () => {
    expect(loadBatchExportOptions()).toEqual(DEFAULT_BATCH_EXPORT_OPTIONS)
  })

  it('persiste et recharge validateBeforeExport + filenameStrategy', () => {
    saveBatchExportOptions({
      validateBeforeExport: false,
      filenameStrategy: 'slug',
    })
    expect(localStorage.getItem(BATCH_EXPORT_OPTIONS_STORAGE_KEY)).toBeTruthy()
    expect(loadBatchExportOptions()).toEqual({
      validateBeforeExport: false,
      filenameStrategy: 'slug',
    })
  })

  it('formatBatchExportProgress affiche current/total', () => {
    expect(formatBatchExportProgress(1, 3)).toBe('Export batch : 1/3 dialogues')
  })

  it('formatBatchExportSummary inclut échecs et annulation', () => {
    expect(formatBatchExportSummary(2, 1, false)).toBe(
      'Export batch terminé : 2 dialogues exportés, 1 échec',
    )
    expect(formatBatchExportSummary(2, 0, true)).toBe(
      "Export batch annulé : 2 dialogues exportés avant l'arrêt",
    )
  })
})
