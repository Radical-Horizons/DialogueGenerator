/**
 * Erreurs « structure » (FR36) : surlignage rouge prioritaire sur le canvas.
 * FR37 : complétude de contenu (`missing_dialogue_text`, `missing_test`) → orange si aucune erreur structure sur le nœud.
 * `broken_reference` : rouge canvas via `getValidationHighlightKind` uniquement (pas dans `isStructuralValidationErrorType`, hors périmètre FR36).
 */
export const STRUCTURAL_VALIDATION_ERROR_TYPES = new Set<string>([
  'missing_display_name',
  'missing_stable_id',
])

/** Complétude contenu (FR37) — distinct du rouge structure. */
export const CONTENT_COMPLETENESS_ERROR_TYPES = new Set<string>([
  'missing_dialogue_text',
  'missing_test',
])

/** Contradictions / signaux lore (FR38 explicite + AC 4.3 #4 potentiel). */
export const LORE_EXPLICIT_ERROR_TYPES = new Set<string>([
  'lore_contradiction_explicit',
  'lore_contradiction_potential',
  'lore_potential_ambiguity',
])

export type ValidationHighlightKind = 'structural' | 'content' | 'lore'

/**
 * Priorité : structure (rouge) > complétude (orange) > lore (violet). Un seul kind actif par nœud.
 */
export function getValidationHighlightKind(errorTypes: readonly string[]): ValidationHighlightKind | null {
  if (
    errorTypes.some(
      (t) => STRUCTURAL_VALIDATION_ERROR_TYPES.has(t) || t === 'broken_reference'
    )
  ) {
    return 'structural'
  }
  if (errorTypes.some((t) => CONTENT_COMPLETENESS_ERROR_TYPES.has(t))) {
    return 'content'
  }
  if (errorTypes.some((t) => LORE_EXPLICIT_ERROR_TYPES.has(t))) {
    return 'lore'
  }
  return null
}

export function isStructuralValidationErrorType(type: string): boolean {
  return STRUCTURAL_VALIDATION_ERROR_TYPES.has(type)
}

/** FR40 : distinction visuelle orphelin (orange) vs îlot inatteignable (indigo). */
export type GraphTopologyWarningKind = 'orphan' | 'unreachable'

export function getGraphTopologyWarningKind(
  warningTypes: readonly string[]
): GraphTopologyWarningKind | null {
  const s = new Set(warningTypes)
  if (s.has('orphan_node')) {
    return 'orphan'
  }
  if (s.has('unreachable_node')) {
    return 'unreachable'
  }
  return null
}

export const GRAPH_TOPOLOGY_WARNING_STYLES: Record<
  GraphTopologyWarningKind,
  { border: string; background: string }
> = {
  orphan: { border: '#ff9800', background: 'rgba(255, 152, 0, 0.14)' },
  unreachable: { border: '#5c6bc0', background: 'rgba(92, 107, 192, 0.14)' },
}
