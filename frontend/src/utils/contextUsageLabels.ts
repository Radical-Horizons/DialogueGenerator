/**
 * Libellés FR pour les types d’entité GDD (panneau usage sections, FR17).
 */
const ENTITY_TYPE_LABELS: Record<string, string> = {
  characters: 'Personnages',
  locations: 'Lieux',
  regions: 'Régions',
  themes: 'Thèmes',
  items: 'Objets',
  species: 'Espèces',
  communities: 'Communautés',
  other: 'Contexte',
}

/**
 * @param entityType - Clé API (ex. ``characters``).
 * @returns Libellé utilisateur ou la clé si inconnue.
 */
export function labelForEntityType(entityType: string): string {
  return ENTITY_TYPE_LABELS[entityType] ?? entityType
}
