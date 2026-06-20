/**
 * Fusion du prompt structuré avec les fiches précompilées — total = somme des parties.
 */
import type { ContextSelection } from '../types/api'
import type { ContextCategory, ContextItem, PromptStructure, PromptSection } from '../types/prompt'
import {
  entityTokenCacheKey,
  type EntityType,
} from './contextEntityTokenCache'

const ENTITY_TO_CATEGORY_TITLE: Record<EntityType, string> = {
  characters: 'CHARACTERS',
  locations: 'LOCATIONS',
  items: 'ITEMS',
  species: 'SPECIES',
  communities: 'COMMUNITIES',
}

export interface EntityContextItemEntry {
  entityType: EntityType
  name: string
  mode: 'full' | 'excerpt'
  tokenCount: number
  contextItem: ContextItem
}

/** Totaux dérivés du prompt structuré (source de vérité UI). */
export function computeTotalsFromStructuredPrompt(structured: PromptStructure | null | undefined): {
  selectionTokens: number
  promptTokens: number
} {
  if (!structured?.sections?.length) {
    return { selectionTokens: 0, promptTokens: 0 }
  }

  let selectionTokens = 0
  let overheadTokens = 0

  for (const section of structured.sections) {
    if (section.type === 'context' && section.categories?.length) {
      for (const category of section.categories) {
        selectionTokens += category.tokenCount ?? sumCategoryItems(category)
      }
    } else if (section.type !== 'context') {
      overheadTokens += section.tokenCount ?? 0
    }
  }

  const promptTokens = selectionTokens + overheadTokens
  return { selectionTokens, promptTokens }
}

function sumCategoryItems(category: ContextCategory): number {
  return (category.items ?? []).reduce((sum, item) => sum + (item.tokenCount ?? 0), 0)
}

function reconcileCategoryTokens(category: ContextCategory): ContextCategory {
  const items = category.items ?? []
  const tokenCount = items.reduce((sum, item) => sum + (item.tokenCount ?? 0), 0)
  return { ...category, items, tokenCount }
}

function reconcileContextSection(section: PromptSection): PromptSection {
  if (!section.categories?.length) return section
  const categories = section.categories.map(reconcileCategoryTokens)
  const tokenCount = categories.reduce((sum, cat) => sum + (cat.tokenCount ?? 0), 0)
  return { ...section, categories, tokenCount }
}

/** Recalcule metadata.totalTokens = overhead + contexte GDD. */
export function reconcileStructuredPromptTotals(structured: PromptStructure): PromptStructure {
  const sections = structured.sections.map((section) =>
    section.type === 'context' ? reconcileContextSection(section) : section,
  )
  const { promptTokens } = computeTotalsFromStructuredPrompt({
    ...structured,
    sections,
  })
  return {
    ...structured,
    sections,
    metadata: {
      ...structured.metadata,
      totalTokens: promptTokens,
    },
  }
}

function findOrCreateContextSection(sections: PromptSection[]): {
  sections: PromptSection[]
  contextIndex: number
} {
  const idx = sections.findIndex((s) => s.type === 'context')
  if (idx >= 0) return { sections: [...sections], contextIndex: idx }

  const contextSection: PromptSection = {
    type: 'context',
    title: 'SECTION 2A. CONTEXTE GÉNÉRAL DE LA SCÈNE',
    content: '',
    tokenCount: 0,
    categories: [],
  }
  return { sections: [...sections, contextSection], contextIndex: sections.length }
}

function findOrCreateCategory(
  categories: ContextCategory[],
  entityType: EntityType,
): ContextCategory[] {
  const title = ENTITY_TO_CATEGORY_TITLE[entityType]
  const idx = categories.findIndex((c) => c.title?.toUpperCase() === title)
  if (idx >= 0) return [...categories]

  return [
    ...categories,
    {
      type: entityType,
      title,
      items: [],
      tokenCount: 0,
    },
  ]
}

function toContextItem(raw: Record<string, unknown>, name: string, tokenCount: number): ContextItem {
  const base = raw as unknown as ContextItem
  return {
    ...base,
    name: base.name ?? name,
    tokenCount: tokenCount > 0 ? tokenCount : base.tokenCount,
  }
}

