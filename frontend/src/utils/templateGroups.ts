/**
 * Regroupement et filtrage des templates (affichage « Mes templates »).
 */
import type { MarketplaceListing, Template } from '../types/template'

/** Aligné sur le défaut backend (`category` vide → « Général »). */
export const TEMPLATE_UNCATEGORIZED_LABEL = 'Général'

/** Critères de filtre client (sous-chaîne, insensible à la casse). Champs vides = pas de contrainte. */
export interface TemplateFilterQuery {
  name?: string
  category?: string
  context?: string
}

function includesInsensitive(haystack: string, needle: string): boolean {
  return haystack.toLocaleLowerCase().includes(needle.toLocaleLowerCase())
}

function templateCategoryKey(template: Template): string {
  return template.category?.trim() || TEMPLATE_UNCATEGORIZED_LABEL
}

function collectContextValue(value: unknown, into: string[]): void {
  if (typeof value === 'string') {
    if (value.trim()) {
      into.push(value)
    }
    return
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      collectContextValue(item, into)
    }
    return
  }
  if (value && typeof value === 'object') {
    for (const nested of Object.values(value as Record<string, unknown>)) {
      collectContextValue(nested, into)
    }
  }
}

function snapshotContextTokens(template: Template): string[] {
  const cfg = template.configuration
  const tokens: string[] = [
    ...cfg.characters,
    ...cfg.locations,
    cfg.region,
    cfg.subLocation ?? '',
    cfg.selectedRegion ?? '',
    ...(cfg.selectedSubLocations ?? []),
  ].filter((token): token is string => Boolean(token && token.trim()))

  const selections = cfg.contextSelections
  if (selections && typeof selections === 'object') {
    for (const value of Object.values(selections)) {
      collectContextValue(value, tokens)
    }
  }
  return tokens
}

/**
 * Filtre la liste en mémoire (ET entre les trois axes).
 *
 * @param templates - Liste plate déjà chargée
 * @param query - Nom, catégorie, contexte GDD (IDs / libellés du snapshot)
 */
export function filterTemplates(
  templates: Template[],
  query: TemplateFilterQuery,
): Template[] {
  const name = query.name?.trim() ?? ''
  const category = query.category?.trim() ?? ''
  const context = query.context?.trim() ?? ''

  return templates.filter((template) => {
    if (name && !includesInsensitive(template.name, name)) {
      return false
    }
    if (category && !includesInsensitive(templateCategoryKey(template), category)) {
      return false
    }
    if (context) {
      const hit = snapshotContextTokens(template).some((token) =>
        includesInsensitive(token, context),
      )
      if (!hit) {
        return false
      }
    }
    return true
  })
}

/**
 * Groupe les templates par `category` en conservant l'ordre d'apparition.
 *
 * @param templates - Liste plate renvoyée par l'API
 * @returns Entrées [catégorie, templates] dans l'ordre de première occurrence
 */
export function groupTemplatesByCategory(templates: Template[]): Array<[string, Template[]]> {
  const groups = new Map<string, Template[]>()
  for (const template of templates) {
    const key = templateCategoryKey(template)
    const bucket = groups.get(key)
    if (bucket) {
      bucket.push(template)
    } else {
      groups.set(key, [template])
    }
  }
  return Array.from(groups.entries())
}

/** Clé de tri marketplace (front, après GET). */
export type MarketplaceSortKey = 'usage' | 'date' | 'rating'

/**
 * Adapte une fiche marketplace au shape ``Template`` pour ``filterTemplates``.
 */
export function marketplaceListingToTemplate(listing: MarketplaceListing): Template {
  return {
    id: listing.id,
    name: listing.name,
    description: listing.description,
    category: listing.category,
    icon: listing.icon,
    metadata: { created: listing.createdAt, modified: listing.createdAt },
    configuration: listing.configuration,
  }
}

/**
 * Filtre les fiches marketplace avec les critères 6.1.2 (AND, sous-chaîne).
 */
export function filterMarketplaceListings(
  listings: MarketplaceListing[],
  query: TemplateFilterQuery,
): MarketplaceListing[] {
  const allowed = new Set(
    filterTemplates(listings.map(marketplaceListingToTemplate), query).map((item) => item.id),
  )
  return listings.filter((listing) => allowed.has(listing.id))
}

/**
 * Trie les fiches : usage / date desc ; note moyenne desc, ``null`` en dernier.
 */
export function sortMarketplaceListings(
  listings: MarketplaceListing[],
  sort: MarketplaceSortKey,
): MarketplaceListing[] {
  return [...listings].sort((left, right) => {
    if (sort === 'usage') {
      return right.usageCount - left.usageCount
    }
    if (sort === 'date') {
      return right.createdAt.localeCompare(left.createdAt)
    }
    const leftAvg = left.ratingAverage
    const rightAvg = right.ratingAverage
    if (leftAvg == null && rightAvg == null) {
      return 0
    }
    if (leftAvg == null) {
      return 1
    }
    if (rightAvg == null) {
      return -1
    }
    return rightAvg - leftAvg
  })
}
