/**
 * Score de proximité fuzzy pour autocomplétion (insensible casse/accents).
 */

export interface FuzzyScoredOption {
  value: string
  label: string
  score: number
}

export function normalizeForSearch(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

/** Classe les options par pertinence par rapport à la requête. */
export function rankFuzzyOptions<T extends { id: string; label: string }>(
  options: T[],
  query: string,
  limit = 8,
): Array<T & { score: number }> {
  const normalizedQuery = normalizeForSearch(query)
  if (!normalizedQuery) {
    return options.slice(0, limit).map((option) => ({ ...option, score: 1 }))
  }

  const tokens = normalizedQuery.split(/\s+/).filter(Boolean)
  const scored = options
    .map((option) => {
      const idNorm = normalizeForSearch(option.id)
      const labelNorm = normalizeForSearch(option.label)
      let score = 0
      if (idNorm === normalizedQuery || labelNorm === normalizedQuery) {
        score += 100
      }
      if (idNorm.startsWith(normalizedQuery) || labelNorm.startsWith(normalizedQuery)) {
        score += 40
      }
      if (idNorm.includes(normalizedQuery) || labelNorm.includes(normalizedQuery)) {
        score += 20
      }
      for (const token of tokens) {
        if (idNorm.includes(token) || labelNorm.includes(token)) {
          score += 8
        }
      }
      return { ...option, score }
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.label.localeCompare(b.label, 'fr'))

  return scored.slice(0, limit)
}
