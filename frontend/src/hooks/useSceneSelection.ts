/**
 * Hook personnalisé pour gérer la sélection de scène.
 */
import { useState, useEffect, useCallback, useRef } from 'react'
import * as contextAPI from '../api/context'
import type { SceneSelection } from '../types/generation'
import { useContextStore } from '../store/contextStore'
import { useGenerationStore } from '../store/generationStore'

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
  const isInitialMount = useRef(true)
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

  const loadRegions = useCallback(async () => {
    const contextStore = useContextStore.getState()
    
    // Vérifier le cache avant l'appel API
    if (contextStore.isCacheValid(contextStore.cachedRegions)) {
      setData((prev) => ({
        ...prev,
        regions: contextStore.cachedRegions!.data,
      }))
      return
    }
    
    try {
      const response = await contextAPI.listRegions()
      const regionNames = response.regions.sort()
      
      // Mettre à jour le cache
      contextStore.setCachedRegions(regionNames)
      
      setData((prev) => ({
        ...prev,
        regions: regionNames,
      }))
    } catch (err) {
      console.error('Erreur lors du chargement des régions:', err)
      // En cas d'erreur, utiliser le cache même s'il est expiré si disponible
      if (contextStore.cachedRegions) {
        setData((prev) => ({
          ...prev,
          regions: contextStore.cachedRegions!.data,
        }))
      }
    }
  }, [])

  const loadSubLocations = useCallback(async (regionName: string) => {
    if (!regionName) {
      setData((prev) => ({ ...prev, subLocations: [] }))
      return
    }

    const contextStore = useContextStore.getState()
    const cached = contextStore.cachedSubLocations.get(regionName)
    
    // Vérifier le cache avant l'appel API
    if (cached && contextStore.isCacheValid(cached)) {
      setData((prev) => ({
        ...prev,
        subLocations: cached.data,
      }))
      return
    }

    try {
      const response = await contextAPI.getSubLocations(regionName)
      const subLocationNames = response.sub_locations.sort()
      
      // Mettre à jour le cache pour cette région
      contextStore.setCachedSubLocations(regionName, subLocationNames)
      
      setData((prev) => ({
        ...prev,
        subLocations: subLocationNames,
      }))
    } catch (err) {
      console.error('Erreur lors du chargement des sous-lieux:', err)
      // En cas d'erreur, utiliser le cache même s'il est expiré si disponible
      if (cached) {
        setData((prev) => ({
          ...prev,
          subLocations: cached.data,
        }))
      } else {
        setData((prev) => ({ ...prev, subLocations: [] }))
      }
    }
  }, [])

  useEffect(() => {
    setIsLoading(true)
    Promise.all([loadCharacters(), loadRegions()]).finally(() => {
      setIsLoading(false)
    })
  }, [loadCharacters, loadRegions])

  useEffect(() => {
    if (selection.sceneRegion) {
      loadSubLocations(selection.sceneRegion)
    } else {
      setData((prev) => ({ ...prev, subLocations: [] }))
      setSelection((prev) => ({ ...prev, subLocation: null }))
    }
  }, [selection.sceneRegion, loadSubLocations])

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

  // Synchronisation avec contextStore : mapper les sélections de contexte vers la sélection de scène
  // MAIS seulement si l'état local est vide ET que le store n'a pas de valeurs sauvegardées
  useEffect(() => {
    // Ne pas synchroniser si le store a déjà des valeurs (priorité au draft sauvegardé)
    const hasStoreSelection = storeSceneSelection.characterA || storeSceneSelection.characterB || storeSceneSelection.sceneRegion
    if (hasStoreSelection) {
      return
    }

    setSelection((prevSelection) => {
      // Ne synchroniser que si la sélection de scène est vide (pour éviter d'écraser les sélections manuelles)
      const hasSceneSelection = prevSelection.characterA || prevSelection.characterB || prevSelection.sceneRegion
      
      if (hasSceneSelection) {
        return prevSelection
      }
      
      // Mapper les personnages : les 2 premiers deviennent characterA et characterB
      // Fusionner les listes full et excerpt
      const allCharacters = [
        ...(Array.isArray(contextSelections.characters_full) ? contextSelections.characters_full : []),
        ...(Array.isArray(contextSelections.characters_excerpt) ? contextSelections.characters_excerpt : [])
      ]
      const characterA = allCharacters[0] || null
      const characterB = allCharacters[1] || null
      
      // Mapper les lieux : le premier lieu devient sceneRegion ou subLocation
      let sceneRegion: string | null = null
      let subLocation: string | null = null
      
      // Si une région est sélectionnée dans contextStore, l'utiliser
      if (contextRegion) {
        sceneRegion = contextRegion
        // Si des sous-lieux sont sélectionnés, utiliser le premier
        if (contextSubLocations.length > 0) {
          subLocation = contextSubLocations[0]
        }
      } else {
        // Fusionner les listes full et excerpt pour les lieux
        const allLocations = [
          ...(Array.isArray(contextSelections.locations_full) ? contextSelections.locations_full : []),
          ...(Array.isArray(contextSelections.locations_excerpt) ? contextSelections.locations_excerpt : [])
        ]
        if (allLocations.length > 0) {
          // Sinon, utiliser le premier lieu de la liste
          // On suppose que c'est une région (pas un sous-lieu)
          sceneRegion = allLocations[0]
        }
      }
      
      // Mettre à jour seulement si quelque chose a changé
      if (
        characterA !== prevSelection.characterA ||
        characterB !== prevSelection.characterB ||
        sceneRegion !== prevSelection.sceneRegion ||
        subLocation !== prevSelection.subLocation
      ) {
        return {
          characterA,
          characterB,
          sceneRegion,
          subLocation,
        }
      }
      
      return prevSelection
    })
  }, [contextSelections, contextRegion, contextSubLocations, storeSceneSelection.characterA, storeSceneSelection.characterB, storeSceneSelection.sceneRegion])

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
    
    // Mettre à jour le sous-lieu si il change et que la région est définie
    if (selection.subLocation && selection.sceneRegion && !contextSubLocations.includes(selection.subLocation)) {
      toggleSubLocation(selection.subLocation)
    }
    
    // Gérer le sous-lieu
    if (selection.subLocation !== prevSelection.current.subLocation) {
      // Désélectionner l'ancien sous-lieu comme lieu si il existe et n'est plus sélectionné
      if (prevSelection.current.subLocation) {
        const prevSubLocationExistsInLocations = locations.some((loc) => loc.name === prevSelection.current.subLocation)
        if (prevSubLocationExistsInLocations && allLocations.includes(prevSelection.current.subLocation)) {
          // Vérifier que ce sous-lieu n'est pas aussi la nouvelle région
          if (prevSelection.current.subLocation !== selection.sceneRegion) {
            toggleLocation(prevSelection.current.subLocation)
          }
        }
      }
      
      // Sélectionner le nouveau sous-lieu comme lieu dans le panneau de contexte
      if (selection.subLocation) {
        const subLocationExistsInLocations = locations.some((loc) => loc.name === selection.subLocation)
        if (subLocationExistsInLocations && !allLocations.includes(selection.subLocation)) {
          toggleLocation(selection.subLocation, 'full')
        }
      }
    }
    
    // Mettre à jour la référence pour la prochaine itération
    prevSelection.current = {
      characterA: selection.characterA,
      characterB: selection.characterB,
      sceneRegion: selection.sceneRegion,
      subLocation: selection.subLocation,
    }
    isSwappingRef.current = false
  }, [selection.characterA, selection.characterB, selection.sceneRegion, selection.subLocation, contextSelections.characters_full, contextSelections.characters_excerpt, contextSelections.locations_full, contextSelections.locations_excerpt, contextRegion, contextSubLocations, toggleCharacter, setRegion, toggleSubLocation, toggleLocation, locations])

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
        if (data.characters.length > 0) {
          const randomIndex = Math.floor(Math.random() * data.characters.length)
          const randomChar = data.characters[randomIndex]
          // Éviter de choisir le même personnage pour A et B si possible
          const otherField = field === 'characterA' ? 'characterB' : 'characterA'
          if (randomChar === selection[otherField] && data.characters.length > 1) {
            const nextIndex = (randomIndex + 1) % data.characters.length
            updateSelection({ [field]: data.characters[nextIndex] })
          } else {
            updateSelection({ [field]: randomChar })
          }
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

