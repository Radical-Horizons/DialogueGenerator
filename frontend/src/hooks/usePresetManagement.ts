/**
 * Hook pour gérer les presets de génération.
 * 
 * Extrait la logique de gestion des presets depuis GenerationPanel.
 */
import { useState, useCallback } from 'react'
import { useGenerationStore } from '../store/generationStore'
import { useContextStore } from '../store/contextStore'
import { useContextConfigStore } from '../store/contextConfigStore'
import { filterObsoleteReferences } from '../utils/presetUtils'
import { getErrorMessage } from '../types/errors'
import type { Preset, PresetValidationResult } from '../types/preset'

export interface UsePresetManagementReturn {
  /** Charger un preset avec validation */
  handlePresetLoaded: (preset: Preset) => Promise<void>
  /** Appliquer un preset directement */
  applyPreset: (preset: Preset) => void
  /** Obtenir la configuration actuelle pour sauvegarde */
  getCurrentConfiguration: () => Record<string, unknown>
  /** État du modal de validation */
  isValidationModalOpen: boolean
  /** Résultat de validation */
  validationResult: PresetValidationResult | null
  /** Preset en attente d'application */
  pendingPreset: Preset | null
  /** Ouvrir/fermer le modal de validation */
  setValidationModalOpen: (open: boolean) => void
  /** Confirmer l'application du preset avec filtrage */
  handleValidationConfirm: () => void
  /** Fermer le modal de validation */
  handleValidationClose: () => void
}

export interface UsePresetManagementOptions {
  /** Instructions utilisateur */
  userInstructions: string
  /** Setter pour userInstructions */
  setUserInstructions: (instructions: string) => void
  /** Setter pour isDirty */
  setIsDirty: (dirty: boolean) => void
  /** Setter pour saveStatus */
  setSaveStatus: (status: 'saved' | 'unsaved' | 'saving' | 'error') => void
  /** Toast function */
  toast: (message: string, type?: 'success' | 'error' | 'info' | 'warning', duration?: number) => void
  /** Top_p (nucleus sampling) - optionnel */
  topP?: number | null
  /** Setter pour topP - optionnel */
  setTopP?: (value: number | null) => void
  /** Reasoning effort - optionnel */
  reasoningEffort?: 'none' | 'low' | 'medium' | 'high' | 'xhigh' | null
  /** Setter pour reasoningEffort - optionnel */
  setReasoningEffort?: (value: 'none' | 'low' | 'medium' | 'high' | 'xhigh' | null) => void
  /** Max completion tokens - optionnel */
  maxCompletionTokens?: number | null
  /** Setter pour maxCompletionTokens - optionnel */
  setMaxCompletionTokens?: (value: number | null) => void
  /** Max choices - optionnel */
  maxChoices?: number | null
  /** Setter pour maxChoices - optionnel */
  setMaxChoices?: (value: number | null) => void
  /** LLM model - optionnel */
  llmModel?: string
  /** Setter pour llmModel - optionnel */
  setLlmModel?: (value: string) => void
}

/**
 * Hook pour gérer les presets de génération.
 * 
 * Gère le chargement, la validation et l'application des presets.
 * 
 * @param options - Options avec valeurs et setters
 * @returns Fonctions de gestion des presets et état du modal
 */
