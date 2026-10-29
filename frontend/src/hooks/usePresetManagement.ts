/**
 * Hook pour gérer les presets de génération.
 * 
 * Extrait la logique de gestion des presets depuis GenerationPanel.
 */
import { useState, useCallback, useRef } from 'react'
import { getTemplateApi, validateTemplateApi, recordSuggestionUsedApi } from '../api/templates'
import { useGenerationStore } from '../store/generationStore'
import { usePresetStore } from '../store/presetStore'
import { useContextStore } from '../store/contextStore'
import { useLLMStore } from '../store/llmStore'
import { preparePresetForApply } from '../utils/presetUtils'
import { isLlmProvider, prebuiltToTemplate, templateToPreset } from '../utils/templateApply'
import { getErrorMessage } from '../types/errors'
import type { Preset, PresetConfiguration, PresetValidationResult } from '../types/preset'
import type { PrebuiltTemplate, Template, TemplateSuggestion } from '../types/template'
import type { ReasoningEffort } from '../types/api'

function recordTemplateUsed(source: TemplateSuggestion['source'], id: string): void {
  const contextState = useContextStore.getState()
  const characters = [
    ...(Array.isArray(contextState.selections.characters_full)
      ? contextState.selections.characters_full
      : []),
    ...(Array.isArray(contextState.selections.characters_excerpt)
      ? contextState.selections.characters_excerpt
      : []),
  ]
  void Promise.resolve(
    recordSuggestionUsedApi(source, id, {
      sceneType: 'Generic',
      characters,
    }),
  ).then(
    () => undefined,
    () => undefined,
  )
}

function suggestionToTemplate(item: TemplateSuggestion): Template {
  return {
    id: item.id,
    name: item.name,
    description: item.description,
    category: item.category,
    icon: item.icon,
    metadata: { created: '', modified: '' },
    configuration: item.configuration,
    relation: item.relation ?? null,
  }
}

function suggestionToPrebuilt(item: TemplateSuggestion): PrebuiltTemplate {
  return {
    id: item.id,
    name: item.name,
    description: item.description,
    category: item.category,
    icon: item.icon,
    gddSystem: item.gddSystem ?? '',
    sceneTypeHint: item.sceneTypeHint ?? '',
    objectif: item.objectif ?? '',
    casUsage: item.casUsage ?? '',
    examples: item.examples ?? [],
    addedAt: item.addedAt ?? new Date().toISOString(),
    configuration: item.configuration,
  }
}

export type ValidationEntityLabel = 'preset' | 'template'

function notifyApplied(
  entity: 'Preset' | 'Template',
  validation: PresetValidationResult,
  toast: UsePresetManagementOptions['toast'],
): void {
  const obsoleteCount = validation.obsoleteRefs?.length || 0
  const resolvedCount = Object.keys(validation.resolvedRefs ?? {}).length
  if (obsoleteCount > 0 && resolvedCount > 0) {
    toast(
      `${entity} chargé : ${resolvedCount} nom(s) mis à jour, ${obsoleteCount} référence(s) ignorée(s)`,
      'warning',
    )
  } else if (obsoleteCount > 0) {
    toast(`${entity} chargé avec ${obsoleteCount} référence(s) obsolète(s) ignorée(s)`, 'warning')
  } else if (resolvedCount > 0) {
    toast(`${entity} chargé (${resolvedCount} nom(s) GDD mis à jour)`, 'info')
  } else {
    toast(`${entity} chargé avec succès`, 'success')
  }
}

