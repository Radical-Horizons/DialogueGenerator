import { describe, expect, it } from 'vitest'
import type { ContextSelection } from '../types/api'
import type { PromptStructure } from '../types/prompt'
import {
  buildEntityTokenCacheFromStructuredPrompt,
  entityTokenCacheKey,
  findAdditionsOnly,
  findRemovalsOnly,
} from './contextEntityTokenCache'

const emptySelection = (): ContextSelection => ({
  characters_full: [],
  characters_excerpt: [],
  locations_full: [],
  locations_excerpt: [],
  items_full: [],
  items_excerpt: [],
  species_full: [],
  species_excerpt: [],
  communities_full: [],
  communities_excerpt: [],
  dialogues_examples: [],
  narrative_structures: [],
  chapters: [],
  scenes: [],
})

describe('contextEntityTokenCache', () => {
  it('findRemovalsOnly détecte un retrait simple', () => {
    const prev = {
      ...emptySelection(),
      characters_full: ['A', 'B'],
      locations_full: ['L1'],
    }
    const curr = {
      ...emptySelection(),
      characters_full: ['A', 'B'],
    }
    expect(findRemovalsOnly(prev, curr)).toEqual([
      { entityType: 'locations', name: 'L1', mode: 'full' },
    ])
  })

  it('findRemovalsOnly retourne null si ajout', () => {
    const prev = { ...emptySelection(), characters_full: ['A'] }
    const curr = { ...emptySelection(), characters_full: ['A', 'B'] }
    expect(findRemovalsOnly(prev, curr)).toBeNull()
  })

  it('findAdditionsOnly détecte un ajout simple', () => {
    const prev = { ...emptySelection(), characters_full: ['A'] }
    const curr = { ...emptySelection(), characters_full: ['A', 'B'] }
    expect(findAdditionsOnly(prev, curr)).toEqual([
      { entityType: 'characters', name: 'B', mode: 'full' },
    ])
  })

  it('buildEntityTokenCacheFromStructuredPrompt indexe par fiche', () => {
    const structured: PromptStructure = {
      sections: [
        {
          type: 'context',
          title: 'Contexte',
          content: '',
          categories: [
            {
              type: 'characters',
              title: 'CHARACTERS',
              items: [
                { id: '1', name: 'Uresaïr', sections: [], tokenCount: 1533 },
              ],
            },
          ],
        },
      ],
      metadata: { totalTokens: 1533, generatedAt: 'x' },
    }
    const selections = { ...emptySelection(), characters_full: ['Uresaïr'] }
    const cache = buildEntityTokenCacheFromStructuredPrompt(structured, selections)
    expect(cache[entityTokenCacheKey('characters', 'Uresaïr', 'full')]).toBe(1533)
  })
})
