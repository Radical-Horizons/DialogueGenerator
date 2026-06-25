/**
 * Résolution des noms canoniques GDD (alias, formes historiques « alias + Nom »).
 * Miroir simplifié de ``ElementRepository`` côté backend.
 */

export interface GddCatalogEntry {
  name: string
  data?: Record<string, unknown>
}

/** Normalise apostrophes / espaces pour comparaison insensible à la casse. */
export function normalizeGddNameForMatch(value: string): string {
  return value
    .replace(/\u2019/g, "'")
    .replace(/\u2018/g, "'")
    .replace(/\u201C/g, '"')
    .replace(/\u201D/g, '"')
    .replace(/\u00A0/g, ' ')
    .trim()
    .toLowerCase()
}

function aliasTokens(data: Record<string, unknown>): string[] {
  const values = data.values
  if (!values || typeof values !== 'object') return []
  const alias = (values as Record<string, unknown>).Alias
  if (alias == null || alias === '') return []
  return String(alias)
    .split(',')
    .map((part) => normalizeGddNameForMatch(part.trim()))
    .filter(Boolean)
}

function matchesAliasOrHistoricalName(
  data: Record<string, unknown>,
  normalizedSearch: string,
): boolean {
  const tokens = aliasTokens(data)
  if (tokens.includes(normalizedSearch)) return true
  const nom = data.Nom
  if (!nom) return false
  const normalizedNom = normalizeGddNameForMatch(String(nom))
  return tokens.some((token) => normalizedSearch === `${token} ${normalizedNom}`.trim())
}

function resolveCanonicalName(name: string, catalog: GddCatalogEntry[]): string {
  const normalized = normalizeGddNameForMatch(name)
  for (const item of catalog) {
    if (normalizeGddNameForMatch(item.name) === normalized) {
      return item.name
    }
    const data = item.data ?? {}
    const nom = data.Nom
    if (nom && normalizeGddNameForMatch(String(nom)) === normalized) {
      return item.name
    }
    if (matchesAliasOrHistoricalName(data, normalized)) {
      return item.name
    }
  }
  return name
}

export function resolveGddCanonicalName(name: string, catalog: GddCatalogEntry[]): string {
  return resolveCanonicalName(name, catalog)
}

export function resolveCharacterCanonicalName(
  name: string,
  catalog: GddCatalogEntry[],
): string {
  return resolveCanonicalName(name, catalog)
}

export function resolveLocationCanonicalName(name: string, catalog: GddCatalogEntry[]): string {
  return resolveCanonicalName(name, catalog)
}

const NOTION_UUID_PATTERN =
  /^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$/i

/** Indique si la chaîne ressemble à un identifiant Notion (UUID). */
export function looksLikeNotionUuid(value: string): boolean {
  return NOTION_UUID_PATTERN.test(value.trim())
}

function normalizeNotionUuid(value: string): string {
  const compact = value.replace(/-/g, '').toLowerCase()
  if (compact.length !== 32) {
    return value.trim().toLowerCase()
  }
  return `${compact.slice(0, 8)}-${compact.slice(8, 12)}-${compact.slice(12, 16)}-${compact.slice(16, 20)}-${compact.slice(20)}`
}

/**
 * Affiche un nom de lieu lisible : résout les UUID Notion via ``notion_page_id`` du catalogue.
 */
export function resolveLocationDisplayName(
  nameOrId: string,
  catalog: GddCatalogEntry[],
): string {
  const trimmed = nameOrId.trim()
  if (!trimmed) return nameOrId
  if (!looksLikeNotionUuid(trimmed)) {
    return resolveLocationCanonicalName(trimmed, catalog)
  }
  const target = normalizeNotionUuid(trimmed)
  for (const item of catalog) {
    const pageId = item.data?.notion_page_id
    if (typeof pageId === 'string' && normalizeNotionUuid(pageId) === target) {
      return item.name
    }
  }
  return trimmed
}

/** Fusionne full + excerpt en ordre, dédupliqué par nom canonique. */
export function mergeContextCharacterNames(
  full: string[],
  excerpt: string[],
  catalog: GddCatalogEntry[],
): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of [...full, ...excerpt]) {
    const canonical = resolveCharacterCanonicalName(raw, catalog)
    const key = normalizeGddNameForMatch(canonical)
    if (seen.has(key)) continue
    seen.add(key)
    out.push(canonical)
  }
  return out
}

const ENTITY_SELECTION_KEYS = [
  'characters_full',
  'characters_excerpt',
  'locations_full',
  'locations_excerpt',
  'items_full',
  'items_excerpt',
  'species_full',
  'species_excerpt',
  'communities_full',
  'communities_excerpt',
] as const

type EntitySelectionKey = (typeof ENTITY_SELECTION_KEYS)[number]

function resolverForKey(
  key: EntitySelectionKey,
  characters: GddCatalogEntry[],
  locations: GddCatalogEntry[],
  items: GddCatalogEntry[],
  species: GddCatalogEntry[],
  communities: GddCatalogEntry[],
): (name: string) => string {
  if (key.startsWith('characters_')) {
    return (name) => resolveCharacterCanonicalName(name, characters)
  }
  if (key.startsWith('locations_')) {
    return (name) => resolveLocationCanonicalName(name, locations)
  }
  if (key.startsWith('items_')) {
    return (name) => resolveCanonicalName(name, items)
  }
  if (key.startsWith('species_')) {
    return (name) => resolveCanonicalName(name, species)
  }
  return (name) => resolveCanonicalName(name, communities)
}

/** Remappe alias → nom catalogue et déduplique les listes de sélection. */
export function canonicalizeContextSelections<
  T extends Record<EntitySelectionKey, string[]>,
>(
  selections: T,
  catalogs: {
    characters: GddCatalogEntry[]
    locations: GddCatalogEntry[]
    items: GddCatalogEntry[]
    species: GddCatalogEntry[]
    communities: GddCatalogEntry[]
  },
): T {
  const next = { ...selections }
  for (const key of ENTITY_SELECTION_KEYS) {
    const raw = next[key]
    if (!Array.isArray(raw)) continue
    const resolve = resolverForKey(
      key,
      catalogs.characters,
      catalogs.locations,
      catalogs.items,
      catalogs.species,
      catalogs.communities,
    )
    const seen = new Set<string>()
    const remapped: string[] = []
    for (const name of raw) {
      const canonical = resolve(name)
      const dedupeKey = normalizeGddNameForMatch(canonical)
      if (seen.has(dedupeKey)) continue
      seen.add(dedupeKey)
      remapped.push(canonical)
    }
    next[key] = remapped as T[EntitySelectionKey]
  }
  return next
}

/** Retire toutes les entrées dont le nom canonique correspond. */
export function filterOutCanonicalEntity(
  names: string[],
  targetName: string,
  catalog: GddCatalogEntry[],
  resolve: (name: string, cat: GddCatalogEntry[]) => string,
): string[] {
  const targetKey = normalizeGddNameForMatch(resolve(targetName, catalog))
  return names.filter((n) => normalizeGddNameForMatch(resolve(n, catalog)) !== targetKey)
}
