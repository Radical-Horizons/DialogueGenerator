import type { ValidationErrorDetail } from '../../types/graph'

/** Libellés et icônes par type d’erreur (FR36 structure + FR37 complétude). */
export const ICON_FOR_TYPE: Record<string, string> = {
  orphan_node: '🔗',
  broken_reference: '🔴',
  empty_node: '⚪',
  missing_display_name: '📝',
  missing_stable_id: '🆔',
  missing_dialogue_text: '💬',
  missing_test: '❓',
  unreachable_node: '📍',
  cycle_detected: '🔄',
}

export const LABEL_FOR_TYPE: Record<string, string> = {
  orphan_node: 'Nœud orphelin détecté',
  broken_reference: 'Références cassées',
  empty_node: 'Nœuds vides',
  missing_display_name: 'DisplayName manquant',
  missing_stable_id: 'StableID / identifiant document',
  missing_dialogue_text: 'Contenu dialogue vide (FR37)',
  missing_test: 'Test d’attribut manquant (FR37)',
  unreachable_node: 'Nœuds inaccessibles',
  cycle_detected: 'Cycles détectés',
}

export function isDocumentIdRepairable(err: ValidationErrorDetail): boolean {
  return (
    err.type === 'missing_stable_id' &&
    Boolean(err.node_id) &&
    (err.message.includes('data.id') || err.message.includes('identifiant document'))
  )
}

export function getIconForType(type: string): string {
  return ICON_FOR_TYPE[type] ?? '⚠️'
}

export function getLabelForType(type: string): string {
  return LABEL_FOR_TYPE[type] ?? 'Autres'
}
