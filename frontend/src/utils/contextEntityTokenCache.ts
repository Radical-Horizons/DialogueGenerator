/**
 * Cache tokens par fiche GDD — soustraction locale au retrait (sans POST estimate-tokens).
 */
import type { ContextSelection, ElementMode } from '../types/api'
import type { PromptStructure } from '../types/prompt'

export type EntityType = 'characters' | 'locations' | 'items' | 'species' | 'communities'

export interface RemovedEntity {
  entityType: EntityType
  name: string
  mode: ElementMode
}

export type SelectionEntityDelta = RemovedEntity

const ENTITY_TYPES: EntityType[] = [
  'characters',
  'locations',
  'items',
  'species',
  'communities',
]

const CATEGORY_TITLE_TO_ENTITY: Record<string, EntityType> = {
  CHARACTERS: 'characters',
  LOCATIONS: 'locations',
  ITEMS: 'items',
  SPECIES: 'species',
  COMMUNITIES: 'communities',
}

export function entityTokenCacheKey(
  entityType: EntityType,
  name: string,
  mode: ElementMode,
): string {
  return `${entityType}:${name}:${mode}`
}

function enumerateSelectionKeys(selections: ContextSelection): Set<string> {
  const keys = new Set<string>()
  for (const entityType of ENTITY_TYPES) {
    const fullKey = `${entityType}_full` as const
    const excerptKey = `${entityType}_excerpt` as const
    for (const name of selections[fullKey] ?? []) {
      keys.add(entityTokenCacheKey(entityType, name, 'full'))
    }
    for (const name of selections[excerptKey] ?? []) {
      keys.add(entityTokenCacheKey(entityType, name, 'excerpt'))
    }
  }
  return keys
}

function parseSelectionKey(key: string): RemovedEntity | null {
  const parts = key.split(':')
  if (parts.length < 3) return null
  const mode = parts[parts.length - 1] as ElementMode
  const entityType = parts[0] as EntityType
  const name = parts.slice(1, -1).join(':')
  if (!ENTITY_TYPES.includes(entityType) || (mode !== 'full' && mode !== 'excerpt')) {
    return null
  }
  return { entityType, name, mode }
}

export function selectionFingerprint(selections: ContextSelection): string {
  return [...enumerateSelectionKeys(selections)].sort().join('|')
}

/** Liste toutes les fiches GDD de la sélection (bootstrap au lancement). */
export function listAllSelectionEntities(selections: ContextSelection): SelectionEntityDelta[] {
  return [...enumerateSelectionKeys(selections)]
    .map(parseSelectionKey)
    .filter((entity): entity is SelectionEntityDelta => entity != null)
}

/**
 * Retourne les entités retirées si la nouvelle sélection est une sous-ensemble stricte
 * (aucun ajout, aucun changement de mode).
 */
export function findRemovalsOnly(
  previous: ContextSelection,
  current: ContextSelection,
): RemovedEntity[] | null {
  const prevKeys = enumerateSelectionKeys(previous)
  const currKeys = enumerateSelectionKeys(current)
  if (currKeys.size >= prevKeys.size) return null

  const removedKeys = [...prevKeys].filter((k) => !currKeys.has(k))
  if (removedKeys.length === 0) return null

  const addedKeys = [...currKeys].filter((k) => !prevKeys.has(k))
  if (addedKeys.length > 0) return null

  const parsed = removedKeys.map(parseSelectionKey).filter((r): r is RemovedEntity => r != null)
  return parsed.length === removedKeys.length ? parsed : null
}

/**
 * Retourne les entités ajoutées si la sélection ne fait qu'augmenter (aucun retrait ni changement de mode).
 */
