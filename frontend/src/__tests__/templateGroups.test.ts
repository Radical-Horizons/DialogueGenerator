/**
 * Tests du regroupement et du filtrage des templates.
 */
import { describe, it, expect } from 'vitest'
import { filterTemplates, groupTemplatesByCategory } from '../utils/templateGroups'
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

  it('filtre « Sans catégorie » sur la clé d’affichage du groupe', () => {
    const untitled = tpl('Sans nom', '  ')
    expect(filterTemplates([untitled], { category: 'Sans catégorie' }).map((item) => item.name)).toEqual(
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
})