export function usePresetManagement(
  options: UsePresetManagementOptions
): UsePresetManagementReturn {
  const {
    setUserInstructions,
    setIsDirty,
    setSaveStatus,
    toast,
    setTopP,
    setReasoningEffort,
    setMaxCompletionTokens,
    setMaxChoices,
    setLlmModel,
  } = options

  const [isValidationModalOpen, setIsValidationModalOpen] = useState(false)
  const [validationResult, setValidationResult] = useState<PresetValidationResult | null>(null)
  const [pendingPreset, setPendingPreset] = useState<Preset | null>(null)

  const {
    sceneSelection,
    setSceneSelection,
  } = useGenerationStore()

  const applyPreset = useCallback((preset: Preset) => {
    const config = preset.configuration

    // Appliquer le preset au ContextStore pour que le ContextSelector reflète exactement le preset
    const contextState = useContextStore.getState()
    if (config.contextSelections) {
      contextState.restoreState(
        config.contextSelections,
        config.selectedRegion ?? config.region ?? null,
        Array.isArray(config.selectedSubLocations)
          ? config.selectedSubLocations
          : (config.subLocation ? [config.subLocation] : [])
      )
    } else {
      contextState.clearSelections()
      ;(config.characters || []).forEach((name: string) => {
        contextState.toggleCharacter(name, 'full')
      })
      contextState.setRegion(config.region || null)
      if (config.subLocation) {
        contextState.toggleSubLocation(config.subLocation)
      }
    }

    // Pré-remplir sceneSelection
    setSceneSelection({
      characterA: config.characters?.[0] || null,
      characterB: config.characters?.[1] || null,
      sceneRegion: (config.selectedRegion ?? config.region) || null,
      subLocation: (Array.isArray(config.selectedSubLocations) ? config.selectedSubLocations[0] : config.subLocation) || null,
    })

    // Pré-remplir instructions
    setUserInstructions(config.instructions || '')

    // Pré-remplir fieldConfigs si sauvegardé
    if (config.fieldConfigs) {
      const { setFieldConfig } = useContextConfigStore.getState()
      Object.entries(config.fieldConfigs).forEach(([category, fields]) => {
        setFieldConfig(category, fields as string[])
      })
    }

    // Pré-remplir les paramètres optionnels LLM si présents dans le preset
    if (config.topP !== undefined && setTopP) {
      setTopP(config.topP)
    }
    if (config.reasoningEffort !== undefined && setReasoningEffort) {
      setReasoningEffort(config.reasoningEffort)
    }
    if (config.maxCompletionTokens !== undefined && setMaxCompletionTokens) {
      setMaxCompletionTokens(config.maxCompletionTokens)
    }
    if (config.maxChoices !== undefined && setMaxChoices) {
      setMaxChoices(config.maxChoices)
    }
    if (config.llmModel !== undefined && setLlmModel) {
      setLlmModel(config.llmModel)
    }

    setIsDirty(true)
    setSaveStatus('unsaved')
  }, [setSceneSelection, setUserInstructions, setIsDirty, setSaveStatus, setTopP, setReasoningEffort, setMaxCompletionTokens, setMaxChoices, setLlmModel])

  const handlePresetLoaded = useCallback(async (preset: Preset) => {
    try {
      // Validation du preset
      const validation = await fetch(`/api/v1/presets/${preset.id}/validate`)
      const validationResult = await validation.json()

      if (!validationResult.valid) {
        // Afficher modal de validation si références obsolètes
        setValidationResult(validationResult)
        setPendingPreset(preset)
        setIsValidationModalOpen(true)
      } else {
        // Appliquer directement si valide
        applyPreset(preset)
        toast('Preset chargé avec succès', 'success')
      }
    } catch (err) {
      const message = getErrorMessage(err)
      toast(`Erreur lors de la validation du preset: ${message}`, 'error')
    }
  }, [applyPreset, toast])
  
  const handleValidationConfirm = useCallback(() => {
    if (pendingPreset && validationResult) {
      // Filtrer les références obsolètes avant d'appliquer le preset
      const filteredPreset = filterObsoleteReferences(pendingPreset, validationResult.obsoleteRefs || [])
      applyPreset(filteredPreset)
      
      // Améliorer toast avec nombre de références obsolètes ignorées
      const obsoleteCount = validationResult.obsoleteRefs?.length || 0
      if (obsoleteCount > 0) {
        toast(`Preset chargé avec ${obsoleteCount} référence(s) obsolète(s) ignorée(s)`, 'warning')
      } else {
        toast('Preset chargé avec succès', 'success')
      }
    }
    setIsValidationModalOpen(false)
    setPendingPreset(null)
    setValidationResult(null)
  }, [pendingPreset, validationResult, applyPreset, toast])
  
  const handleValidationClose = useCallback(() => {
    setIsValidationModalOpen(false)
    setPendingPreset(null)
    setValidationResult(null)
  }, [])

  // Configuration actuelle pour sauvegarde preset
  const getCurrentConfiguration = useCallback(() => {
    const { fieldConfigs } = useContextConfigStore.getState()
    const contextState = useContextStore.getState()
    const selections = contextState.selections
    const selectedRegion = contextState.selectedRegion
    const selectedSubLocations = contextState.selectedSubLocations

    const uniq = <T,>(arr: T[]) => Array.from(new Set(arr))
    const allCharacters = uniq([
      ...(Array.isArray(selections.characters_full) ? selections.characters_full : []),
      ...(Array.isArray(selections.characters_excerpt) ? selections.characters_excerpt : []),
    ])

    // Locations: inclure les cases cochées + région + sous-lieux (exhaustif)
    const allLocations = uniq([
      ...(Array.isArray(selections.locations_full) ? selections.locations_full : []),
      ...(Array.isArray(selections.locations_excerpt) ? selections.locations_excerpt : []),
      ...(selectedRegion ? [selectedRegion] : []),
      ...(Array.isArray(selectedSubLocations) ? selectedSubLocations : []),
    ])
    
    const topPSpreadValue = options.topP !== undefined && options.topP !== null ? { topP: options.topP } : {};
    const config = {
      characters: allCharacters,
      locations: allLocations,
      region: selectedRegion || sceneSelection.sceneRegion || '',
      subLocation: selectedSubLocations?.[0] || sceneSelection.subLocation || undefined,
      sceneType: 'Generic', // TODO: Inférer depuis narrative tags ou instructions
      instructions: options.userInstructions,
      fieldConfigs,
      contextSelections: selections,
      selectedRegion,
      selectedSubLocations,
      // Inclure les paramètres optionnels LLM s'ils sont définis
      ...topPSpreadValue,
      ...(options.reasoningEffort !== undefined && options.reasoningEffort !== null ? { reasoningEffort: options.reasoningEffort } : {}),
      ...(options.maxCompletionTokens !== undefined && options.maxCompletionTokens !== null ? { maxCompletionTokens: options.maxCompletionTokens } : {}),
      ...(options.maxChoices !== undefined && options.maxChoices !== null ? { maxChoices: options.maxChoices } : {}),
      ...(options.llmModel !== undefined ? { llmModel: options.llmModel } : {}),
    }
    
    return config
  }, [sceneSelection, options.userInstructions, options.topP, options.reasoningEffort, options.maxCompletionTokens, options.maxChoices, options.llmModel])

  return {
    handlePresetLoaded,
    applyPreset,
    getCurrentConfiguration,
    isValidationModalOpen,
    validationResult,
    pendingPreset,
    setValidationModalOpen: setIsValidationModalOpen,
    handleValidationConfirm,
    handleValidationClose,
  }
}