export function findAdditionsOnly(
  previous: ContextSelection,
  current: ContextSelection,
): SelectionEntityDelta[] | null {
  const prevKeys = enumerateSelectionKeys(previous)
  const currKeys = enumerateSelectionKeys(current)
  if (currKeys.size <= prevKeys.size) return null

  const addedKeys = [...currKeys].filter((k) => !prevKeys.has(k))
  if (addedKeys.length === 0) return null

  const removedKeys = [...prevKeys].filter((k) => !currKeys.has(k))
  if (removedKeys.length > 0) return null

  const parsed = addedKeys.map(parseSelectionKey).filter((r): r is SelectionEntityDelta => r != null)
  return parsed.length === addedKeys.length ? parsed : null
}

export function buildEntityContextItemsFromStructuredPrompt(
  structured: PromptStructure | null | undefined,
  selections: ContextSelection,
): Record<string, ContextItem> {
  const cache: Record<string, ContextItem> = {}
  if (!structured?.sections) return cache

  for (const section of structured.sections) {
    if (section.type !== 'context' || !section.categories) continue
    for (const category of section.categories) {
      const entityType = CATEGORY_TITLE_TO_ENTITY[category.title?.toUpperCase() ?? '']
      if (!entityType || !category.items) continue
      for (const item of category.items) {
        const name = item.name ?? item.metadata?.element_name ?? item.metadata?.real_name
        if (!name) continue
        const mode = resolveEntityMode(entityType, String(name), selections)
        cache[entityTokenCacheKey(entityType, String(name), mode)] = item
      }
    }
  }
  return cache
}

export function buildEntityTokenCacheFromStructuredPrompt(
  structured: PromptStructure | null | undefined,
  selections: ContextSelection,
): Record<string, number> {
  const cache: Record<string, number> = {}
  if (!structured?.sections) return cache

  for (const section of structured.sections) {
    if (section.type !== 'context' || !section.categories) continue
    for (const category of section.categories) {
      const entityType = CATEGORY_TITLE_TO_ENTITY[category.title?.toUpperCase() ?? '']
      if (!entityType || !category.items) continue
      for (const item of category.items) {
        const name = item.name ?? item.metadata?.element_name ?? item.metadata?.real_name
        if (!name || item.tokenCount == null) continue
        const mode = resolveEntityMode(entityType, String(name), selections)
        cache[entityTokenCacheKey(entityType, String(name), mode)] = item.tokenCount
      }
    }
  }
  return cache
}

function resolveEntityMode(
  entityType: EntityType,
  name: string,
  selections: ContextSelection,
): ElementMode {
  const excerptKey = `${entityType}_excerpt` as keyof ContextSelection
  const excerptList = selections[excerptKey]
  if (Array.isArray(excerptList) && excerptList.includes(name)) {
    return 'excerpt'
  }
  return 'full'
}

export function removeEntityFromStructuredPrompt(
  structured: PromptStructure,
  entityType: EntityType,
  name: string,
  mode: ElementMode,
): PromptStructure {
  const categoryTitle = Object.entries(CATEGORY_TITLE_TO_ENTITY).find(
    ([, t]) => t === entityType,
  )?.[0]
  if (!categoryTitle) return structured

  let removedTokens = 0
  const sections = structured.sections.map((section) => {
    if (section.type !== 'context' || !section.categories) return section
    const categories = section.categories.map((category) => {
      if (category.title?.toUpperCase() !== categoryTitle || !category.items) return category
      let categoryRemoved = 0
      const items = category.items.filter((item) => {
        const itemName = item.name ?? item.metadata?.element_name ?? item.metadata?.real_name
        const isTarget = String(itemName) === name
        if (isTarget) {
          categoryRemoved += item.tokenCount ?? 0
        }
        return !isTarget
      })
      removedTokens += categoryRemoved
      return {
        ...category,
        items,
        tokenCount: Math.max(0, (category.tokenCount ?? 0) - categoryRemoved),
      }
    })
    return { ...section, categories }
  })

  const metadataTotal = Math.max(0, (structured.metadata?.totalTokens ?? 0) - removedTokens)
  void mode
  return {
    ...structured,
    sections,
    metadata: { ...structured.metadata, totalTokens: metadataTotal },
  }
}
