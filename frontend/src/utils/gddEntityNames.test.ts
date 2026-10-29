import { describe, expect, it } from 'vitest'
import {
  canonicalizeContextSelections,
  mergeContextCharacterNames,
  resolveCharacterCanonicalName,
  resolveLocationDisplayName,
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

  const locationCatalog = [
    {
      name: 'Nef Centrale',
      data: {
        Nom: 'Nef Centrale',
        notion_page_id: '1b36e4d2-1b45-80ce-9d1b-f71e60cb8e53',
      },
    },
  ]

  it('résout Seigneuresse Uresaïr vers Uresaïr', () => {
    expect(resolveCharacterCanonicalName('Seigneuresse Uresaïr', catalog)).toBe('Uresaïr')
  })

  it('résout « Nom, alias » (Akthar-Neth Amatru, l’Exégète) vers le Nom canonique', () => {
    const aktharCatalog = [
      {
        name: 'Akthar-Neth Amatru',
        data: {
          Nom: 'Akthar-Neth Amatru',
          values: { Alias: 'Grand-Père, l\u2019Exégète' },
        },
      },
    ]
    expect(
      resolveCharacterCanonicalName("Akthar-Neth Amatru, l'Exégète", aktharCatalog),
    ).toBe('Akthar-Neth Amatru')
    expect(
      resolveCharacterCanonicalName('Akthar-Neth Amatru, l\u2019Exégète', aktharCatalog),
    ).toBe('Akthar-Neth Amatru')
  })

  it('résout un UUID Notion vers le nom de lieu', () => {
    expect(
      resolveLocationDisplayName('1b36e4d2-1b45-80ce-9d1b-f71e60cb8e53', locationCatalog),
    ).toBe('Nef Centrale')
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
