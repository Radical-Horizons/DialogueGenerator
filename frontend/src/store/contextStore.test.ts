/**
 * Tests pour contextStore - vérification de la gestion des doublons.
 * 
 * Note: Ces tests utilisent le vrai store Zustand. Comme Zustand utilise un singleton,
 * il faut réinitialiser le store avant chaque test pour éviter les fuites d'état.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { useContextStore } from './contextStore'
import type { ContextSelection } from '../types/api'
import { makeContextSelection } from '../testFixtures/contextSelection'

describe('contextStore', () => {
  beforeEach(() => {
    // Réinitialiser le store avant chaque test en vidant toutes les sélections
    const store = useContextStore.getState()
    store.clearSelections()
    // S'assurer que les listes d'éléments sont vides aussi
    store.setElementLists({
      characters: [],
      locations: [],
      items: [],
      species: [],
      communities: [],
    })
    useContextStore.setState({ gddDataRevision: 0 })
  })

  it('bumpGddDataRevision incrémente gddDataRevision', () => {
    const store = useContextStore.getState()
    expect(store.gddDataRevision).toBe(0)
    store.bumpGddDataRevision()
    expect(useContextStore.getState().gddDataRevision).toBe(1)
    store.bumpGddDataRevision()
    expect(useContextStore.getState().gddDataRevision).toBe(2)
  })

  describe('toggleCharacter', () => {
    it('ne doit pas permettre les doublons', () => {
      let store = useContextStore.getState()
      
      // Ajouter un personnage en mode full par défaut
      store.toggleCharacter('Personnage 1')
      store = useContextStore.getState()
      expect(store.selections.characters_full).toEqual(['Personnage 1'])
      expect(store.selections.characters_excerpt).toEqual([])
      
      // Essayer d'ajouter le même personnage à nouveau (devrait le retirer)
      store.toggleCharacter('Personnage 1')
      store = useContextStore.getState()
      expect(store.selections.characters_full).toEqual([])
      expect(store.selections.characters_excerpt).toEqual([])
      
      // Ajouter à nouveau
      store.toggleCharacter('Personnage 1')
      store = useContextStore.getState()
      expect(store.selections.characters_full).toEqual(['Personnage 1'])
      expect(store.selections.characters_excerpt).toEqual([])
    })

    it('permet d\'ajouter plusieurs personnages différents', () => {
      let store = useContextStore.getState()
      
      store.toggleCharacter('Personnage 1')
      store.toggleCharacter('Personnage 2')
      store.toggleCharacter('Personnage 3')
      
      store = useContextStore.getState()
      expect(store.selections.characters_full.length).toBe(3)
      expect(store.selections.characters_full).toContain('Personnage 1')
      expect(store.selections.characters_full).toContain('Personnage 2')
      expect(store.selections.characters_full).toContain('Personnage 3')
    })

    it('permet de sélectionner en mode excerpt', () => {
      let store = useContextStore.getState()
      
      store.toggleCharacter('Personnage 1', 'excerpt')
      store = useContextStore.getState()
      expect(store.selections.characters_full).toEqual([])
      expect(store.selections.characters_excerpt).toEqual(['Personnage 1'])
    })

    it('permet de basculer entre full et excerpt', () => {
      let store = useContextStore.getState()
      
      // Ajouter en mode full
      store.toggleCharacter('Personnage 1', 'full')
      store = useContextStore.getState()
      expect(store.selections.characters_full).toEqual(['Personnage 1'])
      expect(store.selections.characters_excerpt).toEqual([])
      
      // Changer le mode
      store.setElementMode('characters', 'Personnage 1', 'excerpt')
      store = useContextStore.getState()
      expect(store.selections.characters_full).toEqual([])
      expect(store.selections.characters_excerpt).toEqual(['Personnage 1'])
      
      // Changer à nouveau en full
      store.setElementMode('characters', 'Personnage 1', 'full')
      store = useContextStore.getState()
      expect(store.selections.characters_full).toEqual(['Personnage 1'])
      expect(store.selections.characters_excerpt).toEqual([])
    })
  })

  describe('toggleLocation', () => {
    it('ne doit pas permettre les doublons', () => {
      let store = useContextStore.getState()
      
      store.toggleLocation('Lieu 1')
      store = useContextStore.getState()
      expect(store.selections.locations_full).toEqual(['Lieu 1'])
      expect(store.selections.locations_excerpt).toEqual([])
      
      // Essayer d'ajouter le même lieu à nouveau
      store.toggleLocation('Lieu 1')
      store = useContextStore.getState()
      expect(store.selections.locations_full).toEqual([])
      expect(store.selections.locations_excerpt).toEqual([])
    })
  })

  describe('getElementMode', () => {
    it('devrait retourner le mode correct pour un élément sélectionné', () => {
      let store = useContextStore.getState()
      
      store.toggleCharacter('Personnage 1', 'full')
      store.toggleCharacter('Personnage 2', 'excerpt')
      
      store = useContextStore.getState()
      expect(store.getElementMode('characters', 'Personnage 1')).toBe('full')
      expect(store.getElementMode('characters', 'Personnage 2')).toBe('excerpt')
      expect(store.getElementMode('characters', 'Personnage 3')).toBe(null)
    })
  })

  describe('isElementSelected', () => {
    it('devrait retourner true si l\'élément est sélectionné (full ou excerpt)', () => {
      let store = useContextStore.getState()
      
      store.toggleCharacter('Personnage 1', 'full')
      store.toggleCharacter('Personnage 2', 'excerpt')
      
      store = useContextStore.getState()
      expect(store.isElementSelected('characters', 'Personnage 1')).toBe(true)
      expect(store.isElementSelected('characters', 'Personnage 2')).toBe(true)
      expect(store.isElementSelected('characters', 'Personnage 3')).toBe(false)
    })
  })

  describe('restoreState', () => {
    it('devrait restaurer les sélections avec les deux listes', () => {
      let store = useContextStore.getState()
      
      const selectionsToRestore = makeContextSelection({
        characters_full: ['Personnage 1'],
        characters_excerpt: ['Personnage 2'],
        locations_full: ['Lieu 1'],
        locations_excerpt: [],
        items_full: [],
        items_excerpt: [],
        species_full: [],
        species_excerpt: [],
        communities_full: [],
        communities_excerpt: [],
        dialogues_examples: [],
      })
      
      store.restoreState(selectionsToRestore, null, [])
      store = useContextStore.getState()
      
      expect(store.selections.characters_full).toEqual(['Personnage 1'])
      expect(store.selections.characters_excerpt).toEqual(['Personnage 2'])
      expect(store.selections.locations_full).toEqual(['Lieu 1'])
    })

    it('devrait normaliser les données non-array en tableaux vides', () => {
      let store = useContextStore.getState()
      
      // Simuler un restoreState avec des données invalides
      const invalidSelections = {
        characters_full: undefined,
        characters_excerpt: null,
        locations_full: 'not an array',
        locations_excerpt: [],
        items_full: [],
        items_excerpt: [],
        species_full: [],
        species_excerpt: [],
        communities_full: [],
        communities_excerpt: [],
        dialogues_examples: [],
      } as unknown as ContextSelection
      
      store.restoreState(invalidSelections, null, [])
      store = useContextStore.getState()
      
      // Toutes les propriétés devraient être des tableaux
      expect(Array.isArray(store.selections.characters_full)).toBe(true)
      expect(Array.isArray(store.selections.characters_excerpt)).toBe(true)
      expect(Array.isArray(store.selections.locations_full)).toBe(true)
      expect(store.selections.characters_full.length).toBe(0)
      expect(store.selections.characters_excerpt.length).toBe(0)
      expect(store.selections.locations_full.length).toBe(0)
    })
  })

  describe('setSelections', () => {
    it('devrait remplacer les sélections existantes', () => {
      let store = useContextStore.getState()
      
      // Ajouter des sélections initiales
      store.toggleCharacter('Personnage Initial')
      store.toggleLocation('Lieu Initial')
      
      // Remplacer avec de nouvelles sélections
      const newSelections = makeContextSelection({
        characters_full: ['Nouveau Personnage'],
        characters_excerpt: [],
        locations_full: ['Nouveau Lieu'],
        locations_excerpt: [],
        items_full: [],
        items_excerpt: [],
        species_full: [],
        species_excerpt: [],
        communities_full: [],
        communities_excerpt: [],
        dialogues_examples: [],
      })
      
      store.setSelections(newSelections)
      store = useContextStore.getState()
      
      expect(store.selections.characters_full).toEqual(['Nouveau Personnage'])
      expect(store.selections.locations_full).toEqual(['Nouveau Lieu'])
      expect(store.selections.characters_full).not.toContain('Personnage Initial')
    })

    it('devrait normaliser les données non-array en tableaux vides', () => {
      let store = useContextStore.getState()
      
      const invalidSelections = {
        characters_full: undefined,
        characters_excerpt: null,
        locations_full: 'not an array',
        locations_excerpt: [],
        items_full: [],
        items_excerpt: [],
        species_full: [],
        species_excerpt: [],
        communities_full: [],
        communities_excerpt: [],
        dialogues_examples: [],
      } as unknown as ContextSelection
      
      store.setSelections(invalidSelections)
      store = useContextStore.getState()
      
      // Toutes les propriétés devraient être des tableaux
      expect(Array.isArray(store.selections.characters_full)).toBe(true)
      expect(Array.isArray(store.selections.characters_excerpt)).toBe(true)
      expect(Array.isArray(store.selections.locations_full)).toBe(true)
    })
  })

  describe('applyLinkedElements', () => {
    it('ne doit pas ajouter d\'éléments déjà présents', () => {
      let store = useContextStore.getState()
      
      // Ajouter un personnage initial en mode full
      store.toggleCharacter('Personnage 1', 'full')
      
      // Simuler des listes d'éléments disponibles
      store.setElementLists({
        characters: [{ name: 'Personnage 1', data: {} }, { name: 'Personnage 2', data: {} }],
        locations: [],
        items: [],
        species: [],
        communities: [],
      })
      
      // Essayer d'ajouter Personnage 1 à nouveau via applyLinkedElements
      store.applyLinkedElements(['Personnage 1', 'Personnage 2'])
      store = useContextStore.getState()
      
      // Personnage 1 ne doit pas être dupliqué
      const allCharacters = [...store.selections.characters_full, ...store.selections.characters_excerpt]
      const countPersonnage1 = allCharacters.filter(p => p === 'Personnage 1').length
      expect(countPersonnage1).toBe(1)
      expect(allCharacters).toContain('Personnage 2')
    })

    it('devrait ajouter les éléments en mode full par défaut', () => {
      let store = useContextStore.getState()
      
      store.setElementLists({
        characters: [{ name: 'Personnage 1', data: {} }],
        locations: [],
        items: [],
        species: [],
        communities: [],
      })
      
      store.applyLinkedElements(['Personnage 1'])
      store = useContextStore.getState()
      
      expect(store.selections.characters_full).toContain('Personnage 1')
      expect(store.selections.characters_excerpt).not.toContain('Personnage 1')
    })
  })

  describe('clearSelections', () => {
    it('devrait vider toutes les sélections', () => {
      let store = useContextStore.getState()
      
      // Ajouter des sélections en différents modes
      store.toggleCharacter('Personnage 1', 'full')
      store.toggleCharacter('Personnage 2', 'excerpt')
      store.toggleLocation('Lieu 1', 'full')
      store.toggleSpecies('Espèce 1', 'excerpt')
      
      // Tout effacer
      store.clearSelections()
      store = useContextStore.getState()
      
      expect(store.selections.characters_full.length).toBe(0)
      expect(store.selections.characters_excerpt.length).toBe(0)
      expect(store.selections.locations_full.length).toBe(0)
      expect(store.selections.locations_excerpt.length).toBe(0)
      expect(store.selections.items_full.length).toBe(0)
      expect(store.selections.items_excerpt.length).toBe(0)
      expect(store.selections.species_full.length).toBe(0)
      expect(store.selections.species_excerpt.length).toBe(0)
      expect(store.selections.communities_full.length).toBe(0)
      expect(store.selections.communities_excerpt.length).toBe(0)
      expect(store.selections.dialogues_examples.length).toBe(0)
      expect(store.selectedRegion).toBe(null)
      expect(store.selectedSubLocations.length).toBe(0)
    })
  })

  describe('suggestions slice', () => {
    it('setSuggestions : enregistre les suggestions dans le store', () => {
      const store = useContextStore.getState()
      store.setSuggestions([
        { type: 'character', name: 'Bob' },
        { type: 'location', name: 'Forêt' },
      ])
      const s = useContextStore.getState()
      expect(s.suggestions).toHaveLength(2)
      expect(s.suggestions[0]).toEqual({ type: 'character', name: 'Bob' })
    })

    it('setSuggestions : filtre les suggestions déjà ignorées', () => {
      const store = useContextStore.getState()
      store.ignoreSuggestion('character', 'Bob')
      store.setSuggestions([
        { type: 'character', name: 'Bob' },
        { type: 'location', name: 'Forêt' },
      ])
      const s = useContextStore.getState()
      expect(s.suggestions).toHaveLength(1)
      expect(s.suggestions[0].name).toBe('Forêt')
    })

    it('acceptSuggestion : retire de suggestions ET ajoute aux sélections', () => {
      const store = useContextStore.getState()
      store.setElementLists({
        characters: [{ name: 'Bob', data: {} }],
        locations: [],
        items: [],
        species: [],
        communities: [],
      })
      store.setSuggestions([
        { type: 'character', name: 'Bob' },
        { type: 'location', name: 'Forêt' },
      ])
      store.acceptSuggestion('character', 'Bob')
      const s = useContextStore.getState()
      expect(s.suggestions.find((sg) => sg.name === 'Bob')).toBeUndefined()
      expect(s.isElementSelected('characters', 'Bob')).toBe(true)
    })

    it('ignoreSuggestion : retire de suggestions ET marque comme ignoré', () => {
      const store = useContextStore.getState()
      store.setSuggestions([
        { type: 'character', name: 'Bob' },
        { type: 'location', name: 'Forêt' },
      ])
      store.ignoreSuggestion('character', 'Bob')
      const s = useContextStore.getState()
      expect(s.suggestions.find((sg) => sg.name === 'Bob')).toBeUndefined()
      expect(s.isSuggestionIgnored('character', 'Bob')).toBe(true)
      expect(s.isSuggestionIgnored('location', 'Forêt')).toBe(false)
    })

    it('ignoreSuggestion : ne réapparaît pas après un nouveau setSuggestions', () => {
      const store = useContextStore.getState()
      store.ignoreSuggestion('character', 'Bob')
      store.setSuggestions([{ type: 'character', name: 'Bob' }])
      const s = useContextStore.getState()
      expect(s.suggestions).toHaveLength(0)
    })

    it('acceptAllSuggestionsByType : accepte toutes les suggestions du type', () => {
      const store = useContextStore.getState()
      store.setElementLists({
        characters: [
          { name: 'Alice', data: {} },
          { name: 'Bob', data: {} },
        ],
        locations: [],
        items: [],
        species: [],
        communities: [],
      })
      store.setSuggestions([
        { type: 'character', name: 'Alice' },
        { type: 'character', name: 'Bob' },
        { type: 'location', name: 'Forêt' },
      ])
      store.acceptAllSuggestionsByType('character')
      const s = useContextStore.getState()
      const charSuggestions = s.suggestions.filter((sg) => sg.type === 'character')
      expect(charSuggestions).toHaveLength(0)
      expect(s.suggestions.find((sg) => sg.name === 'Forêt')).toBeDefined()
      expect(s.isElementSelected('characters', 'Alice')).toBe(true)
      expect(s.isElementSelected('characters', 'Bob')).toBe(true)
    })

    it('ignoreAllSuggestionsByType : ignore toutes les suggestions du type', () => {
      const store = useContextStore.getState()
      store.setSuggestions([
        { type: 'character', name: 'Alice' },
        { type: 'character', name: 'Bob' },
        { type: 'location', name: 'Forêt' },
      ])
      store.ignoreAllSuggestionsByType('character')
      const s = useContextStore.getState()
      const charSuggestions = s.suggestions.filter((sg) => sg.type === 'character')
      expect(charSuggestions).toHaveLength(0)
      expect(s.suggestions.find((sg) => sg.name === 'Forêt')).toBeDefined()
      expect(s.isSuggestionIgnored('character', 'Alice')).toBe(true)
      expect(s.isSuggestionIgnored('character', 'Bob')).toBe(true)
    })

    it('clearSelections : réinitialise aussi ignoredSuggestions (session)', () => {
      const store = useContextStore.getState()
      store.ignoreSuggestion('character', 'Bob')
      expect(useContextStore.getState().isSuggestionIgnored('character', 'Bob')).toBe(true)
      store.clearSelections()
      expect(useContextStore.getState().isSuggestionIgnored('character', 'Bob')).toBe(false)
    })
  })
})

