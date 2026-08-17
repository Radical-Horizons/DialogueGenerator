/**
 * Scorer déterministe des suggestions de templates (Story 6.9, miroir Python).
 */

export const REASON_KW = 'Correspond aux mots-clés du brief'
export const REASON_GDD = 'Même personnages ou lieux que votre contexte'
export const REASON_RENCONTRE = 'Première rencontre (fiche ou flag catalogue)'
export const REASON_PERSO = 'Souvent chargé'
export const REASON_MARKET = 'Populaire sur le marketplace'
export const REASON_CONTEXT = 'Déjà choisi dans un scénario similaire'

export const MAX_SUGGESTIONS = 10

export interface SuggestionQuery {
  instructions: string
  sceneType: string
  characters: string[]
  locations: string[]
  hasRencontreInitiale: boolean
}

export interface SuggestionCandidateFeatures {
  name: string
  description: string
  category: string
  sceneTypeHint: string
  sceneType: string
  instructions: string
  characters: string[]
  locations: string[]
  useCount: number
  marketUsageCount: number
  contextUseCount?: number
}

export interface SuggestionScore {
  score: number
  reasons: string[]
}

function fold(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
}

export function normalizeTokens(text: string): Set<string> {
  if (!text) {
    return new Set()
  }
  return new Set(
    fold(text)
      .split(/[^a-z0-9]+/)
      .filter((token) => token.length >= 2),
  )
}

function normName(value: string): string {
  return fold(value).trim()
}

function halfUp(value: number): number {
  return Math.floor(value + 0.5)
}

export function keywordScore(queryTokens: Set<string>, candidateTokens: Set<string>): number {
  if (queryTokens.size === 0) {
    return 0
  }
  let overlap = 0
  for (const token of queryTokens) {
    if (candidateTokens.has(token)) {
      overlap += 1
    }
  }
  return Math.min(40, halfUp((40 * overlap) / queryTokens.size))
}

export function gddScore(
  requestCharacters: string[],
  requestLocations: string[],
  templateCharacters: string[],
  templateLocations: string[],
): number {
  const requested = new Set(
    [...requestCharacters, ...requestLocations]
      .filter((item) => item.trim())
      .map((item) => normName(item)),
  )
  if (requested.size === 0) {
    return 0
  }
  const owned = new Set(
    [...templateCharacters, ...templateLocations]
      .filter((item) => item.trim())
      .map((item) => normName(item)),
  )
  let matched = 0
  for (const name of requested) {
    if (owned.has(name)) {
      matched += 1
    }
  }
  return Math.min(25, halfUp((25 * matched) / requested.size))
}

export function isFirstMeeting(sceneTypeHint: string, name: string, category: string): boolean {
  if ((sceneTypeHint || '').trim().toLowerCase() === 'rencontre_initiale') {
    return true
  }
  const tokens = normalizeTokens(`${name} ${category}`)
  if (tokens.has('salutation')) {
    return true
  }
  return tokens.has('premiere') && tokens.has('rencontre')
}

const FLAG_GENERIC_TOKENS = new Set([
  'flag',
  'perso',
  'npc',
  'char',
  'character',
  'personnage',
  'rencontre',
  'initiale',
  'premiere',
  'premier',
  'first',
  'meeting',
])

export function hasFirstMeetingFlag(characters: string[], flagNames: string[]): boolean {
  const characterTokens = new Set<string>()
  for (const name of characters) {
    for (const token of normalizeTokens(name)) {
      if (!FLAG_GENERIC_TOKENS.has(token)) {
        characterTokens.add(token)
      }
    }
  }
  if (characterTokens.size === 0) {
    return false
  }
  for (const raw of flagNames) {
    const folded = fold(raw)
    if (!folded.includes('rencontre') || !folded.includes('initiale')) {
      continue
    }
    for (const token of normalizeTokens(raw)) {
      if (characterTokens.has(token)) {
        return true
      }
    }
  }
  return false
}

export function hasRencontreInitialeText(mapping: Record<string, string> | null | undefined): boolean {
  if (!mapping) {
    return false
  }
  return Object.values(mapping).some((value) => String(value).trim().length > 0)
}

export function extractRencontreInitiale(characterData: unknown): string {
  if (!characterData || typeof characterData !== 'object') {
    return ''
  }
  const sections = (characterData as { sections?: unknown }).sections
  if (!sections || typeof sections !== 'object') {
    return ''
  }
  const raw = (sections as Record<string, unknown>).rencontre_initiale
  if (!raw || !String(raw).trim()) {
    return ''
  }
  return String(raw).trim()
}

export function rencontreInitialeBySelectedCharacters(
  selectedNames: string[],
  characters: Array<{ name: string; data: Record<string, unknown> }>,
): Record<string, string> {
  const selected = new Set(selectedNames)
  const out: Record<string, string> = {}
  for (const character of characters) {
    if (!selected.has(character.name)) {
      continue
    }
    const text = extractRencontreInitiale(character.data)
    if (text) {
      out[character.name] = text
    }
  }
  return out
}

export function scoreCandidate(
  features: SuggestionCandidateFeatures,
  query: SuggestionQuery,
): SuggestionScore {
  const queryTokens = normalizeTokens(`${query.instructions} ${query.sceneType}`)
  const candidateTokens = normalizeTokens(
    [
      features.name,
      features.description,
      features.category,
      features.sceneTypeHint,
      features.sceneType,
      features.instructions,
    ].join(' '),
  )
  const kw = keywordScore(queryTokens, candidateTokens)
  const gdd = gddScore(
    query.characters,
    query.locations,
    features.characters,
    features.locations,
  )
  const rencontre =
    query.hasRencontreInitiale &&
    isFirstMeeting(features.sceneTypeHint, features.name, features.category)
      ? 20
      : 0
  const perso = Math.min(Math.max(features.useCount, 0), 10) * 1.5
  const market = Math.min(Math.max(features.marketUsageCount, 0), 50) / 5
  const context = Math.min(Math.max(features.contextUseCount ?? 0, 0), 10) * 2
  const total = kw + gdd + rencontre + perso + market + context
  const score = Math.min(100, halfUp(total))
  const reasons: string[] = []
  if (kw > 0) {
    reasons.push(REASON_KW)
  }
  if (gdd > 0) {
    reasons.push(REASON_GDD)
  }
  if (rencontre > 0) {
    reasons.push(REASON_RENCONTRE)
  }
  if (perso > 0) {
    reasons.push(REASON_PERSO)
  }
  if (market > 0) {
    reasons.push(REASON_MARKET)
  }
  if (context > 0) {
    reasons.push(REASON_CONTEXT)
  }
  return { score, reasons }
}

export function rankScored(
  scored: Array<{ score: SuggestionScore; name: string }>,
): Array<{ score: SuggestionScore; name: string }> {
  return scored
    .filter((entry) => entry.score.score > 0)
    .sort((left, right) => {
      if (right.score.score !== left.score.score) {
        return right.score.score - left.score.score
      }
      return left.name.toLowerCase().localeCompare(right.name.toLowerCase())
    })
    .slice(0, MAX_SUGGESTIONS)
}
