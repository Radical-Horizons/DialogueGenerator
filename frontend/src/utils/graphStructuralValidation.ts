/**
 * Types d'erreurs de validation structurelle (FR36 / Epic 4).
 * Utilisés pour le surlignage canvas et le regroupement panneau.
 */
export const STRUCTURAL_VALIDATION_ERROR_TYPES = new Set<string>([
  'missing_display_name',
  'missing_stable_id',
  'missing_dialogue_text',
])

export function isStructuralValidationErrorType(type: string): boolean {
  return STRUCTURAL_VALIDATION_ERROR_TYPES.has(type)
}
