/**
 * Téléchargement batch/individuel des exports Unity (Story 5.4 / FR52).
 */
import {
  batchDownloadUnityDialogues,
  downloadUnityDialogue,
} from '../api/dialogues'
import { triggerBlobDownloadAsync, downloadWithProgress } from './downloadBlob'
import type { DownloadExportOptions } from './downloadExportOptions'
import { resolveDownloadExportFilename } from './downloadExportOptions'
import { normalizeDialogueFilenameKey } from './formatDialogueTitle'

async function resolveDownloadFilenameFromBlob(
  options: DownloadExportOptions,
  sourceFilename: string,
  blob: Blob,
  title?: string | null,
): Promise<string> {
  if (options.filenameStrategy === 'preserve') {
    return resolveDownloadExportFilename({
      strategy: 'preserve',
      sourceFilename,
    })
  }
  const jsonContent = await blob.text()
  return resolveDownloadExportFilename({
    strategy: 'slug',
    sourceFilename,
    title,
    jsonContent,
  })
}

/** Télécharge tous les fichiers exportés selon les options persistées. */
export async function downloadAllExportedFiles(
  exportedFilenames: string[],
  options: DownloadExportOptions,
  onLoadingChange: (loading: boolean) => void,
): Promise<void> {
  if (exportedFilenames.length === 0) {
    return
  }

  if (options.batchFormat === 'zip' && exportedFilenames.length > 1) {
    await downloadWithProgress(
      () =>
        batchDownloadUnityDialogues({
          filenames: exportedFilenames,
          compression: options.zipCompression,
        }),
      'unity-dialogues-export.zip',
      onLoadingChange,
    )
    return
  }

  onLoadingChange(true)
  try {
    for (const filename of exportedFilenames) {
      const documentId = normalizeDialogueFilenameKey(filename)
      const blob = await downloadUnityDialogue(documentId)
      const downloadFilename = await resolveDownloadFilenameFromBlob(options, filename, blob)
      await triggerBlobDownloadAsync({
        blob,
        filename: downloadFilename,
        onProgressStart: () => onLoadingChange(true),
        onProgressEnd: () => onLoadingChange(false),
      })
    }
  } finally {
    onLoadingChange(false)
  }
}

/** Télécharge un dialogue persisté via l'API GET download. */
export async function downloadPersistedUnityDialogue(
  documentId: string,
  filename: string,
  options: DownloadExportOptions,
  onLoadingChange: (loading: boolean) => void,
  title?: string | null,
): Promise<void> {
  onLoadingChange(true)
  try {
    const blob = await downloadUnityDialogue(documentId)
    const downloadFilename = await resolveDownloadFilenameFromBlob(options, filename, blob, title)
    await triggerBlobDownloadAsync({
      blob,
      filename: downloadFilename,
      onProgressStart: () => onLoadingChange(true),
      onProgressEnd: () => onLoadingChange(false),
    })
  } catch (error) {
    onLoadingChange(false)
    throw error
  }
}
