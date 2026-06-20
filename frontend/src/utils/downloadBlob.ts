/**
 * Téléchargement blob client avec indicateur pour fichiers volumineux (Story 5.4 / FR52).
 */

/** Seuil au-delà duquel l'UI affiche « Téléchargement en cours… » (AC #5). */
export const LARGE_DOWNLOAD_THRESHOLD_BYTES = 10 * 1024 * 1024

/** Durée minimale d'affichage de l'indicateur pour gros fichiers (AC #5). */
const LARGE_DOWNLOAD_PROGRESS_MIN_MS = 100

export interface TriggerBlobDownloadOptions {
  blob: Blob
  filename: string
  onProgressStart?: () => void
  onProgressEnd?: () => void
}

function deferProgressEnd(onProgressEnd: (() => void) | undefined, startedAt: number): Promise<void> {
  if (!onProgressEnd) {
    return Promise.resolve()
  }
  const elapsed = Date.now() - startedAt
  const delay = Math.max(0, LARGE_DOWNLOAD_PROGRESS_MIN_MS - elapsed)
  return new Promise((resolve) => {
    setTimeout(() => {
      onProgressEnd()
      resolve()
    }, delay)
  })
}

/** Déclenche un téléchargement navigateur à partir d'un Blob (async, progression AC #5). */
export async function triggerBlobDownloadAsync({
  blob,
  filename,
  onProgressStart,
  onProgressEnd,
}: TriggerBlobDownloadOptions): Promise<void> {
  const isLarge = blob.size >= LARGE_DOWNLOAD_THRESHOLD_BYTES
  const startedAt = Date.now()
  if (isLarge) {
    onProgressStart?.()
  }
  try {
    const objectUrl = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = objectUrl
    link.download = filename
    link.click()
    setTimeout(() => URL.revokeObjectURL(objectUrl), 0)
  } finally {
    if (isLarge) {
      await deferProgressEnd(onProgressEnd, startedAt)
    } else {
      onProgressEnd?.()
    }
  }
}

/** Déclenche un téléchargement navigateur à partir d'un Blob. */
export function triggerBlobDownload(options: TriggerBlobDownloadOptions): void {
  void triggerBlobDownloadAsync(options)
}

/**
 * Télécharge un blob obtenu via fetch/API avec état loading pour gros fichiers.
 *
 * @param fetchBlob - Fonction retournant le blob à télécharger.
 * @param filename - Nom de fichier cible.
 * @param onLoadingChange - Callback état loading (true pendant l'opération).
 */
export async function downloadWithProgress(
  fetchBlob: () => Promise<Blob>,
  filename: string,
  onLoadingChange: (loading: boolean) => void,
): Promise<void> {
  onLoadingChange(true)
  try {
    const blob = await fetchBlob()
    await triggerBlobDownloadAsync({
      blob,
      filename,
      onProgressStart: () => onLoadingChange(true),
      onProgressEnd: () => onLoadingChange(false),
    })
  } catch (error) {
    onLoadingChange(false)
    throw error
  }
}
