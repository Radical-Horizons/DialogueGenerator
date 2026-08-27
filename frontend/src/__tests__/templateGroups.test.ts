/**
 * Tests du regroupement et du filtrage des templates.
 */
import { describe, it, expect } from 'vitest'
import { filterMarketplaceListings, filterTemplates, groupTemplatesByCategory, sortMarketplaceListings } from '../utils/templateGroups'
import type { Template } from '../types/template'

function tpl(
  name: string,
  category: string,
  configuration: Partial<Template['configuration']> = {},
): Template {
  return {
    id: name,
    name,
    description: '',
    category,
    icon: '📋',
    metadata: { created: '2026-08-16T10:00:00Z', modified: '2026-08-16T10:00:00Z' },
    configuration: {
      characters: [],
      locations: [],
      region: '',
      sceneType: 'Generic',
      instructions: '',
      ...configuration,
    },
  }
}

const library: Template[] = [
  tpl('Salut A', 'Salutation', { characters: ['char-alpha'], region: 'Uresair' }),
  tpl('Combat B', 'Confrontation', { characters: ['char-beta'] }),
  tpl('Salut C', 'Salutation', { locations: ['loc-beta'], selectedSubLocations: ['sub-1'] }),
]

describe('groupTemplatesByCategory', () => {
  it('groupe par catégorie en conservant l’ordre d’apparition', () => {
    const grouped = groupTemplatesByCategory([
      tpl('A', 'Salutation'),
      tpl('B', 'Confrontation'),
      tpl('C', 'Salutation'),
    ])

    expect(grouped.map(([category]) => category)).toEqual(['Salutation', 'Confrontation'])
    expect(grouped[0][1].map((item) => item.name)).toEqual(['A', 'C'])
    expect(grouped[1][1].map((item) => item.name)).toEqual(['B'])
  })
})

describe('filterTemplates', () => {
  it('filtre par nom (sous-chaîne, casse ignorée)', () => {
    const result = filterTemplates(library, { name: 'salut' })
    expect(result.map((item) => item.name)).toEqual(['Salut A', 'Salut C'])
  })

  it('filtre par catégorie', () => {
    const result = filterTemplates(library, { category: 'confront' })
    expect(result.map((item) => item.name)).toEqual(['Combat B'])
  })

  it('filtre par contexte GDD (IDs / libellés du snapshot)', () => {
    expect(filterTemplates(library, { context: 'char-alpha' }).map((item) => item.name)).toEqual([
      'Salut A',
    ])
    expect(filterTemplates(library, { context: 'sub-1' }).map((item) => item.name)).toEqual([
      'Salut C',
    ])
  })

  it('aucun match → liste vide sans erreur', () => {
    expect(filterTemplates(library, { name: 'zzzz-inexistant' })).toEqual([])
  })

  it('champs vides → liste intacte', () => {
    expect(filterTemplates(library, { name: '  ', category: '', context: undefined })).toEqual(
      library,
    )
  })

  it('filtre « Général » sur la clé d’affichage du groupe (catégorie vide)', () => {
    const untitled = tpl('Sans nom', '  ')
    expect(filterTemplates([untitled], { category: 'Général' }).map((item) => item.name)).toEqual(
      ['Sans nom'],
    )
  })

  it('filtre le contexte via contextSelections (items, etc.)', () => {
    const withItem = tpl('Objet', 'Divers', {
      contextSelections: {
        characters_full: [],
        characters_excerpt: [],
        locations_full: [],
        locations_excerpt: [],
        items_full: ['item-relique'],
        items_excerpt: [],
        species_full: [],
        species_excerpt: [],
        communities_full: [],
        communities_excerpt: [],
        dialogues_examples: [],
        narrative_structures: [],
        chapters: [],
        scenes: [],
      },
    })
    expect(filterTemplates([withItem, ...library], { context: 'item-relique' }).map((item) => item.name)).toEqual(
      ['Objet'],
    )
  })

  it('combine les axes en ET', () => {
    const result = filterTemplates(library, { name: 'salut', category: 'Salutation', context: 'loc-beta' })
    expect(result.map((item) => item.name)).toEqual(['Salut C'])
  })

  it('filtre le contexte par région', () => {
    expect(filterTemplates(library, { context: 'Uresair' }).map((item) => item.name)).toEqual([
      'Salut A',
    ])
  })

  it('filtre le contexte par subLocation seul', () => {
    const withSub = tpl('Sous-lieu', 'Divers', { subLocation: 'atelier-voknir' })
    expect(filterTemplates([withSub, ...library], { context: 'atelier-voknir' }).map((item) => item.name)).toEqual(
      ['Sous-lieu'],
    )
  })

  it('filtre le contexte par selectedRegion seul', () => {
    const withRegion = tpl('Région UI', 'Divers', { selectedRegion: 'Daïlon' })
    expect(filterTemplates([withRegion, ...library], { context: 'Daïlon' }).map((item) => item.name)).toEqual(
      ['Région UI'],
    )
  })

  it('filtre le contexte via scene_protagonists / scene_location (records)', () => {
    const withScene = tpl('Scène records', 'Divers', {
      contextSelections: {
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
        scene_protagonists: { personnage_a: 'Uresaïr', personnage_b: 'Valkazer' },
        scene_location: { sous_lieu: 'Atelier de Voknir' },
      },
    })
    expect(
      filterTemplates([withScene, ...library], { context: 'Uresaïr' }).map((item) => item.name),
    ).toEqual(['Scène records'])
    expect(
      filterTemplates([withScene, ...library], { context: 'Atelier' }).map((item) => item.name),
    ).toEqual(['Scène records'])
  })
})

