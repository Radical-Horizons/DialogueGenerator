/**
 * Catalogue unifié — une ligne de test par ligne de la matrice I/O de la story 6.8.
 *
 * Le risque tenu ici est celui qui s'est réalisé : un template partagé par un collègue
 * exclu de la liste sans qu'aucune section ne l'affiche. Le premier test de ce fichier
 * échoue sur l'implémentation précédente.
 */
import { describe, it, expect } from 'vitest'
import { buildTemplateCatalog, filterCatalog } from './templateCatalog'
import type { CatalogueItem } from './templateCatalog'
import type { PrebuiltTemplate, Template } from '../types/template'

function prebuilt(overrides: Partial<PrebuiltTemplate> = {}): PrebuiltTemplate {
  return {
    id: 'salutation',
    name: 'Salutation',
    description: 'Première rencontre',
    category: 'Rencontre',
    icon: '👋',
    gddSystem: 'Réputation',
    sceneTypeHint: 'rencontre_initiale',
    objectif: '',
    casUsage: '',
    examples: [],
    addedAt: '2026-01-01',
    configuration: {
      characters: [],
      locations: [],
      region: '',
      sceneType: 'Generic',
      instructions: 'brief',
    },
    ...overrides,
  } as PrebuiltTemplate
}

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
  it('réunit catalogue fourni et templates custom dans une seule liste', () => {
    const items = buildTemplateCatalog([prebuilt()], [template()])

    expect(cle(items)).toEqual(['prebuilt:salutation', 'uuid-1'])
  })

  /**
   * Le cas qui manquait. Avant la liste unique, `templates.filter(t => t.relation !== 'team')`
   * écartait ce template et aucune section ne le rendait : il était invisible.
   */
  it("garde le template partagé d'un collègue", () => {
    const collegue = template({ id: 'uuid-team', relation: 'team', ownerId: 'writer-b' })

    const items = buildTemplateCatalog([], [template(), collegue])

    expect(cle(items)).toContain('uuid-team')
    expect(items.find((i) => i.key === 'uuid-team')?.badge).toBe('partagé')
  })

  it('marque mon brouillon « privé » et mon template partagé « partagé »', () => {
    const items = buildTemplateCatalog(
      [],
      [
        template({ id: 'brouillon', visibility: 'private' }),
        template({ id: 'partage', visibility: 'shared' }),
      ],
    )

    expect(items.find((i) => i.key === 'brouillon')?.badge).toBe('privé')
    expect(items.find((i) => i.key === 'partage')?.badge).toBe('partagé')
  })

  it('traite une fiche du catalogue comme un template partagé', () => {
    const [item] = buildTemplateCatalog([prebuilt()], [])

    // Une fiche livrée est un template partagé, pas une espèce à part.
    expect(item.badge).toBe('partagé')
    expect(item.visibility).toBe('shared')
    expect(item.source.kind).toBe('prebuilt')
  })

  it('rend un template sans propriétaire comme partagé', () => {
    const [item] = buildTemplateCatalog([], [template({ relation: 'legacy', ownerId: null })])

    expect(item.badge).toBe('partagé')
  })

  it('traite une visibilité absente comme partagée', () => {
    const [item] = buildTemplateCatalog([], [template({ visibility: undefined })])

    expect(item.visibility).toBe('shared')
    expect(item.badge).toBe('partagé')
  })
})

describe('filterCatalog', () => {
  const items = buildTemplateCatalog(
    [prebuilt()],
    [
      template({ id: 'mien-partage', visibility: 'shared', relation: 'owned' }),
      template({ id: 'mien-brouillon', visibility: 'private', relation: 'owned' }),
      template({ id: 'equipe', relation: 'team', ownerId: 'writer-b' }),
    ],
  )

  it('ne retire rien quand aucun critère n’est posé', () => {
    expect(filterCatalog(items, {})).toHaveLength(4)
    expect(filterCatalog(items, { visibility: 'tous' })).toHaveLength(4)
  })

  it('restreint aux brouillons privés', () => {
    expect(cle(filterCatalog(items, { visibility: 'private' }))).toEqual(['mien-brouillon'])
  })

  it('restreint par statut, sans distinguer qui a écrit quoi', () => {
    // « Partagé » réunit la fiche livrée, la mienne et celle du collègue : c'est un
    // statut, il ne dit rien de la provenance.
    expect(cle(filterCatalog(items, { visibility: 'shared' }))).toEqual([
      'prebuilt:salutation',
      'mien-partage',
      'equipe',
    ])
    expect(cle(filterCatalog(items, { visibility: 'private' }))).toEqual(['mien-brouillon'])
  })

  /** Le filtre ne consomme pas la liste : il se relâche. */
  it('restaure la liste complète quand on revient à « tous »', () => {
    const restreint = filterCatalog(items, { visibility: 'private' })
    expect(restreint).toHaveLength(1)

    expect(filterCatalog(items, { visibility: 'tous' })).toHaveLength(4)
  })

  it('filtre par nom sans tenir compte de la casse', () => {
    expect(cle(filterCatalog(items, { name: 'salut' }))).toEqual(['prebuilt:salutation'])
  })

  it('filtre par contexte, y compris sur une fiche du catalogue', () => {
    expect(cle(filterCatalog(items, { context: 'rencontre_initiale' }))).toEqual([
      'prebuilt:salutation',
    ])
    expect(cle(filterCatalog(items, { context: 'char-alpha' }))).not.toContain(
      'prebuilt:salutation',
    )
  })

  it('renvoie une liste vide quand rien ne correspond, sans lever', () => {
    expect(filterCatalog(items, { name: 'introuvable' })).toEqual([])
  })

  it('combine statut et nom', () => {
    expect(cle(filterCatalog(items, { visibility: 'shared', name: 'confrontation' }))).toEqual([
      'mien-partage',
      'equipe',
    ])
  })
})
