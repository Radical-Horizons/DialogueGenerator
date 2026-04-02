/**
 * Helpers pour le mode standalone de l'éditeur de graphe.
 */

export interface GraphRouteTarget {
  decodedDialogueId: string
  normalizedDialogueId: string
}

/**
 * Normalise un identifiant d'URL pour charger un dialogue ou document.
 */
export function resolveGraphRouteTarget(
  rawDialogueId?: string | null
): GraphRouteTarget | null {
  const trimmedDialogueId = rawDialogueId?.trim()
  if (!trimmedDialogueId) return null

  const decodedDialogueId = decodeURIComponent(trimmedDialogueId)
  const normalizedDialogueId = decodedDialogueId.replace(/\.json$/i, '')
  if (!normalizedDialogueId) return null

  return {
    decodedDialogueId,
    normalizedDialogueId,
  }
}

/**
 * Construit le nom de fichier pour un export Unity.
 */
export function buildUnityExportFilename(filename?: string | null): string {
  const trimmedFilename = filename?.trim()
  if (!trimmedFilename) {
    return 'dialogue_export.json'
  }

  return /\.json$/i.test(trimmedFilename)
    ? trimmedFilename
    : `${trimmedFilename}.json`
}

/**
 * Télécharge le JSON Unity courant sur le poste client.
 */
export function downloadUnityExport(
  jsonContent: string,
  filename?: string | null
): void {
  const blob = new Blob([jsonContent], { type: 'application/json' })
  const objectUrl = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = objectUrl
  link.download = buildUnityExportFilename(filename)
  link.click()
  setTimeout(() => URL.revokeObjectURL(objectUrl), 0)
}
