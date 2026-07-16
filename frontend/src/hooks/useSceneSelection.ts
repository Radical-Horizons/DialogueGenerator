/**
 * Hook personnalisé pour gérer la sélection de scène.
 */
import { useState, useEffect, useCallback, useRef } from 'react'
import * as contextAPI from '../api/context'
import type { SceneSelection } from '../types/generation'
import { useContextStore } from '../store/contextStore'
import { useGenerationStore } from '../store/generationStore'
import { suggestionRefreshAfterSceneChange } from '../utils/contextSuggestionSync'
import {
  mergeContextCharacterNames,
  normalizeGddNameForMatch,
  resolveLocationDisplayName,
} from '../utils/gddEntityNames'
import {
  DEFAULT_PLAYER_CHARACTER,
  isValidNpc,
  randomNpcCharacter,
  randomPlayableCharacter,
  resolveSceneDramatis,
} from '../utils/sceneDramatis'

export interface SceneSelectionData {
  characters: string[]
  regions: string[]
  subLocations: string[]
}

export interface UseSceneSelectionReturn {
  data: SceneSelectionData
  selection: SceneSelection
  isLoading: boolean
  updateSelection: (updates: Partial<SceneSelection>) => void
  swapCharacters: () => void
  randomizeField: (field: keyof SceneSelection) => void
}

function findCatalogName(name: string, catalog: string[]): string | null {
  const normalized = normalizeGddNameForMatch(name)
  return catalog.find((candidate) => normalizeGddNameForMatch(candidate) === normalized) ?? null
}

