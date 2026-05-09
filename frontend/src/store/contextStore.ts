/**
 * Store Zustand pour gérer les sélections de contexte.
 */
import { create } from 'zustand'
import * as contextAPI from '../api/context'
import type { 
  ContextSelection,
  ElementMode,
  CharacterResponse,
  LocationResponse,
  ItemResponse,
  SpeciesResponse,
  CommunityResponse,
  NarrativeContextResponse,
  SuggestionItem,
  SuggestionEntityType,
} from '../types/api'

// TTL pour le cache (30 minutes)
const CACHE_TTL = 30 * 60 * 1000

interface CachedData {
  data: string[]
  timestamp: number
}

interface ContextState {
  selections: ContextSelection
  selectedRegion: string | null
  selectedSubLocations: string[]
  // Listes des éléments disponibles (chargées depuis ContextSelector)
  characters: CharacterResponse[]
  locations: LocationResponse[]
  items: ItemResponse[]
  species: SpeciesResponse[]
  communities: CommunityResponse[]
  narrativeContexts: NarrativeContextResponse[]
  // Suggestions automatiques (Story 3.3)
  suggestions: SuggestionItem[]
  ignoredSuggestions: string[]  // clés session: "${type}:${name}"
  // Cache pour éviter les appels API redondants
  cachedCharacters: CachedData | null
  cachedRegions: CachedData | null
  /** Cache pour le widget Scène principale (régions hiérarchiques, pas le catalogue Lieux). */
  cachedSceneRegions: CachedData | null
  cachedSubLocations: Map<string, CachedData>
  cachedSceneSubLocations: Map<string, CachedData>
  cachedNarrativeContexts: CachedData | null
  setSelections: (selections: ContextSelection) => void
  setElementLists: (lists: {
    characters: CharacterResponse[]
    locations: LocationResponse[]
    items: ItemResponse[]
    species: SpeciesResponse[]
    communities: CommunityResponse[]
    narrativeContexts?: NarrativeContextResponse[]
  }) => void
  toggleCharacter: (name: string, mode?: ElementMode) => void
  toggleLocation: (name: string, mode?: ElementMode) => void
  toggleItem: (name: string, mode?: ElementMode) => void
  toggleSpecies: (name: string, mode?: ElementMode) => void
  toggleCommunity: (name: string, mode?: ElementMode) => void
  toggleNarrativeContext: (category: 'narrative_structures' | 'chapters' | 'scenes', name: string) => void
  setElementMode: (elementType: 'characters' | 'locations' | 'items' | 'species' | 'communities', name: string, mode: ElementMode) => void
  getElementMode: (elementType: 'characters' | 'locations' | 'items' | 'species' | 'communities', name: string) => ElementMode | null
  isElementSelected: (elementType: 'characters' | 'locations' | 'items' | 'species' | 'communities', name: string) => boolean
  setRegion: (regionName: string | null) => void
  toggleSubLocation: (name: string) => void
  applyLinkedElements: (elements: string[]) => void
  clearSelections: () => void
  restoreState: (selections: ContextSelection, region: string | null, subLocations: string[]) => void
  // Actions suggestions (Story 3.3)
  setSuggestions: (suggestions: SuggestionItem[]) => void
  /** Rafraîchit les suggestions (ex. après synchro scène→contexte, hors ContextSelector). */
  refreshSuggestionsForTrigger: (triggerType: string, triggerName: string, dialogueType?: string | null) => void
  acceptSuggestion: (type: SuggestionEntityType, name: string) => void
  ignoreSuggestion: (type: SuggestionEntityType, name: string) => void
  acceptAllSuggestionsByType: (type: SuggestionEntityType) => void
  ignoreAllSuggestionsByType: (type: SuggestionEntityType) => void
  isSuggestionIgnored: (type: SuggestionEntityType, name: string) => boolean
  // Actions pour le cache
  setCachedCharacters: (characters: string[]) => void
  setCachedRegions: (regions: string[]) => void
  setCachedSceneRegions: (regions: string[]) => void
  setCachedSubLocations: (regionName: string, subLocations: string[]) => void
  setCachedSceneSubLocations: (regionName: string, subLocations: string[]) => void
  invalidateCache: () => void
  isCacheValid: (cached: CachedData | null) => boolean
  /** Incrémenté après sync GDD Notion / restauration archive pour forcer le rechargement des listes contexte. */
  gddDataRevision: number
  bumpGddDataRevision: () => void
}

