/**
 * Dérive un document_id depuis un titre, aligné sur
 * ``api/routers/dialogues.py`` (export unity) + ``validate_document_id``.
 *
 * Côté Python ``\w`` est Unicode ; on utilise ``\p{L}\p{N}`` pour rester compatible.
 */
export function documentIdFromTitle(title: string): string {
  const stripped = title.replace(/[^\p{L}\p{N}\s_-]/gu, '')
  const withUnderscores = stripped.replace(/[-\s]+/g, '_')
  const normalized = withUnderscores.replace(/\.json$/i, '').trim()
  if (!normalized) {
    throw new Error('Impossible de dériver un nom de fichier depuis le titre.')
  }
  if (normalized.length > 200) {
    throw new Error('Le titre produit un nom de fichier trop long.')
  }
  return normalized
}

/**
 * Suffixe numérique pour un id déjà pris : ``foo`` → ``foo_2``, ``foo_3``, …
 * ``n`` commence à 2 (le premier conflit).
 */
export function documentIdWithNumericSuffix(baseId: string, n: number): string {
  if (n < 2) {
    return baseId
  }
  const suffix = `_${n}`
  const maxBaseLen = Math.max(1, 200 - suffix.length)
  return `${baseId.slice(0, maxBaseLen)}${suffix}`
}

/**
 * Indique un 409 « dialogue déjà présent, utilisez PUT avec révision ».
 */
export function isCanonicalRevisionConflict(error: unknown): boolean {
  if (!error || typeof error !== 'object' || !('response' in error)) {
    return false
  }
  const response = (error as { response?: { status?: number; data?: unknown } }).response
  if (response?.status !== 409) {
    return false
  }
  const data = response.data
  if (!data || typeof data !== 'object') {
    return false
  }
  const record = data as Record<string, unknown>
  const detail = record.detail
  if (detail && typeof detail === 'object' && !Array.isArray(detail)) {
    const code = (detail as { code?: unknown }).code
    if (code === 'canonical_revision_required') {
      return true
    }
  }
  if (record.code === 'canonical_revision_required') {
    return true
  }
  const nested = record.error
  if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
    return (nested as { code?: unknown }).code === 'canonical_revision_required'
  }
  return false
}