export interface UsePresetManagementReturn {
  /** Charger un preset avec validation */
  handlePresetLoaded: (preset: Preset) => Promise<void>
  /** Charger un template custom (validate + applyPreset + llmProvider) */
  handleTemplateLoaded: (template: Template) => Promise<boolean>
  /** Charger une fiche pré-built (sans GET UUID custom) */
  handlePrebuiltLoaded: (prebuilt: PrebuiltTemplate) => void
  /** Appliquer une suggestion (custom / pré-built / marketplace sans copie) */
  handleSuggestionLoaded: (item: TemplateSuggestion) => Promise<void>
  /** Appliquer un preset directement */
  applyPreset: (preset: Preset) => void
  /** Obtenir la configuration actuelle pour sauvegarde */
  getCurrentConfiguration: () => PresetConfiguration
  /** État du modal de validation */
  isValidationModalOpen: boolean
  /** Résultat de validation */
  validationResult: PresetValidationResult | null
  /** Preset en attente d'application */
  pendingPreset: Preset | null
  /** Libellé du modal (preset vs template) */
  validationEntityLabel: ValidationEntityLabel
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
  reasoningEffort?: ReasoningEffort | null
  /** Setter pour reasoningEffort - optionnel */
  setReasoningEffort?: (
    value: ReasoningEffort | null
  ) => void
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
  /** Température snapshotée (non envoyée à GPT-5.6). */
  temperature?: number | null
  setTemperature?: (value: number | null) => void
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
    setTemperature,
  } = options

  const [isValidationModalOpen, setIsValidationModalOpen] = useState(false)
  const [validationResult, setValidationResult] = useState<PresetValidationResult | null>(null)
  const [pendingPreset, setPendingPreset] = useState<Preset | null>(null)
  const [pendingTemplate, setPendingTemplate] = useState<Template | null>(null)
  const templateLoadSeqRef = useRef(0)

  const clearValidationState = useCallback(() => {
    setIsValidationModalOpen(false)
    setPendingPreset(null)
    setPendingTemplate(null)
    setValidationResult(null)
  }, [])

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

    const generation = useGenerationStore.getState()
    generation.setAppliedTemplate(null)
    generation.setContextDroppingRulesOverlay(config.contextDroppingRules ?? null)

    setIsDirty(true)
    setSaveStatus('unsaved')
  }, [setSceneSelection, setUserInstructions, setIsDirty, setSaveStatus, setTopP, setReasoningEffort, setMaxCompletionTokens, setMaxChoices, setLlmModel])

  const applyTemplateSnapshot = useCallback((template: Template, validation: PresetValidationResult, sourceId?: string) => {
    applyPreset(preparePresetForApply(templateToPreset(template), validation))
    const llmState = useLLMStore.getState()
    const provider = template.configuration.llmProvider
    if (isLlmProvider(provider)) {
      llmState.setProvider(provider)
    }
    if (template.configuration.llmModel) {
      llmState.setModel(template.configuration.llmModel)
    }
    const temperature = template.configuration.temperature
    if (typeof temperature === 'number' && Number.isFinite(temperature)) {
      setTemperature?.(temperature)
    }
    const generation = useGenerationStore.getState()
    generation.setContextDroppingRulesOverlay(
      template.configuration.contextDroppingRules ?? null,
    )
    generation.setAppliedTemplate(sourceId ?? template.id, template.name)
  }, [applyPreset, setTemperature])

  const handlePresetLoaded = useCallback(async (preset: Preset) => {
    try {
      const nextValidation = await usePresetStore
        .getState()
        .validatePreset(preset.id)

      if (!nextValidation.valid) {
        setValidationResult(nextValidation)
        setPendingTemplate(null)
        setPendingPreset(preset)
        setIsValidationModalOpen(true)
      } else {
        clearValidationState()
        applyPreset(preparePresetForApply(preset, nextValidation))
        notifyApplied('Preset', nextValidation, toast)
      }
    } catch (err) {
      const message = getErrorMessage(err)
      toast(`Erreur lors de la validation du preset: ${message}`, 'error')
    }
  }, [applyPreset, toast, clearValidationState])

  const handleTemplateLoaded = useCallback(async (template: Template): Promise<boolean> => {
    const seq = ++templateLoadSeqRef.current
    try {
      const fresh = await getTemplateApi(template.id)
      if (seq !== templateLoadSeqRef.current) return false
      const nextValidation = await validateTemplateApi(fresh.id)
      if (seq !== templateLoadSeqRef.current) return false

      if (!nextValidation.valid) {
        setValidationResult(nextValidation)
        setPendingPreset(null)
        setPendingTemplate(fresh)
        setIsValidationModalOpen(true)
      } else {
        clearValidationState()
        applyTemplateSnapshot(fresh, nextValidation)
        recordTemplateUsed('custom', fresh.id)
        notifyApplied('Template', nextValidation, toast)
      }
      return true
    } catch (err) {
      if (seq !== templateLoadSeqRef.current) return false
      const message = getErrorMessage(err)
      toast(`Erreur lors du chargement du template: ${message}`, 'error')
      return false
    }
  }, [applyTemplateSnapshot, toast, clearValidationState])

  const handlePrebuiltLoaded = useCallback((prebuilt: PrebuiltTemplate) => {
    templateLoadSeqRef.current += 1
    const emptyValidation: PresetValidationResult = {
      valid: true,
      warnings: [],
      obsoleteRefs: [],
    }
    clearValidationState()
    applyTemplateSnapshot(prebuiltToTemplate(prebuilt), emptyValidation, prebuilt.id)
    recordTemplateUsed('prebuilt', prebuilt.id)
    notifyApplied('Template', emptyValidation, toast)
  }, [applyTemplateSnapshot, toast, clearValidationState])

  const handleSuggestionLoaded = useCallback(async (item: TemplateSuggestion) => {
    if (item.source === 'custom') {
      const loaded = await handleTemplateLoaded(suggestionToTemplate(item))
      if (!loaded) {
        throw new Error('load-failed')
      }
      return
    }
    if (item.source === 'prebuilt') {
      handlePrebuiltLoaded(suggestionToPrebuilt(item))
      return
    }
    templateLoadSeqRef.current += 1
    const emptyValidation: PresetValidationResult = {
      valid: true,
      warnings: [],
      obsoleteRefs: [],
    }
    clearValidationState()
    applyTemplateSnapshot(suggestionToTemplate(item), emptyValidation, item.id)
    recordTemplateUsed('marketplace', item.id)
    notifyApplied('Template', emptyValidation, toast)
  }, [applyTemplateSnapshot, toast, clearValidationState, handleTemplateLoaded, handlePrebuiltLoaded])
  
  const handleValidationConfirm = useCallback(() => {
    if (pendingTemplate && validationResult) {
      applyTemplateSnapshot(pendingTemplate, validationResult)
      recordTemplateUsed('custom', pendingTemplate.id)
      notifyApplied('Template', validationResult, toast)
    } else if (pendingPreset && validationResult) {
      applyPreset(preparePresetForApply(pendingPreset, validationResult))
      notifyApplied('Preset', validationResult, toast)
    }
    clearValidationState()
  }, [pendingPreset, pendingTemplate, validationResult, applyPreset, applyTemplateSnapshot, toast, clearValidationState])
  
  const handleValidationClose = useCallback(() => {
    clearValidationState()
  }, [clearValidationState])

  // Configuration actuelle pour sauvegarde preset
  const getCurrentConfiguration = useCallback(() => {
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
      contextSelections: selections,
      selectedRegion,
      selectedSubLocations,
      // Inclure les paramètres optionnels LLM s'ils sont définis
      ...topPSpreadValue,
      ...(options.reasoningEffort !== undefined && options.reasoningEffort !== null ? { reasoningEffort: options.reasoningEffort } : {}),
      ...(options.maxCompletionTokens !== undefined && options.maxCompletionTokens !== null ? { maxCompletionTokens: options.maxCompletionTokens } : {}),
      ...(options.maxChoices !== undefined && options.maxChoices !== null ? { maxChoices: options.maxChoices } : {}),
      ...(options.llmModel !== undefined ? { llmModel: options.llmModel } : {}),
      ...(options.temperature !== undefined && options.temperature !== null ? { temperature: options.temperature } : {}),
      ...(useGenerationStore.getState().contextDroppingRulesOverlay
        ? { contextDroppingRules: useGenerationStore.getState().contextDroppingRulesOverlay }
        : {}),
    }
    
    return config as PresetConfiguration
  }, [sceneSelection, options.userInstructions, options.topP, options.reasoningEffort, options.maxCompletionTokens, options.maxChoices, options.llmModel, options.temperature])

  return {
    handlePresetLoaded,
    handleTemplateLoaded,
    handlePrebuiltLoaded,
    handleSuggestionLoaded,
    applyPreset,
    getCurrentConfiguration,
    isValidationModalOpen,
    validationResult,
    pendingPreset,
    validationEntityLabel: pendingTemplate ? 'template' : 'preset',
    setValidationModalOpen: setIsValidationModalOpen,
    handleValidationConfirm,
    handleValidationClose,
  }
}
