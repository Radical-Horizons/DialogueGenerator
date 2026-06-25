/**
 * Synchronisation scène principale → panneau contexte GDD (lieu / sous-lieu).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useSceneSelection } from './useSceneSelection'

const {
  mockToggleSubLocation,
  mockToggleLocation,
  mockSetRegion,
  mockToggleCharacter,
  contextSubLocationsRef,
  contextRegionRef,
  locationsFullRef,
} = vi.hoisted(() => ({
  mockToggleSubLocation: vi.fn(),
  mockToggleLocation: vi.fn(),
  mockSetRegion: vi.fn(),
  mockToggleCharacter: vi.fn(),
  contextSubLocationsRef: { current: [] as string[] },
  contextRegionRef: { current: null as string | null },
  locationsFullRef: { current: [] as string[] },
}))

vi.mock('../api/context', () => ({
  listCharacters: vi.fn().mockResolvedValue({ characters: [] }),
  listSceneRegions: vi.fn().mockResolvedValue({ regions: ['Forêt Sombre'] }),
  getSceneSubLocations: vi.fn().mockResolvedValue({
    sub_locations: ['Clairière', 'Ruines Antiques'],
  }),
}))

vi.mock('../store/generationStore', () => ({
  useGenerationStore: vi.fn((selector: (s: { sceneSelection: unknown }) => unknown) =>
    selector({
      sceneSelection: {
        characterA: null,
        characterB: null,
        sceneRegion: null,
        subLocation: null,
      },
    }),
  ),
}))

vi.mock('../store/contextStore', () => {
  const contextStoreState = {
    get selections() {
      return {
        characters_full: [],
        characters_excerpt: [],
        locations_full: locationsFullRef.current,
        locations_excerpt: [],
        items_full: [],
        items_excerpt: [],
        species_full: [],
        species_excerpt: [],
        communities_full: [],
        communities_excerpt: [],
        scene_protagonists: undefined,
      }
    },
    get selectedRegion() {
      return contextRegionRef.current
    },
    get selectedSubLocations() {
      return contextSubLocationsRef.current
    },
    locations: [
      { name: 'Forêt Sombre', data: { Nom: 'Forêt Sombre' } },
      { name: 'Clairière', data: { Nom: 'Clairière' } },
      { name: 'Ruines Antiques', data: { Nom: 'Ruines Antiques' } },
    ],
    characters: [],
    gddDataRevision: 0,
    toggleCharacter: mockToggleCharacter,
    setRegion: mockSetRegion,
    toggleSubLocation: mockToggleSubLocation,
    toggleLocation: mockToggleLocation,
    isCacheValid: () => false,
    cachedCharacters: null,
    cachedSceneRegions: null,
    cachedSceneSubLocations: new Map(),
    setCachedCharacters: vi.fn(),
    setCachedSceneRegions: vi.fn(),
    setCachedSceneSubLocations: vi.fn(),
    refreshSuggestionsForTrigger: vi.fn(),
    setSuggestions: vi.fn(),
  }

  return {
    useContextStore: Object.assign(
      vi.fn((selector: (s: Record<string, unknown>) => unknown) => selector(contextStoreState)),
      { getState: () => contextStoreState },
    ),
  }
})

describe('useSceneSelection GDD sync', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    contextSubLocationsRef.current = []
    contextRegionRef.current = null
    locationsFullRef.current = []
  })

  it('sélectionne le sous-lieu dans le GDD via toggleSubLocation uniquement', async () => {
    mockToggleSubLocation.mockImplementation((name: string) => {
      if (contextSubLocationsRef.current.includes(name)) {
        contextSubLocationsRef.current = contextSubLocationsRef.current.filter((n) => n !== name)
        locationsFullRef.current = locationsFullRef.current.filter((n) => n !== name)
      } else {
        contextSubLocationsRef.current = [...contextSubLocationsRef.current, name]
        locationsFullRef.current = [...locationsFullRef.current, name]
      }
    })

    const { result } = renderHook(() => useSceneSelection())

    await waitFor(() => {
      expect(result.current.data.regions).toContain('Forêt Sombre')
    })

    await act(async () => {
      result.current.updateSelection({ sceneRegion: 'Forêt Sombre' })
    })

    await waitFor(() => {
      expect(result.current.data.subLocations).toEqual(['Clairière', 'Ruines Antiques'])
    })

    await act(async () => {
      result.current.updateSelection({ subLocation: 'Clairière' })
    })

    await waitFor(() => {
      expect(mockToggleSubLocation).toHaveBeenCalledWith('Clairière')
    })

    expect(mockToggleLocation).not.toHaveBeenCalledWith('Clairière', 'full')
    expect(contextSubLocationsRef.current).toEqual(['Clairière'])
    expect(locationsFullRef.current).toEqual(['Clairière'])
  })
})
