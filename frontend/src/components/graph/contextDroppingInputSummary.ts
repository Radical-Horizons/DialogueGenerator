/**
 * Résumé lisible des sélections contexte pour le panneau « Context dropping ».
 * Aligné sur les clés consommées par `extract_key_phrases_from_context` (backend).
 */

const LIST_KEYS: readonly { key: string; label: string }[] = [
  { key: 'characters_full', label: 'Personnages (fiches complètes)' },
  { key: 'characters_excerpt', label: 'Personnages (extraits)' },
  { key: 'locations_full', label: 'Lieux (complets)' },
  { key: 'locations_excerpt', label: 'Lieux (extraits)' },
  { key: 'items_full', label: 'Objets (complets)' },
  { key: 'items_excerpt', label: 'Objets (extraits)' },
  { key: 'species_full', label: 'Espèces (complet)' },
  { key: 'species_excerpt', label: 'Espèces (extraits)' },
  { key: 'communities_full', label: 'Communautés (complet)' },
  { key: 'communities_excerpt', label: 'Communautés (extraits)' },
  { key: 'dialogues_examples', label: 'Exemples de dialogues' },
]

function countList(value: unknown): number {
  return Array.isArray(value) ? value.filter((x) => typeof x === 'string' && x.trim()).length : 0
}

/**
 * Retourne des lignes décrivant l'entrant analysé (listes cochées dans le contexte).
 */
export function buildContextDroppingInputLines(selections: Record<string, unknown>): string[] {
  const lines: string[] = []
  for (const { key, label } of LIST_KEYS) {
    const n = countList(selections[key])
    if (n > 0) {
      lines.push(`${label} : ${n} entrée${n > 1 ? 's' : ''}`)
    }
  }
  if (lines.length === 0) {
    lines.push(
      "Aucune entrée listée dans les sélections contexte — la détection n'aura rien à comparer au graphe (hors infos obligatoires configurées dans les règles)."
    )
  }
  return lines
}