export function useSceneSelection() {
  const contextSelections = useContextStore((state) => state.selections)
  const contextRegion = useContextStore((state) => state.selectedRegion)
  const contextSubLocations = useContextStore((state) => state.selectedSubLocations)
  const toggleCharacter = useContextStore((state) => state.toggleCharacter)
  const setRegion = useContextStore((state) => state.setRegion)
  const toggleSubLocation = useContextStore((state) => state.toggleSubLocation)
  const toggleLocation = useContextStore((state) => state.toggleLocation)
  const locations = useContextStore((state) => state.locations)
  
  // Récupérer sceneSelection depuis le store pour synchronisation
  const storeSceneSelection = useGenerationStore((state) => state.sceneSelection)
  
  const [data, setData] = useState<SceneSelectionData>({
    characters: [],
    regions: [],
    subLocations: [],
  })
  const [selection, setSelection] = useState<SceneSelection>({
    characterA: null,
    characterB: null,
    sceneRegion: null,
    subLocation: null,
  })
  const [isLoading, setIsLoading] = useState(false)
  const [hasLoadedSceneRegions, setHasLoadedSceneRegions] = useState(false)
  const [loadedSubLocationsRegion, setLoadedSubLocationsRegion] = useState<string | null>(null)
  const isInitialMount = useRef(true)
  const subLocationRequestSeq = useRef(0)
  const prevSelection = useRef<SceneSelection>({
    characterA: null,
    characterB: null,
    sceneRegion: null,
    subLocation: null,
  })
  const isSwappingRef = useRef(false)
  const lastStoreSceneSelectionRef = useRef<SceneSelection | null>(null)

  const loadCharacters = useCallback(async () => {
    const contextStore = useContextStore.getState()
    
    // Vérifier le cache avant l'appel API
    if (contextStore.isCacheValid(contextStore.cachedCharacters)) {
      setData((prev) => ({
        ...prev,
        characters: contextStore.cachedCharacters!.data,
      }))
      return
    }
    
    try {
      const response = await contextAPI.listCharacters()
      const characterNames = response.characters.map((c) => c.name).sort()
      
      // Mettre à jour le cache
      contextStore.setCachedCharacters(characterNames)
      
      setData((prev) => ({
        ...prev,
        characters: characterNames,
      }))
    } catch (err) {
      console.error('Erreur lors du chargement des personnages:', err)
      // En cas d'erreur, utiliser le cache même s'il est expiré si disponible
      if (contextStore.cachedCharacters) {
        setData((prev) => ({
          ...prev,
          characters: contextStore.cachedCharacters!.data,
        }))
      }
    }
  }, [])

  const loadSceneRegions = useCallback(async () => {
    const contextStore = useContextStore.getState()

    if (contextStore.isCacheValid(contextStore.cachedSceneRegions)) {
      setData((prev) => ({
        ...prev,
        regions: contextStore.cachedSceneRegions!.data,
      }))
      setHasLoadedSceneRegions(true)
      return
    }

    try {
      const response = await contextAPI.listSceneRegions()
      const regionNames = [...response.regions].sort()

      contextStore.setCachedSceneRegions(regionNames)

      setData((prev) => ({
        ...prev,
        regions: regionNames,
      }))
      setHasLoadedSceneRegions(true)
    } catch (err) {
      console.error('Erreur lors du chargement des régions (scène):', err)
      if (contextStore.cachedSceneRegions) {
        setData((prev) => ({
          ...prev,
          regions: contextStore.cachedSceneRegions!.data,
        }))
        setHasLoadedSceneRegions(true)
      }
    }
  }, [])

  const loadSubLocations = useCallback(async (regionName: string) => {
    const requestSeq = ++subLocationRequestSeq.current
    if (!regionName) {
      setData((prev) => ({ ...prev, subLocations: [] }))
      setLoadedSubLocationsRegion(null)
      return
    }

    const contextStore = useContextStore.getState()
    const cached = contextStore.cachedSceneSubLocations.get(regionName)

    if (cached && contextStore.isCacheValid(cached)) {
      setData((prev) => ({
        ...prev,
        subLocations: cached.data,
      }))
      setLoadedSubLocationsRegion(regionName)
      return
    }

    try {
      const response = await contextAPI.getSceneSubLocations(regionName)
      if (requestSeq !== subLocationRequestSeq.current) return
      const subLocationNames = [...response.sub_locations].sort()

      contextStore.setCachedSceneSubLocations(regionName, subLocationNames)
      
      setData((prev) => ({
        ...prev,
        subLocations: subLocationNames,
      }))
      setLoadedSubLocationsRegion(regionName)
    } catch (err) {
      if (requestSeq !== subLocationRequestSeq.current) return
      console.error('Erreur lors du chargement des sous-lieux:', err)
      // En cas d'erreur, utiliser le cache même s'il est expiré si disponible
      const stale = contextStore.cachedSceneSubLocations.get(regionName)
      if (stale) {
        setData((prev) => ({
          ...prev,
          subLocations: stale.data,
        }))
        setLoadedSubLocationsRegion(regionName)
      } else {
        setData((prev) => ({ ...prev, subLocations: [] }))
        setLoadedSubLocationsRegion(null)
      }
    }
  }, [])

  const gddDataRevision = useContextStore((s) => s.gddDataRevision)

  useEffect(() => {
    setIsLoading(true)
    setHasLoadedSceneRegions(false)
    Promise.all([loadCharacters(), loadSceneRegions()]).finally(() => {
      setIsLoading(false)
    })
  }, [loadCharacters, loadSceneRegions, gddDataRevision])

  useEffect(() => {
    if (!hasLoadedSceneRegions) return
    if (!selection.sceneRegion) {
      subLocationRequestSeq.current += 1
      setData((prev) => ({ ...prev, subLocations: [] }))
      setLoadedSubLocationsRegion(null)
      setSelection((prev) => ({ ...prev, subLocation: null }))
      return
    }

    const resolved = resolveLocationDisplayName(selection.sceneRegion, locations)
    const canonicalRegion = findCatalogName(resolved, data.regions)
    if (!canonicalRegion) {
      subLocationRequestSeq.current += 1
      setData((prev) => ({ ...prev, subLocations: [] }))
      setLoadedSubLocationsRegion(null)
      setSelection((prev) => ({ ...prev, sceneRegion: null, subLocation: null }))
      return
    }
    if (canonicalRegion !== selection.sceneRegion) {
      setSelection((prev) => ({ ...prev, sceneRegion: canonicalRegion }))
      return
    }
    void loadSubLocations(canonicalRegion)
  }, [
    data.regions,
    hasLoadedSceneRegions,
    loadSubLocations,
    locations,
    selection.sceneRegion,
  ])

  useEffect(() => {
    if (
      !selection.sceneRegion ||
      loadedSubLocationsRegion !== selection.sceneRegion ||
      !selection.subLocation
    ) {
      return
    }
    const resolved = resolveLocationDisplayName(selection.subLocation, locations)
    const canonicalSubLocation = findCatalogName(resolved, data.subLocations)
    setSelection((prev) => {
      if (!canonicalSubLocation) {
        return { ...prev, subLocation: null }
      }
      if (canonicalSubLocation !== prev.subLocation) {
        return { ...prev, subLocation: canonicalSubLocation }
      }
      return prev
    })
  }, [
    data.subLocations,
    loadedSubLocationsRegion,
    locations,
    selection.sceneRegion,
    selection.subLocation,
  ])

  // Synchroniser l'état local avec le store au montage initial et quand le store change
  // Cela permet de restaurer les valeurs sauvegardées depuis le draft
  useEffect(() => {
    const hasStoreSelection = storeSceneSelection.characterA || storeSceneSelection.characterB || storeSceneSelection.sceneRegion
    const prevStoreSelection = lastStoreSceneSelectionRef.current
    lastStoreSceneSelectionRef.current = storeSceneSelection
    
    // Au montage initial, utiliser la valeur du store si elle existe
    if (isInitialMount.current) {
      if (hasStoreSelection) {
        setSelection(storeSceneSelection)
      }
      isInitialMount.current = false
      return
    }
    
    // Après le montage:
    // - Toujours refléter les changements venant du store (ex: chargement preset),
    //   sinon l'UI reste "bloquée" sur l'état local.
    setSelection((prevSelection) => {
      // hasLocalSelection non utilisé - gardé pour usage futur
      // const hasLocalSelection = prevSelection.characterA || prevSelection.characterB || prevSelection.sceneRegion
      const storeChanged =
        !prevStoreSelection ||
        prevStoreSelection.characterA !== storeSceneSelection.characterA ||
        prevStoreSelection.characterB !== storeSceneSelection.characterB ||
        prevStoreSelection.sceneRegion !== storeSceneSelection.sceneRegion ||
        prevStoreSelection.subLocation !== storeSceneSelection.subLocation

      const differsFromLocal =
        prevSelection.characterA !== storeSceneSelection.characterA ||
        prevSelection.characterB !== storeSceneSelection.characterB ||
        prevSelection.sceneRegion !== storeSceneSelection.sceneRegion ||
        prevSelection.subLocation !== storeSceneSelection.subLocation
      if (hasStoreSelection && storeChanged && differsFromLocal) {
        return storeSceneSelection
      }
      return prevSelection
    })
  }, [storeSceneSelection])

  // Contexte GDD → scène : les 2 premiers personnages alimentent PJ/PNJ (indépendamment du lieu).
  useEffect(() => {
    const storeHasCharacters =
      storeSceneSelection.characterA || storeSceneSelection.characterB
    if (storeHasCharacters) {
      return
    }

    const characters = useContextStore.getState().characters
    const allCharacters = mergeContextCharacterNames(
      Array.isArray(contextSelections.characters_full) ? contextSelections.characters_full : [],
      Array.isArray(contextSelections.characters_excerpt) ? contextSelections.characters_excerpt : [],
      characters,
    )
    const dramatis = resolveSceneDramatis({
      sceneProtagonists: contextSelections.scene_protagonists,
      contextCharacters: allCharacters,
    })
    const characterA = dramatis.playerCharacterId
    const characterB = dramatis.npcSpeakerId !== 'PNJ' ? dramatis.npcSpeakerId : null

    setSelection((prev) => {
      if (prev.characterA === characterA && prev.characterB === characterB) {
        return prev
      }
      return {
        ...prev,
        characterA,
        characterB,
      }
    })
  }, [
    contextSelections.characters_full,
    contextSelections.characters_excerpt,
    contextSelections.scene_protagonists,
    storeSceneSelection.characterA,
    storeSceneSelection.characterB,
  ])

  // Contexte GDD → scène : lieux (seulement si scène entièrement vide côté store).
  useEffect(() => {
    const hasStoreSelection =
      storeSceneSelection.characterA ||
      storeSceneSelection.characterB ||
      storeSceneSelection.sceneRegion
    if (hasStoreSelection) {
      return
    }

    setSelection((prevSelection) => {
      const hasSceneSelection =
        prevSelection.characterA || prevSelection.characterB || prevSelection.sceneRegion

      if (hasSceneSelection) {
        return prevSelection
      }

      let sceneRegion: string | null = null
      let subLocation: string | null = null

      const selectedLocationNames = [
        ...(contextRegion ? [contextRegion] : []),
        ...(Array.isArray(contextSelections.locations_full) ? contextSelections.locations_full : []),
        ...(Array.isArray(contextSelections.locations_excerpt) ? contextSelections.locations_excerpt : []),
      ]
      const validRegion = selectedLocationNames
        .map((name) => resolveLocationDisplayName(name, locations))
        .map((name) => findCatalogName(name, data.regions))
        .find((name): name is string => name !== null)

      if (validRegion) {
        sceneRegion = validRegion
        if (contextSubLocations.length > 0) {
          subLocation = contextSubLocations[0]
        }
      }

      if (
        sceneRegion !== prevSelection.sceneRegion ||
        subLocation !== prevSelection.subLocation
      ) {
        return {
          ...prevSelection,
          sceneRegion,
          subLocation,
        }
      }

      return prevSelection
    })
  }, [
    contextSelections.locations_full,
    contextSelections.locations_excerpt,
    contextRegion,
    contextSubLocations,
    data.regions,
    locations,
    storeSceneSelection.characterA,
    storeSceneSelection.characterB,
    storeSceneSelection.sceneRegion,
  ])

  // Synchronisation inverse : mettre à jour contextStore quand sceneSelection change
  useEffect(() => {
    // Ignorer si c'est le montage initial (pas encore de sélection précédente)
    if (isInitialMount.current) {
      prevSelection.current = {
        characterA: selection.characterA,
        characterB: selection.characterB,
        sceneRegion: selection.sceneRegion,
        subLocation: selection.subLocation,
      }
      return
    }

    const prevSnap: SceneSelection = {
      characterA: prevSelection.current.characterA,
      characterB: prevSelection.current.characterB,
      sceneRegion: prevSelection.current.sceneRegion,
      subLocation: prevSelection.current.subLocation,
    }

    // Détecter si c'est un échange de personnages
    const isSwap = 
      prevSelection.current.characterA === selection.characterB &&
      prevSelection.current.characterB === selection.characterA &&
      prevSelection.current.characterA !== null &&
      prevSelection.current.characterB !== null

    // Fusionner les listes full et excerpt pour vérifier si les personnages sont déjà sélectionnés
    const allCharacters = [
      ...(Array.isArray(contextSelections.characters_full) ? contextSelections.characters_full : []),
      ...(Array.isArray(contextSelections.characters_excerpt) ? contextSelections.characters_excerpt : [])
    ]
    
    // Gérer characterA
    if (selection.characterA !== prevSelection.current.characterA) {
      if (prevSelection.current.characterA && !isSwap) {
        // Désélectionner l'ancien characterA seulement si ce n'est pas un swap
        // (et seulement s'il n'est pas characterB)
        if (prevSelection.current.characterA !== selection.characterB && allCharacters.includes(prevSelection.current.characterA)) {
          toggleCharacter(prevSelection.current.characterA)
        }
      }
      // Sélectionner le nouveau characterA s'il n'est pas déjà sélectionné
      if (selection.characterA && !allCharacters.includes(selection.characterA)) {
        toggleCharacter(selection.characterA, 'full')
      }
    }
    
    // Gérer characterB
    if (selection.characterB !== prevSelection.current.characterB) {
      if (prevSelection.current.characterB && !isSwap) {
        // Désélectionner l'ancien characterB seulement si ce n'est pas un swap
        // (et seulement s'il n'est pas characterA)
        if (prevSelection.current.characterB !== selection.characterA && allCharacters.includes(prevSelection.current.characterB)) {
          toggleCharacter(prevSelection.current.characterB)
        }
      }
      // Sélectionner le nouveau characterB s'il n'est pas déjà sélectionné
      if (selection.characterB && !allCharacters.includes(selection.characterB)) {
        toggleCharacter(selection.characterB, 'full')
      }
    }
    
    // Mettre à jour la région si elle change
    if (selection.sceneRegion !== contextRegion) {
      setRegion(selection.sceneRegion)
    }
    
    // Fusionner les listes full et excerpt pour vérifier les lieux sélectionnés
    const allLocations = [
      ...(Array.isArray(contextSelections.locations_full) ? contextSelections.locations_full : []),
      ...(Array.isArray(contextSelections.locations_excerpt) ? contextSelections.locations_excerpt : [])
    ]
    
    // Gérer la région
    if (selection.sceneRegion !== prevSelection.current.sceneRegion) {
      // Désélectionner l'ancienne région comme lieu si elle existe et n'est plus sélectionnée
      if (prevSelection.current.sceneRegion) {
        const prevRegionExistsInLocations = locations.some((loc) => loc.name === prevSelection.current.sceneRegion)
        if (prevRegionExistsInLocations && allLocations.includes(prevSelection.current.sceneRegion)) {
          // Vérifier que cette région n'est pas aussi le nouveau sous-lieu
          if (prevSelection.current.sceneRegion !== selection.subLocation) {
            toggleLocation(prevSelection.current.sceneRegion)
          }
        }
      }
      
      // Sélectionner la nouvelle région comme lieu dans le panneau de contexte
      if (selection.sceneRegion) {
        const regionExistsInLocations = locations.some((loc) => loc.name === selection.sceneRegion)
        if (regionExistsInLocations && !allLocations.includes(selection.sceneRegion)) {
          toggleLocation(selection.sceneRegion, 'full')
        }
      }
    }
    
    // Gérer le sous-lieu (toggleSubLocation met à jour selectedSubLocations + locations_full).
    // Ne pas appeler toggleLocation ensuite : double bascule qui annule la sélection GDD.
    if (selection.subLocation !== prevSelection.current.subLocation) {
      if (
        prevSelection.current.subLocation &&
        contextSubLocations.includes(prevSelection.current.subLocation)
      ) {
        toggleSubLocation(prevSelection.current.subLocation)
      }
      if (
        selection.subLocation &&
        !contextSubLocations.includes(selection.subLocation)
      ) {
        toggleSubLocation(selection.subLocation)
      }
    }

    // Même flux que ContextSelector (checkbox) : 🎲 / combobox mettent à jour le store ici, pas via handleItemToggle.
    const suggestionAction = suggestionRefreshAfterSceneChange(selection, prevSnap)
    const ctx = useContextStore.getState()
    if (suggestionAction.kind === 'fetch') {
      ctx.refreshSuggestionsForTrigger(suggestionAction.triggerType, suggestionAction.triggerName)
    } else if (suggestionAction.kind === 'clear') {
      ctx.setSuggestions([])
    }
    
    // Mettre à jour la référence pour la prochaine itération
    prevSelection.current = {
      characterA: selection.characterA,
      characterB: selection.characterB,
      sceneRegion: selection.sceneRegion,
      subLocation: selection.subLocation,
    }
    isSwappingRef.current = false
  }, [selection, contextSelections.characters_full, contextSelections.characters_excerpt, contextSelections.locations_full, contextSelections.locations_excerpt, contextRegion, contextSubLocations, toggleCharacter, setRegion, toggleSubLocation, toggleLocation, locations])

  const updateSelection = useCallback((updates: Partial<SceneSelection>) => {
    setSelection((prev) => ({ ...prev, ...updates }))
  }, [])

  const swapCharacters = useCallback(() => {
    isSwappingRef.current = true
    setSelection((prev) => ({
      ...prev,
      characterA: prev.characterB,
      characterB: prev.characterA,
    }))
  }, [])

  const randomizeField = useCallback(
    (field: keyof SceneSelection) => {
      if (field === 'characterA' || field === 'characterB') {
        if (field === 'characterA') {
          const nextPlayer = randomPlayableCharacter(selection.characterB)
          const updates: Partial<SceneSelection> = { characterA: nextPlayer }
          if (selection.characterB && !isValidNpc(selection.characterB, nextPlayer)) {
            updates.characterB = randomNpcCharacter(data.characters, nextPlayer)
          }
          updateSelection(updates)
          return
        }
        const playerId = selection.characterA ?? DEFAULT_PLAYER_CHARACTER
        const nextNpc = randomNpcCharacter(data.characters, playerId)
        if (nextNpc) {
          updateSelection({ characterB: nextNpc })
        }
      } else if (field === 'sceneRegion') {
        if (data.regions.length > 0) {
          const random = data.regions[Math.floor(Math.random() * data.regions.length)]
          updateSelection({ sceneRegion: random, subLocation: null })
        }
      } else if (field === 'subLocation') {
        if (data.subLocations.length > 0) {
          const random = data.subLocations[Math.floor(Math.random() * data.subLocations.length)]
          updateSelection({ subLocation: random })
        }
      }
    },
    [data, selection, updateSelection]
  )

  return {
    data,
    selection,
    isLoading,
    updateSelection,
    swapCharacters,
    randomizeField,
  }
}

