/**
 * Le catalogue de templates : une liste, deux statuts.
 *
 * Le risque tenu ici est celui qui s'est réalisé : un template partagé par un collègue
 * écarté de la liste sans que rien ne l'affiche ailleurs — donc invisible, alors que
 * « partagé » est le statut par défaut.
 */
import { describe, it, expect } from 'vitest'
import { buildTemplateCatalog, filterCatalog } from './templateCatalog'
import type { CatalogueItem } from './templateCatalog'
import type { Template } from '../types/template'

function template(overrides: Partial<Template> = {}): Template {
  return {
    id: 'uuid-1',
    name: 'Confrontation au port',
    description: 'Conflit tendu',
    category: 'Confrontation',
    icon: '⚔️',
    metadata: { created: '2026-01-01', modified: '2026-01-01' },
    configuration: {
      characters: ['char-alpha'],
      locations: ['loc-alpha'],
      region: '',
      sceneType: 'Generic',
      instructions: 'brief',
    },
    ownerId: 'writer-a',
    visibility: 'shared',
    relation: 'owned',
    ...overrides,
  } as Template
}

const cle = (items: CatalogueItem[]) => items.map((i) => i.key)

describe('buildTemplateCatalog', () => {
  it('rend chaque template visible, sans en écarter aucun', () => {
    const items = buildTemplateCatalog([template(), template({ id: 'uuid-2' })])

    expect(cle(items)).toEqual(['uuid-1', 'uuid-2'])
  })

  /**
   * Le cas qui manquait. Un `templates.filter(t => t.relation !== 'team')` écartait ce
   * template et aucune section ne le rendait : il disparaissait de l'écran.
   */
  it("garde le template partagé d'un collègue", () => {
    const collegue = template({ id: 'uuid-team', relation: 'team', ownerId: 'writer-b' })

    const items = buildTemplateCatalog([template(), collegue])

    expect(cle(items)).toContain('uuid-team')
    expect(items.find((i) => i.key === 'uuid-team')?.badge).toBe('partagé')
  })

  it('marque un brouillon « privé » et le reste « partagé »', () => {
    const items = buildTemplateCatalog([
      template({ id: 'brouillon', visibility: 'private' }),
      template({ id: 'partage', visibility: 'shared' }),
    ])

    expect(items.find((i) => i.key === 'brouillon')?.badge).toBe('privé')
    expect(items.find((i) => i.key === 'partage')?.badge).toBe('partagé')
  })

  it('rend un template sans propriétaire comme partagé', () => {
    const [item] = buildTemplateCatalog([template({ relation: 'legacy', ownerId: null })])

    expect(item.badge).toBe('partagé')
  })

  it('traite une visibilité absente comme partagée', () => {
    const [item] = buildTemplateCatalog([template({ visibility: undefined })])

    expect(item.visibility).toBe('shared')
    expect(item.badge).toBe('partagé')
  })

  it('conserve le template d’origine pour les actions de la ligne', () => {
    const [item] = buildTemplateCatalog([template()])

    expect(item.template.id).toBe('uuid-1')
    expect(item.template.configuration.instructions).toBe('brief')
  })
})

describe('filterCatalog', () => {
  const items = buildTemplateCatalog([
    template({ id: 'mien-partage', visibility: 'shared', relation: 'owned' }),
    template({ id: 'mien-brouillon', visibility: 'private', relation: 'owned' }),
    template({ id: 'equipe', relation: 'team', ownerId: 'writer-b' }),
  ])

  it('ne retire rien quand aucun critère n’est posé', () => {
    expect(filterCatalog(items, {})).toHaveLength(3)
    expect(filterCatalog(items, { visibility: 'tous' })).toHaveLength(3)
  })

  it('restreint aux brouillons privés', () => {
    expect(cle(filterCatalog(items, { visibility: 'private' }))).toEqual(['mien-brouillon'])
  })

  it('restreint par statut, sans distinguer qui a écrit quoi', () => {
    // « Partagé » réunit le mien et celui du collègue : c'est un statut, il ne dit
    // rien de la provenance.
    expect(cle(filterCatalog(items, { visibility: 'shared' }))).toEqual([
      'mien-partage',
      'equipe',
    ])
  })

  /** Le filtre ne consomme pas la liste : il se relâche. */
  it('restaure la liste complète quand on revient à « tous »', () => {
    expect(filterCatalog(items, { visibility: 'private' })).toHaveLength(1)

    expect(filterCatalog(items, { visibility: 'tous' })).toHaveLength(3)
  })

  it('filtre par nom sans tenir compte de la casse', () => {
    expect(filterCatalog(items, { name: 'CONFRONTATION' })).toHaveLength(3)
    expect(filterCatalog(items, { name: 'introuvable' })).toEqual([])
  })

  it('filtre par contexte GDD', () => {
    expect(filterCatalog(items, { context: 'char-alpha' })).toHaveLength(3)
    expect(filterCatalog(items, { context: 'char-inconnu' })).toEqual([])
  })

  it('combine statut et nom', () => {
    expect(cle(filterCatalog(items, { visibility: 'private', name: 'confrontation' }))).toEqual([
      'mien-brouillon',
    ])
  })
})