/** Ajoute des fiches précompilées au prompt structuré (sans rebuild global). */
export function mergePrecomputedIntoStructuredPrompt(
  structured: PromptStructure | null | undefined,
  entries: EntityContextItemEntry[],
): PromptStructure {
  const base: PromptStructure = structured?.sections?.length
    ? { ...structured, sections: [...structured.sections] }
    : {
        sections: [],
        metadata: {
          totalTokens: 0,
          generatedAt: new Date().toISOString(),
          organizationMode: 'narrative',
        },
      }

  const { sections, contextIndex } = findOrCreateContextSection(base.sections)
  const contextSection = { ...sections[contextIndex] }
  let categories = [...(contextSection.categories ?? [])]

  for (const entry of entries) {
    categories = findOrCreateCategory(categories, entry.entityType)
    const title = ENTITY_TO_CATEGORY_TITLE[entry.entityType]
    const catIdx = categories.findIndex((c) => c.title?.toUpperCase() === title)
    const category = { ...categories[catIdx] }
    const items = [...(category.items ?? [])]
    const existingIdx = items.findIndex(
      (it) => (it.name ?? it.metadata?.real_name) === entry.name,
    )
    const item = toContextItem(
      entry.contextItem as unknown as Record<string, unknown>,
      entry.name,
      entry.tokenCount,
    )
    if (existingIdx >= 0) {
      items[existingIdx] = item
    } else {
      items.push(item)
    }
    categories[catIdx] = reconcileCategoryTokens({ ...category, items })
  }

  contextSection.categories = categories
  sections[contextIndex] = reconcileContextSection(contextSection)

  return reconcileStructuredPromptTotals({ ...base, sections })
}

/** Reconstruit la section contexte depuis le cache entités (cohérence après plusieurs toggles). */
export function rebuildContextFromEntityCache(
  structured: PromptStructure | null | undefined,
  selections: ContextSelection,
  itemsByKey: Record<string, ContextItem>,
): PromptStructure {
  const entries: EntityContextItemEntry[] = []
  for (const entityType of Object.keys(ENTITY_TO_CATEGORY_TITLE) as EntityType[]) {
    const fullKey = `${entityType}_full` as const
    const excerptKey = `${entityType}_excerpt` as const
    for (const name of selections[fullKey] ?? []) {
      const key = entityTokenCacheKey(entityType, name, 'full')
      const item = itemsByKey[key]
      if (item) {
        entries.push({
          entityType,
          name,
          mode: 'full',
          tokenCount: item.tokenCount ?? 0,
          contextItem: item,
        })
      }
    }
    for (const name of selections[excerptKey] ?? []) {
      const key = entityTokenCacheKey(entityType, name, 'excerpt')
      const item = itemsByKey[key]
      if (item) {
        entries.push({
          entityType,
          name,
          mode: 'excerpt',
          tokenCount: item.tokenCount ?? 0,
          contextItem: item,
        })
      }
    }
  }

  const overheadSections = (structured?.sections ?? []).filter((s) => s.type !== 'context')
  const shell: PromptStructure = {
    sections: overheadSections,
    metadata: structured?.metadata ?? {
      totalTokens: 0,
      generatedAt: new Date().toISOString(),
    },
  }
  return mergePrecomputedIntoStructuredPrompt(shell, entries)
}

export function removeEntityFromStructuredPromptFull(
  structured: PromptStructure,
  entityType: EntityType,
  name: string,
): PromptStructure {
  const title = ENTITY_TO_CATEGORY_TITLE[entityType]
  const sections = structured.sections.map((section) => {
    if (section.type !== 'context' || !section.categories) return section
    const categories = section.categories.map((category) => {
      if (category.title?.toUpperCase() !== title) return category
      const items = (category.items ?? []).filter(
        (it) => (it.name ?? it.metadata?.real_name) !== name,
      )
      return reconcileCategoryTokens({ ...category, items })
    })
    return reconcileContextSection({ ...section, categories })
  })
  return reconcileStructuredPromptTotals({ ...structured, sections })
}

export function buildStructuredFromBootstrap(
  overheadSections: PromptSection[] | undefined,
  entries: EntityContextItemEntry[],
): PromptStructure {
  const shell: PromptStructure | null = overheadSections?.length
    ? {
        sections: overheadSections,
        metadata: {
          totalTokens: overheadSections.reduce((s, sec) => s + (sec.tokenCount ?? 0), 0),
          generatedAt: new Date().toISOString(),
        },
      }
    : null
  return mergePrecomputedIntoStructuredPrompt(shell, entries)
}
