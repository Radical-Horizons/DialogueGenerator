/**
 * Options persistées pour l'export batch Unity (Story 5.2 / AC #4).
 */
export type BatchFilenameStrategy = 'preserve' | 'slug'

export interface BatchExportOptions {
  /** Valider le schéma Unity avant écriture (défaut: true). */
  validateBeforeExport: boolean
  /** Stratégie de nommage des fichiers exportés. */
  filenameStrategy: BatchFilenameStrategy
}

export const BATCH_EXPORT_OPTIONS_STORAGE_KEY = 'dialogueGenerator.batchExportOptions'

export const DEFAULT_BATCH_EXPORT_OPTIONS: BatchExportOptions = {
  validateBeforeExport: true,
  filenameStrategy: 'preserve',
}

/** Charge les options batch depuis localStorage (valeurs par défaut si absent). */
export function loadBatchExportOptions(): BatchExportOptions {
  if (typeof localStorage === 'undefined') {
    return { ...DEFAULT_BATCH_EXPORT_OPTIONS }
  }
  try {
    const raw = localStorage.getItem(BATCH_EXPORT_OPTIONS_STORAGE_KEY)
    if (!raw) {
      return { ...DEFAULT_BATCH_EXPORT_OPTIONS }
    }
    const parsed = JSON.parse(raw) as Partial<BatchExportOptions>
    return {
      validateBeforeExport:
        typeof parsed.validateBeforeExport === 'boolean'
          ? parsed.validateBeforeExport
          : DEFAULT_BATCH_EXPORT_OPTIONS.validateBeforeExport,
      filenameStrategy:
        parsed.filenameStrategy === 'slug' || parsed.filenameStrategy === 'preserve'
          ? parsed.filenameStrategy
          : DEFAULT_BATCH_EXPORT_OPTIONS.filenameStrategy,
    }
  } catch {
    return { ...DEFAULT_BATCH_EXPORT_OPTIONS }
  }
}

/** Persiste les options batch dans localStorage. */
export function saveBatchExportOptions(options: BatchExportOptions): void {
  if (typeof localStorage === 'undefined') {
    return
  }
  localStorage.setItem(BATCH_EXPORT_OPTIONS_STORAGE_KEY, JSON.stringify(options))
}

/** Libellé résumé export batch terminé (AC #3). */
export function formatBatchExportSummary(
  exportedCount: number,
  failedCount: number,
  cancelled: boolean,
): string {
  if (cancelled) {
    return `Export batch annulé : ${exportedCount} dialogue${exportedCount !== 1 ? 's' : ''} exporté${exportedCount !== 1 ? 's' : ''} avant l'arrêt`
  }
  const failurePart =
    failedCount > 0
      ? `, ${failedCount} échec${failedCount !== 1 ? 's' : ''}`
      : ''
  return `Export batch terminé : ${exportedCount} dialogue${exportedCount !== 1 ? 's' : ''} exporté${exportedCount !== 1 ? 's' : ''}${failurePart}`
}

/** Libellé progression export batch (AC #1). */
export function formatBatchExportProgress(current: number, total: number): string {
  return `Export batch : ${current}/${total} dialogue${total !== 1 ? 's' : ''}`
}
