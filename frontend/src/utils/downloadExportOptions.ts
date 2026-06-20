/**
 * Options persistées pour le téléchargement d'exports Unity (Story 5.4 / FR52).
 *
 * Préfixe clés localStorage : ``dg-export-*`` (distinct de batchExportOptions).
 */
import { buildUnityExportFilename } from '../components/graph/graphEditorStandalone'
import { normalizeDialogueFilenameKey } from './formatDialogueTitle'

export type BatchDownloadFormat = 'zip' | 'individual'

export type ZipCompressionLevel = 'store' | 'deflate'

export type DownloadFilenameStrategy = 'preserve' | 'slug'

export interface DownloadExportOptions {
  /** Format batch : archive ZIP ou fichiers JSON individuels. */
  batchFormat: BatchDownloadFormat
  /** Compression ZIP (backend zipfile). */
  zipCompression: ZipCompressionLevel
  /** Stratégie de nommage pour téléchargements individuels. */
  filenameStrategy: DownloadFilenameStrategy
}

export const DOWNLOAD_EXPORT_OPTIONS_STORAGE_KEY = 'dg-export-downloadOptions'

export const DEFAULT_DOWNLOAD_EXPORT_OPTIONS: DownloadExportOptions = {
  batchFormat: 'zip',
  zipCompression: 'deflate',
  filenameStrategy: 'preserve',
}

/** Charge les options de téléchargement depuis localStorage. */
export function loadDownloadExportOptions(): DownloadExportOptions {
  if (typeof localStorage === 'undefined') {
    return { ...DEFAULT_DOWNLOAD_EXPORT_OPTIONS }
  }
  try {
    const raw = localStorage.getItem(DOWNLOAD_EXPORT_OPTIONS_STORAGE_KEY)
    if (!raw) {
      return { ...DEFAULT_DOWNLOAD_EXPORT_OPTIONS }
    }
    const parsed = JSON.parse(raw) as Partial<DownloadExportOptions>
    return {
      batchFormat:
        parsed.batchFormat === 'individual' || parsed.batchFormat === 'zip'
          ? parsed.batchFormat
          : DEFAULT_DOWNLOAD_EXPORT_OPTIONS.batchFormat,
      zipCompression:
        parsed.zipCompression === 'store' || parsed.zipCompression === 'deflate'
          ? parsed.zipCompression
          : DEFAULT_DOWNLOAD_EXPORT_OPTIONS.zipCompression,
      filenameStrategy:
        parsed.filenameStrategy === 'slug' || parsed.filenameStrategy === 'preserve'
          ? parsed.filenameStrategy
          : DEFAULT_DOWNLOAD_EXPORT_OPTIONS.filenameStrategy,
    }
  } catch {
    return { ...DEFAULT_DOWNLOAD_EXPORT_OPTIONS }
  }
}

/** Persiste les options de téléchargement. */
export function saveDownloadExportOptions(options: DownloadExportOptions): void {
  if (typeof localStorage === 'undefined') {
    return
  }
  localStorage.setItem(DOWNLOAD_EXPORT_OPTIONS_STORAGE_KEY, JSON.stringify(options))
}

/** Slug fichier aligné sur ``batch_export_service._slug_from_title`` (backend). */
export function slugFromTitle(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .replace(/[-\s]+/g, '_')
    .slice(0, 100)
  return slug || 'dialogue'
}

export interface ResolveDownloadExportFilenameParams {
  strategy: DownloadFilenameStrategy
  sourceFilename: string
  title?: string | null
  jsonContent?: string | null
}

/** Résout le nom de fichier téléchargé selon la stratégie persistée (AC #4). */
export function resolveDownloadExportFilename({
  strategy,
  sourceFilename,
  title,
  jsonContent,
}: ResolveDownloadExportFilenameParams): string {
  const documentId = normalizeDialogueFilenameKey(sourceFilename)
  if (strategy === 'preserve') {
    return buildUnityExportFilename(sourceFilename)
  }

  let slugSource = title?.trim()
  if (!slugSource && jsonContent) {
    try {
      const document = JSON.parse(jsonContent) as {
        title?: unknown
        nodes?: Array<{ line?: unknown }>
      }
      if (typeof document.title === 'string' && document.title.trim()) {
        slugSource = document.title.trim()
      } else if (Array.isArray(document.nodes)) {
        for (const node of document.nodes) {
          if (node?.line) {
            slugSource = String(node.line)
            break
          }
        }
      }
    } catch {
      // JSON illisible : repli sur document_id
    }
  }

  if (slugSource) {
    return `${slugFromTitle(slugSource)}.json`
  }
  return buildUnityExportFilename(documentId)
}
