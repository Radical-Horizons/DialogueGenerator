/**
 * Fixture `ContextSelection` pour les tests.
 *
 * Le type compte 15 listes obligatoires : les tests qui en écrivaient un littéral
 * complet cassaient à chaque ajout de catégorie (`narrative_structures`, `chapters`,
 * `scenes`…), et le manque se voyait uniquement à `tsc` — que la CI ne lançait pas.
 * Les tests ne déclarent désormais que les listes qu'ils exercent réellement.
 */
import type { ContextSelection } from '../types/api'

export function makeContextSelection(
  overrides: Partial<ContextSelection> = {}
): ContextSelection {
  return {
    characters_full: [],
    characters_excerpt: [],
    locations_full: [],
    locations_excerpt: [],
    items_full: [],
    items_excerpt: [],
    species_full: [],
    species_excerpt: [],
    communities_full: [],
    communities_excerpt: [],
    dialogues_examples: [],
    narrative_structures: [],
    chapters: [],
    scenes: [],
    ...overrides,
  }
}