const defaultSelections: ContextSelection = {
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
}

function normalizeSelections(selections: ContextSelection): ContextSelection {
  return {
    ...defaultSelections,
    ...selections,
    characters_full: Array.isArray(selections.characters_full) ? selections.characters_full : [],
    characters_excerpt: Array.isArray(selections.characters_excerpt) ? selections.characters_excerpt : [],
    locations_full: Array.isArray(selections.locations_full) ? selections.locations_full : [],
    locations_excerpt: Array.isArray(selections.locations_excerpt) ? selections.locations_excerpt : [],
    items_full: Array.isArray(selections.items_full) ? selections.items_full : [],
    items_excerpt: Array.isArray(selections.items_excerpt) ? selections.items_excerpt : [],
    species_full: Array.isArray(selections.species_full) ? selections.species_full : [],
    species_excerpt: Array.isArray(selections.species_excerpt) ? selections.species_excerpt : [],
    communities_full: Array.isArray(selections.communities_full) ? selections.communities_full : [],
    communities_excerpt: Array.isArray(selections.communities_excerpt) ? selections.communities_excerpt : [],
    dialogues_examples: Array.isArray(selections.dialogues_examples) ? selections.dialogues_examples : [],
    narrative_structures: Array.isArray(selections.narrative_structures) ? selections.narrative_structures : [],
    chapters: Array.isArray(selections.chapters) ? selections.chapters : [],
    scenes: Array.isArray(selections.scenes) ? selections.scenes : [],
  }
}

