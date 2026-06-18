import { describe, expect, it } from 'vitest'
import {
  canonicalizeContextSelections,
  mergeContextCharacterNames,
  resolveCharacterCanonicalName,
} from './gddEntityNames'

describe('gddEntityNames', () => {
  const catalog = [
    {
      name: 'Uresaïr',
      data: {
        Nom: 'Uresaïr',
        values: { Alias: 'Seigneuresse' },
      },
    },
  ]

  it('résout Seigneuresse Uresaïr vers Uresaïr', () => {
    expect(resolveCharacterCanonicalName('Seigneuresse Uresaïr', catalog)).toBe('Uresaïr')
  })

  it('déduplique alias et canonique dans mergeContextCharacterNames', () => {
    const merged = mergeContextCharacterNames(
      ['Uresaïr'],
      ['Seigneuresse Uresaïr'],
      catalog,
    )
    expect(merged).toEqual(['Uresaïr'])
  })

  it('canonicalizeContextSelections remappe les alias', () => {
    const out = canonicalizeContextSelections(
      {
        characters_full: ['Seigneuresse Uresaïr'],
        characters_excerpt: [],
        locations_full: [],
        locations_excerpt: [],
        items_full: [],
        items_excerpt: [],
        species_full: [],
        species_excerpt: [],
        communities_full: [],
        communities_excerpt: [],
      },
      {
        characters: catalog,
        locations: [],
        items: [],
        species: [],
        communities: [],
      },
    )
    expect(out.characters_full).toEqual(['Uresaïr'])
  })
})