function listing(
  overrides: Partial<import('../types/template').MarketplaceListing> = {},
): import('../types/template').MarketplaceListing {
  return {
    id: 'listing-a',
    sourceTemplateId: 'tpl-a',
    authorId: 'writer-a',
    authorUsername: 'writer-a',
    name: 'Salut A',
    description: '',
    category: 'Salutation',
    icon: '📋',
    configuration: {
      characters: ['char-alpha'],
      locations: [],
      region: 'Uresair',
      sceneType: 'Generic',
      instructions: 'Brief A',
    },
    createdAt: '2026-08-16T10:00:00Z',
    usageCount: 1,
    ratingAverage: 4,
    ratingCount: 1,
    ...overrides,
  }
}

describe('filterMarketplaceListings / sortMarketplaceListings', () => {
  const catalog = [
    listing({ id: 'a', name: 'Salut A', category: 'Salutation', usageCount: 1, createdAt: '2026-08-01T00:00:00Z', ratingAverage: 3 }),
    listing({
      id: 'b',
      name: 'Combat B',
      category: 'Confrontation',
      usageCount: 1,
      createdAt: '2026-08-20T00:00:00Z',
      ratingAverage: null,
      configuration: {
        characters: ['char-beta'],
        locations: [],
        region: '',
        sceneType: 'Generic',
        instructions: 'Brief B',
      },
    }),
    listing({
      id: 'c',
      name: 'Salut C',
      category: 'Salutation',
      usageCount: 9,
      createdAt: '2026-08-05T00:00:00Z',
      ratingAverage: 5,
    }),
  ]

  it('filtre par nom et catégorie (AND 6.1.2)', () => {
    expect(
      filterMarketplaceListings(catalog, { name: 'salut', category: 'Salutation' }).map((item) => item.id),
    ).toEqual(['a', 'c'])
  })

  it('filtre par contexte snapshot', () => {
    expect(filterMarketplaceListings(catalog, { context: 'char-beta' }).map((item) => item.id)).toEqual([
      'b',
    ])
  })

  it('trie par usage, date et note (null en dernier)', () => {
    expect(sortMarketplaceListings(catalog, 'usage').map((item) => item.id)).toEqual(['c', 'a', 'b'])
    expect(sortMarketplaceListings(catalog, 'date').map((item) => item.id)).toEqual(['b', 'c', 'a'])
    expect(sortMarketplaceListings(catalog, 'rating').map((item) => item.id)).toEqual(['c', 'a', 'b'])
  })
})