export const useContextStore = create<ContextState>((set, get) => ({
  selections: defaultSelections,
  selectedRegion: null,
  selectedSubLocations: [],
  characters: [],
  locations: [],
  items: [],
  species: [],
  communities: [],
  narrativeContexts: [],
  // Suggestions state initial (Story 3.3)
  suggestions: [],
  ignoredSuggestions: [],
  // Cache initial
  cachedCharacters: null,
  cachedRegions: null,
  cachedSceneRegions: null,
  cachedSubLocations: new Map<string, CachedData>(),
  cachedSceneSubLocations: new Map<string, CachedData>(),
  cachedNarrativeContexts: null,
  gddDataRevision: 0,

  setSelections: (selections: ContextSelection) => {
    set({ selections: normalizeSelections(selections) })
  },

  setElementLists: (lists) => {
    set({
      characters: lists.characters,
      locations: lists.locations,
      items: lists.items,
      species: lists.species,
      communities: lists.communities,
      narrativeContexts: lists.narrativeContexts ?? [],
    })
  },

  toggleCharacter: (name: string, mode: ElementMode = 'full') => {
    set((state) => {
      const isInFull = state.selections.characters_full.includes(name)
      const isInExcerpt = state.selections.characters_excerpt.includes(name)
      const isSelected = isInFull || isInExcerpt
      
      if (isSelected) {
        // Retirer des deux listes
        return {
          selections: {
            ...state.selections,
            characters_full: state.selections.characters_full.filter((n) => n !== name),
            characters_excerpt: state.selections.characters_excerpt.filter((n) => n !== name),
          },
        }
      } else {
        // Ajouter dans la liste correspondante
        if (mode === 'full') {
          return {
            selections: {
              ...state.selections,
              characters_full: [...state.selections.characters_full, name],
            },
          }
        } else {
          return {
            selections: {
              ...state.selections,
              characters_excerpt: [...state.selections.characters_excerpt, name],
            },
          }
        }
      }
    })
  },

  toggleLocation: (name: string, mode: ElementMode = 'full') => {
    set((state) => {
      const isInFull = state.selections.locations_full.includes(name)
      const isInExcerpt = state.selections.locations_excerpt.includes(name)
      const isSelected = isInFull || isInExcerpt
      
      if (isSelected) {
        return {
          selections: {
            ...state.selections,
            locations_full: state.selections.locations_full.filter((n) => n !== name),
            locations_excerpt: state.selections.locations_excerpt.filter((n) => n !== name),
          },
        }
      } else {
        if (mode === 'full') {
          return {
            selections: {
              ...state.selections,
              locations_full: [...state.selections.locations_full, name],
            },
          }
        } else {
          return {
            selections: {
              ...state.selections,
              locations_excerpt: [...state.selections.locations_excerpt, name],
            },
          }
        }
      }
    })
  },

  toggleItem: (name: string, mode: ElementMode = 'full') => {
    set((state) => {
      const isInFull = state.selections.items_full.includes(name)
      const isInExcerpt = state.selections.items_excerpt.includes(name)
      const isSelected = isInFull || isInExcerpt
      
      if (isSelected) {
        return {
          selections: {
            ...state.selections,
            items_full: state.selections.items_full.filter((n) => n !== name),
            items_excerpt: state.selections.items_excerpt.filter((n) => n !== name),
          },
        }
      } else {
        if (mode === 'full') {
          return {
            selections: {
              ...state.selections,
              items_full: [...state.selections.items_full, name],
            },
          }
        } else {
          return {
            selections: {
              ...state.selections,
              items_excerpt: [...state.selections.items_excerpt, name],
            },
          }
        }
      }
    })
  },

  toggleSpecies: (name: string, mode: ElementMode = 'full') => {
    set((state) => {
      const isInFull = state.selections.species_full.includes(name)
      const isInExcerpt = state.selections.species_excerpt.includes(name)
      const isSelected = isInFull || isInExcerpt
      
      if (isSelected) {
        return {
          selections: {
            ...state.selections,
            species_full: state.selections.species_full.filter((n) => n !== name),
            species_excerpt: state.selections.species_excerpt.filter((n) => n !== name),
          },
        }
      } else {
        if (mode === 'full') {
          return {
            selections: {
              ...state.selections,
              species_full: [...state.selections.species_full, name],
            },
          }
        } else {
          return {
            selections: {
              ...state.selections,
              species_excerpt: [...state.selections.species_excerpt, name],
            },
          }
        }
      }
    })
  },

  toggleCommunity: (name: string, mode: ElementMode = 'full') => {
    set((state) => {
      const isInFull = state.selections.communities_full.includes(name)
      const isInExcerpt = state.selections.communities_excerpt.includes(name)
      const isSelected = isInFull || isInExcerpt
      
      if (isSelected) {
        return {
          selections: {
            ...state.selections,
            communities_full: state.selections.communities_full.filter((n) => n !== name),
            communities_excerpt: state.selections.communities_excerpt.filter((n) => n !== name),
          },
        }
      } else {
        if (mode === 'full') {
          return {
            selections: {
              ...state.selections,
              communities_full: [...state.selections.communities_full, name],
            },
          }
        } else {
          return {
            selections: {
              ...state.selections,
              communities_excerpt: [...state.selections.communities_excerpt, name],
            },
          }
        }
      }
    })
  },

  toggleNarrativeContext: (category, name) => {
    set((state) => {
      const current = state.selections[category] || []
      const next = current.includes(name)
        ? current.filter((n) => n !== name)
        : [...current, name]
      return {
        selections: {
          ...state.selections,
          [category]: next,
        },
      }
    })
  },

  setElementMode: (elementType, name, mode) => {
    set((state) => {
      const fullKey = `${elementType}_full` as keyof ContextSelection
      const excerptKey = `${elementType}_excerpt` as keyof ContextSelection
      
      const fullList = (state.selections[fullKey] as string[]) || []
      const excerptList = (state.selections[excerptKey] as string[]) || []
      
      // Retirer de l'ancienne liste
      const newFullList = fullList.filter((n) => n !== name)
      const newExcerptList = excerptList.filter((n) => n !== name)
      
      // Ajouter dans la nouvelle liste
      if (mode === 'full') {
        newFullList.push(name)
      } else {
        newExcerptList.push(name)
      }
      
      return {
        selections: {
          ...state.selections,
          [fullKey]: newFullList,
          [excerptKey]: newExcerptList,
        },
      }
    })
  },

  getElementMode: (elementType, name) => {
    const state = get()
    const fullKey = `${elementType}_full` as keyof ContextSelection
    const excerptKey = `${elementType}_excerpt` as keyof ContextSelection
    
    const fullList = (state.selections[fullKey] as string[]) || []
    const excerptList = (state.selections[excerptKey] as string[]) || []
    
    if (fullList.includes(name)) return 'full'
    if (excerptList.includes(name)) return 'excerpt'
    return null
  },

  isElementSelected: (elementType, name) => {
    const state = get()
    const fullKey = `${elementType}_full` as keyof ContextSelection
    const excerptKey = `${elementType}_excerpt` as keyof ContextSelection
    
    const fullList = (state.selections[fullKey] as string[]) || []
    const excerptList = (state.selections[excerptKey] as string[]) || []
    
    return fullList.includes(name) || excerptList.includes(name)
  },

  setRegion: (regionName: string | null) => {
    set((state) => {
      // Retirer les sous-lieux de la sélection si on change de région
      const allLocations = [...state.selections.locations_full, ...state.selections.locations_excerpt]
      const locationsToRemove = regionName === null
        ? state.selectedSubLocations.filter((loc) => allLocations.includes(loc))
        : []
      
      return {
        selectedRegion: regionName,
        selectedSubLocations: [],
        selections: {
          ...state.selections,
          locations_full: state.selections.locations_full.filter((loc) => !locationsToRemove.includes(loc)),
          locations_excerpt: state.selections.locations_excerpt.filter((loc) => !locationsToRemove.includes(loc)),
        },
      }
    })
  },

  toggleSubLocation: (name: string) => {
    set((state) => {
      const subLocations = state.selectedSubLocations.includes(name)
        ? state.selectedSubLocations.filter((n) => n !== name)
        : [...state.selectedSubLocations, name]
      
      // Mettre à jour aussi la liste des locations dans selections (ajouter en full par défaut)
      const isInFull = state.selections.locations_full.includes(name)
      const isInExcerpt = state.selections.locations_excerpt.includes(name)
      const isSelected = isInFull || isInExcerpt
      
      if (isSelected) {
        return {
          selectedSubLocations: subLocations,
          selections: {
            ...state.selections,
            locations_full: state.selections.locations_full.filter((n) => n !== name),
            locations_excerpt: state.selections.locations_excerpt.filter((n) => n !== name),
          },
        }
      } else {
        return {
          selectedSubLocations: subLocations,
          selections: {
            ...state.selections,
            locations_full: [...state.selections.locations_full, name],
          },
        }
      }
    })
  },

  applyLinkedElements: (elements: string[]) => {
    set((state) => {
      const newSelections = { ...state.selections }
      
      // Déterminer le type de chaque élément en cherchant dans les listes du store
      for (const elementName of elements) {
        // Chercher dans chaque catégorie (ordre important)
        // Par défaut, ajouter en mode "full"
        if (state.characters.some((char) => char.name === elementName)) {
          if (!newSelections.characters_full.includes(elementName) && !newSelections.characters_excerpt.includes(elementName)) {
            newSelections.characters_full = [...newSelections.characters_full, elementName]
          }
        } else if (state.locations.some((loc) => loc.name === elementName)) {
          if (!newSelections.locations_full.includes(elementName) && !newSelections.locations_excerpt.includes(elementName)) {
            newSelections.locations_full = [...newSelections.locations_full, elementName]
          }
        } else if (state.items.some((item) => item.name === elementName)) {
          if (!newSelections.items_full.includes(elementName) && !newSelections.items_excerpt.includes(elementName)) {
            newSelections.items_full = [...newSelections.items_full, elementName]
          }
        } else if (state.species.some((spec) => spec.name === elementName)) {
          if (!newSelections.species_full.includes(elementName) && !newSelections.species_excerpt.includes(elementName)) {
            newSelections.species_full = [...newSelections.species_full, elementName]
          }
        } else if (state.communities.some((comm) => comm.name === elementName)) {
          if (!newSelections.communities_full.includes(elementName) && !newSelections.communities_excerpt.includes(elementName)) {
            newSelections.communities_full = [...newSelections.communities_full, elementName]
          }
        } else {
          console.warn(`Élément "${elementName}" non trouvé dans les listes, ignoré`)
        }
      }
      
      return {
        selections: newSelections,
      }
    })
  },

  clearSelections: () => {
    set({ 
      selections: defaultSelections,
      selectedRegion: null,
      selectedSubLocations: [],
      suggestions: [],
      ignoredSuggestions: [],
    })
  },

  restoreState: (selections: ContextSelection, region: string | null, subLocations: string[]) => {
    set({
      selections: normalizeSelections(selections),
      selectedRegion: region,
      selectedSubLocations: subLocations,
    })
  },

  // ---- Actions suggestions (Story 3.3) ----

  setSuggestions: (suggestions: SuggestionItem[]) => {
    set((state) => ({
      suggestions: suggestions.filter(
        (sg) => !state.ignoredSuggestions.includes(`${sg.type}:${sg.name}`)
      ),
    }))
  },

  refreshSuggestionsForTrigger: (triggerType: string, triggerName: string, dialogueType?: string | null) => {
    void (async () => {
      try {
        const state = get()
        const response = await contextAPI.getSuggestions({
          trigger_type: triggerType,
          trigger_name: triggerName,
          already_selected: state.selections,
          dialogue_type: dialogueType ?? undefined,
        })
        state.setSuggestions(response.suggestions)
      } catch {
        // Suggestions non-critiques
      }
    })()
  },

  acceptSuggestion: (type: SuggestionEntityType, name: string) => {
    const state = get()
    // Ajouter à la sélection (seulement si pas déjà sélectionné)
    const storeTypeMap: Record<SuggestionEntityType, () => void> = {
      character: () => { if (!state.isElementSelected('characters', name)) state.toggleCharacter(name) },
      location: () => { if (!state.isElementSelected('locations', name)) state.toggleLocation(name) },
      item: () => { if (!state.isElementSelected('items', name)) state.toggleItem(name) },
      species: () => { if (!state.isElementSelected('species', name)) state.toggleSpecies(name) },
      community: () => { if (!state.isElementSelected('communities', name)) state.toggleCommunity(name) },
    }
    storeTypeMap[type]?.()
    // Retirer des suggestions
    set((s) => ({ suggestions: s.suggestions.filter((sg) => !(sg.type === type && sg.name === name)) }))
  },

  ignoreSuggestion: (type: SuggestionEntityType, name: string) => {
    const key = `${type}:${name}`
    set((state) => ({
      suggestions: state.suggestions.filter((sg) => !(sg.type === type && sg.name === name)),
      ignoredSuggestions: state.ignoredSuggestions.includes(key)
        ? state.ignoredSuggestions
        : [...state.ignoredSuggestions, key],
    }))
  },

  acceptAllSuggestionsByType: (type: SuggestionEntityType) => {
    const state = get()
    const toAccept = state.suggestions.filter((sg) => sg.type === type)
    toAccept.forEach((sg) => state.acceptSuggestion(type, sg.name))
  },

  ignoreAllSuggestionsByType: (type: SuggestionEntityType) => {
    const state = get()
    const toIgnore = state.suggestions.filter((sg) => sg.type === type)
    toIgnore.forEach((sg) => state.ignoreSuggestion(type, sg.name))
  },

  isSuggestionIgnored: (type: SuggestionEntityType, name: string) => {
    return get().ignoredSuggestions.includes(`${type}:${name}`)
  },

  // Actions pour le cache
  setCachedCharacters: (characters: string[]) => {
    set({
      cachedCharacters: {
        data: characters,
        timestamp: Date.now(),
      },
    })
  },

  setCachedRegions: (regions: string[]) => {
    set({
      cachedRegions: {
        data: regions,
        timestamp: Date.now(),
      },
    })
  },

  setCachedSceneRegions: (regions: string[]) => {
    set({
      cachedSceneRegions: {
        data: regions,
        timestamp: Date.now(),
      },
    })
  },

  setCachedSubLocations: (regionName: string, subLocations: string[]) => {
    set((state) => {
      const newCache = new Map(state.cachedSubLocations)
      newCache.set(regionName, {
        data: subLocations,
        timestamp: Date.now(),
      })
      return { cachedSubLocations: newCache }
    })
  },

  setCachedSceneSubLocations: (regionName: string, subLocations: string[]) => {
    set((state) => {
      const newCache = new Map(state.cachedSceneSubLocations)
      newCache.set(regionName, {
        data: subLocations,
        timestamp: Date.now(),
      })
      return { cachedSceneSubLocations: newCache }
    })
  },

  invalidateCache: () => {
    set({
      cachedCharacters: null,
      cachedRegions: null,
      cachedSceneRegions: null,
      cachedSubLocations: new Map<string, CachedData>(),
      cachedSceneSubLocations: new Map<string, CachedData>(),
      cachedNarrativeContexts: null,
    })
  },

  bumpGddDataRevision: () => {
    set((state) => ({ gddDataRevision: state.gddDataRevision + 1 }))
  },

  isCacheValid: (cached: CachedData | null) => {
    if (!cached) return false
    return Date.now() - cached.timestamp < CACHE_TTL
  },
}))

