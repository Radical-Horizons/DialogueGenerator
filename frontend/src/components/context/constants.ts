/**
 * Constantes du panneau Contexte GDD (FR11).
 * Source unique pour le libellé affiché dans le Dashboard.
 */
export const GDD_CONTEXT_PANEL_TITLE = 'Contexte GDD' as const

/**
 * Clés GDD considérées comme propriétés courtes (colonnes table Notion).
 * Affichées en bloc unique "Propriétés" au lieu de boîtes dépliantes.
 */
export const GDD_INLINE_PROPERTY_KEYS: Set<string> = new Set([
  'Âge',
  'Alias',
  'Archétype littéraire',
  'Axe idéologique',
  'Communautés',
  'Défauts',
  'Détient',
  'Espèce',
  'État',
  'Genre',
  'Langage',
  'Lieux de vie',
  'Occupation',
  'Qualités',
  'Relations principales',
  'Réponse au problème moral',
  'Résumé',
  'Référence visuelle',
  'Scènes',
  'Sprint actif ? (formule)',
  'Type',
  'Assets',
  'Région',
  'Catégorie',
])
