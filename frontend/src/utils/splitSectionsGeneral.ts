/**
 * Découpe ``sections._general`` (markdown) en blocs par titres # / ## / ### (niveau ≤ 3).
 * Aligné sur ``services/gdd_sections_split.split_sections_general_text``.
 */

export interface GeneralSectionChunk {
  slug: string
  title: string
  body: string
}

const HEADING_RE = /^(#{1,3})\s*(.+?)\s*$/

function slugifyTitle(title: string, reserved: Set<string>): string {
  const raw = title.trim()
  const norm = raw
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
  const asciiLike = [...norm]
    .map((c) => (/[a-z0-9]/i.test(c) || c === ' ' || c === '_' || c === '-' ? c : '_'))
    .join('')
  const base =
    asciiLike
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean)
      .join('_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 80) || 'section'
  let slug = base
  let n = 2
  while (reserved.has(slug)) {
    slug = `${base}_${n}`
    n += 1
  }
  reserved.add(slug)
  return slug
}

export function splitSectionsGeneralText(text: string): GeneralSectionChunk[] {
  if (!text || typeof text !== 'string') return []
  const lines = text.split(/\r?\n/)
  const usedSlugs = new Set<string>()
  const chunks: GeneralSectionChunk[] = []
  let currentSlug = slugifyTitle('preamble', usedSlugs)
  let currentTitle = 'Préambule'
  const buf: string[] = []

  const flush = () => {
    const body = buf.join('\n').trim()
    buf.length = 0
    if (body) {
      chunks.push({ slug: currentSlug, title: currentTitle, body })
    }
  }

  for (const line of lines) {
    const m = HEADING_RE.exec(line)
    if (m && m[1].length <= 3) {
      flush()
      currentTitle = m[2].trim()
      currentSlug = slugifyTitle(currentTitle, usedSlugs)
      continue
    }
    buf.push(line)
  }
  flush()
  return chunks
}
