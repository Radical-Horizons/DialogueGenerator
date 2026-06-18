/**
 * Extraction d'erreurs API graphe / export Unity (Story 5.1).
 */
import type { APIError } from '../types/errors'

export const EXPORT_VALIDATION_BLOCKED_MESSAGE =
  'Erreurs de validation détectées — corriger avant export'

export const UNITY_PATH_UNAVAILABLE_MESSAGE =
  'Le chemin Unity n’est pas disponible (unity_dialogues_path). Vérifiez la configuration du projet.'

/** Extrait validation_errors depuis une ValidationException backend. */
export function extractValidationErrors(error: unknown): string[] | null {
  if (!error || typeof error !== 'object' || !('response' in error)) {
    return null
  }
  const axiosError = error as APIError
  const details = axiosError.response?.data?.error?.details as
    | { validation_errors?: unknown }
    | undefined
  const raw = details?.validation_errors
  if (!Array.isArray(raw)) {
    return null
  }
  const messages = raw.filter((e): e is string => typeof e === 'string' && e.length > 0)
  return messages.length > 0 ? messages : null
}

/** Détecte une erreur de chemin Unity non configuré (AC #4). */
export function isUnityPathUnavailableError(error: unknown): boolean {
  if (!error || typeof error !== 'object' || !('response' in error)) {
    return false
  }
  const axiosError = error as APIError
  const details = axiosError.response?.data?.error?.details as
    | { field?: unknown }
    | undefined
  if (details?.field === 'unity_dialogues_path') {
    return true
  }
  const message = axiosError.response?.data?.error?.message ?? ''
  return typeof message === 'string' && message.toLowerCase().includes('chemin unity')
}

/** Formate les erreurs validation batch pour affichage liste (Story 5.2). */
export function formatBatchExportFailureLabel(documentId: string, errors: string[]): string {
  const first = errors[0] ?? 'Erreur inconnue'
  return `${documentId} : ${first}`
}

/** Liste d'échecs batch pour toast / panneau (Story 5.2 AC #2). */
export function formatBatchFailuresSummary(
  failed: Array<{ id: string; errors: string[] }>,
): string {
  if (failed.length === 0) {
    return ''
  }
  const labels = failed.map((item) => formatBatchExportFailureLabel(item.id, item.errors))
  return `${failed.length} dialogue${failed.length !== 1 ? 's' : ''} non exporté${failed.length !== 1 ? 's' : ''} : ${labels.join('; ')}`
}
