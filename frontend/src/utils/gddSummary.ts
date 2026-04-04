/**
 * Extrait un aperçu (résumé) depuis les données GDD pour affichage dans les listes.
 * Conforme à la structure Notion/GDD : Nom, Résumé, sections, Introduction, values, _general.
 * Gère les blocs Notion (rich_text) quand les fiches ne sont pas normalisées en chaîne.
 */
const SUMMARY_KEYS = ['Résumé', 'Introduction', 'résumé', 'introduction'] as const
const VALUES_SUMMARY_KEYS = [
  'Résumé',
  'Résumé de la fiche',
  'Introduction',
  'résumé',
  'introduction',
] as const
const MAX_SUMMARY_LENGTH = 120

/**
 * Indique si une chaîne ressemble au repr/sérialisation d'un bloc Notion (rich_text).
 * Les fiches GDD peuvent contenir des champs stockés comme string au lieu d'objet.
 */
export function isSerializedNotionRichTextBlock(s: string): boolean {
  const t = s.trim()
  return (
    (t.includes("'type': 'rich_text'") || t.includes('"type": "rich_text"')) &&
    (t.includes("'rich_text'") || t.includes('"rich_text"'))
  )
}

/**
 * Extrait le texte brut d'une valeur qui peut être une chaîne ou un bloc Notion (rich_text).
 * Retourne une chaîne non vide ou undefined si rien à afficher.
 * Ignore les chaînes qui sont le repr/sérialisation d'un bloc rich_text vide.
 */
export function extractTextFromGddValue(value: unknown): string | undefined {
  if (value == null) return undefined
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed || isSerializedNotionRichTextBlock(trimmed)) return undefined
    return trimmed
  }
  if (typeof value === 'object' && !Array.isArray(value) && value !== null) {
    const obj = value as Record<string, unknown>
    const rt = obj['rich_text']
    if (Array.isArray(rt)) {
      const text = rt
        .map((item) => (typeof item === 'object' && item !== null && 'plain_text' in item ? String((item as { plain_text?: string }).plain_text ?? '') : ''))
        .join('')
        .trim()
      return text || undefined
    }
  }
  return undefined
}

function getNestedString(obj: unknown, key: string): string | undefined {
  if (obj == null || typeof obj !== 'object') return undefined
  const v = (obj as Record<string, unknown>)[key]
  const fromVal = extractTextFromGddValue(v)
  if (fromVal) return fromVal
  if (typeof v === 'object' && v !== null && !Array.isArray(v)) {
    const nested = v as Record<string, unknown>
    const intro = nested['Introduction'] ?? nested['Résumé'] ?? nested['_general']
    return extractTextFromGddValue(intro)
  }
  return undefined
}

/**
 * Retourne un court aperçu pour une entité GDD (personnage, lieu, etc.).
 * Utilise Résumé, Introduction ou première section disponible.
 */
function getFirstMeaningfulStringFromObject(obj: Record<string, unknown>): string | undefined {
  for (const v of Object.values(obj)) {
    const text = extractTextFromGddValue(v)
    if (text) return text
  }
  return undefined
}

function sliceSummary(text: string): string {
  const t = text.trim()
  if (!t) return ''
  return t.slice(0, MAX_SUMMARY_LENGTH) + (t.length > MAX_SUMMARY_LENGTH ? '…' : '')
}

function trySummaryFromValues(values: Record<string, unknown>): string | undefined {
  for (const key of VALUES_SUMMARY_KEYS) {
    const text = extractTextFromGddValue(values[key])
    if (text) return text
  }
  return undefined
}

/** Extrait un paragraphe après **Résumé** / **Résumé de la fiche** dans ``sections._general``. */
function trySummaryFromGeneralMarkdown(general: string): string | undefined {
  const patterns = [
    /\*\*Résumé de la fiche\*\*\s*\n+([\s\S]*?)(?=\n\n\*\*|\n\n#{1,3}|\n#{1,3}|\s*$)/i,
    /\*\*Résumé\*\*\s*\n+([\s\S]*?)(?=\n\n\*\*|\n\n#{1,3}|\n#{1,3}|\s*$)/i,
  ]
  for (const re of patterns) {
    const m = general.match(re)
    if (m?.[1]) {
      const t = m[1].trim().replace(/\s+/g, ' ')
      if (t) return t
    }
  }
  return undefined
}

/** Première ligne utile du markdown (hors titres # et étiquettes **…** :). */
function excerptFirstLineFromGeneral(general: string): string | undefined {
  const lines = general.split(/\r?\n/)
  for (const line of lines) {
    let s = line.trim()
    if (!s) continue
    s = s.replace(/^#{1,3}\s+/, '').replace(/^\*\*[^*]+\*\*\s*:\s*/, '').trim()
    if (s) return s
  }
  return undefined
}

export function getGddEntitySummary(data: Record<string, unknown> | undefined): string {
  if (!data || typeof data !== 'object') return ''
  for (const key of SUMMARY_KEYS) {
    const val = data[key]
    const text = extractTextFromGddValue(val)
    if (text) return sliceSummary(text)
  }
  const introObj = data['Introduction'] ?? data['introduction']
  if (introObj && typeof introObj === 'object' && !Array.isArray(introObj) && introObj !== null) {
    const fromIntro =
      getNestedString(introObj, 'Résumé de la fiche') ??
      getNestedString(introObj, 'Résumé') ??
      getFirstMeaningfulStringFromObject(introObj as Record<string, unknown>)
    if (fromIntro) return sliceSummary(fromIntro)
  }
  const sections = data['sections'] as Record<string, unknown> | undefined
  if (sections && typeof sections === 'object') {
    const intro = getNestedString(sections, 'Introduction') ?? getNestedString(sections, 'Résumé')
    if (intro) return sliceSummary(intro)
  }
  const rawValues = data['values']
  if (rawValues && typeof rawValues === 'object' && !Array.isArray(rawValues)) {
    const fromVals = trySummaryFromValues(rawValues as Record<string, unknown>)
    if (fromVals) return sliceSummary(fromVals)
  }
  if (sections && typeof sections === 'object') {
    const gen = sections['_general']
    if (typeof gen === 'string' && gen.trim()) {
      const fromMd = trySummaryFromGeneralMarkdown(gen)
      if (fromMd) return sliceSummary(fromMd)
      const line = excerptFirstLineFromGeneral(gen)
      if (line) return sliceSummary(line)
    }
  }
  return ''
}
