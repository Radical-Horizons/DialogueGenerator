/**
 * Calcule des plages à surligner dans le texte généré à partir des mots du contexte.
 * Heuristique alignée sur le scoring backend (tokens ≥ 4 caractères).
 */

export interface TextRange {
  start: number
  end: number
}

/**
 * @param generatedPlain - Texte généré (extrait JSON réponse).
 * @param contextSnippet - Extrait ou section GDD injectée.
 * @returns Plages fusionnées, indices sur ``generatedPlain``.
 */
export function buildHighlightRanges(
  generatedPlain: string,
  contextSnippet: string,
): TextRange[] {
  const words = new Set<string>()
  const re = /[\wÀ-ÿ]{4,}/gi
  let m: RegExpExecArray | null
  const src = contextSnippet ?? ''
  while ((m = re.exec(src)) !== null) {
    words.add(m[0].toLowerCase())
  }
  if (words.size === 0 || !generatedPlain) {
    return []
  }
  const lower = generatedPlain.toLowerCase()
  const ranges: TextRange[] = []
  for (const w of words) {
    let pos = 0
    while (pos < lower.length) {
      const idx = lower.indexOf(w, pos)
      if (idx < 0) break
      ranges.push({ start: idx, end: idx + w.length })
      pos = idx + Math.max(1, w.length)
    }
  }
  return mergeRanges(ranges)
}

function mergeRanges(ranges: TextRange[]): TextRange[] {
  if (ranges.length === 0) return []
  const sorted = [...ranges].sort((a, b) => a.start - b.start)
  const out: TextRange[] = []
  let cur = { ...sorted[0] }
  for (let i = 1; i < sorted.length; i++) {
    const n = sorted[i]
    if (n.start <= cur.end) {
      cur = { start: cur.start, end: Math.max(cur.end, n.end) }
    } else {
      out.push(cur)
      cur = { ...n }
    }
  }
  out.push(cur)
  return out
}
