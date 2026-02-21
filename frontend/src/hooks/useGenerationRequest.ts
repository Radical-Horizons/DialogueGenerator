/**
 * Hook pour construire et valider les requêtes de génération.
 * 
 * Extrait la logique de construction de ContextSelection et GenerateUnityDialogueRequest
 * depuis GenerationPanel.
 */
import { useCallback } from 'react'
import { useContextStore } from '../store/contextStore'
import { useGenerationStore } from '../store/generationStore'
import { useAuthorProfile } from '../hooks/useAuthorProfile'
import { useVocabularyStore } from '../store/vocabularyStore'
import { useNarrativeGuidesStore } from '../store/narrativeGuidesStore'
import { useFlagsStore } from '../store/flagsStore'
import { useContextConfigStore } from '../store/contextConfigStore'
import type { ContextSelection, GenerateUnityDialogueRequest } from '../types/api'
import type { LLMModelResponse } from '../types/api'

export interface UseGenerationRequestReturn {
  /** Construit les sélections de contexte à partir des stores */
  buildContextSelections: () => ContextSelection
  /** Construit une requête de génération complète */
  buildGenerationRequest: (params: {
    userInstructions: string
    maxContextTokens: number
    maxCompletionTokens: number | null
    llmModel: string
    reasoningEffort: 'none' | 'low' | 'medium' | 'high' | 'xhigh' | null
    topP: number | null
    maxChoices: number | null
    choicesMode: 'free' | 'capped'
    narrativeTags: string[]
    previousDialoguePreview: string | null
    availableModels: LLMModelResponse[]
  }) => GenerateUnityDialogueRequest
  /** Valide un modèle et retourne le modèle validé ou un fallback */
  validateModel: (
    model: string,
    availableModels: LLMModelResponse[]
  ) => string
}

/**
 * Hook pour construire les requêtes de génération Unity Dialogue.
 * 
 * @returns Fonctions pour construire ContextSelection et GenerateUnityDialogueRequest
 */
export function useGenerationRequest(): UseGenerationRequestReturn {
  const { selections } = useContextStore()
  const { sceneSelection, dialogueStructure, systemPromptOverride } = useGenerationStore()
  const { authorProfile } = useAuthorProfile()
  const { vocabularyConfig } = useVocabularyStore()
  const { includeNarrativeGuides } = useNarrativeGuidesStore()

  const buildContextSelections = useCallback((): ContextSelection => {
    // Créer un nouvel objet sans scene_protagonists et scene_location pour éviter d'envoyer des valeurs vides
    const { scene_protagonists, scene_location, ...baseSelections } = selections
    // Intentionnel: on extrait ces champs uniquement pour les exclure de baseSelections
    void scene_protagonists
    void scene_location
    const contextSelections: ContextSelection = {
      ...baseSelections,
    }

    // Ajouter scene_protagonists seulement s'il y a des valeurs
    const sceneProtagonists: Record<string, string> = {}
    if (sceneSelection.characterA) {
      sceneProtagonists.personnage_a = sceneSelection.characterA
    }
    if (sceneSelection.characterB) {
      sceneProtagonists.personnage_b = sceneSelection.characterB
    }
    if (Object.keys(sceneProtagonists).length > 0) {
      contextSelections.scene_protagonists = sceneProtagonists
    }

    // Ajouter scene_location seulement s'il y a des valeurs
    const sceneLocation: Record<string, string> = {}
    if (sceneSelection.sceneRegion) {
      sceneLocation.lieu = sceneSelection.sceneRegion
    }
    if (sceneSelection.subLocation) {
      sceneLocation.sous_lieu = sceneSelection.subLocation
    }
    if (Object.keys(sceneLocation).length > 0) {
      contextSelections.scene_location = sceneLocation
    }

    // Ajouter generation_settings avec dialogue_structure
    if (dialogueStructure && dialogueStructure.length > 0) {
      contextSelections.generation_settings = {
        dialogue_structure: dialogueStructure,
      }
    }

    return contextSelections
  }, [selections, sceneSelection, dialogueStructure])

  const validateModel = useCallback((
    model: string,
    availableModels: LLMModelResponse[]
  ): string => {
    const validModel = availableModels.find(m => m.model_identifier === model)?.model_identifier
    if (!validModel) {
      // Utiliser le premier modèle disponible comme fallback
      const fallbackModel = availableModels[0]?.model_identifier
      if (fallbackModel) {
        return fallbackModel
      } else {
        throw new Error(`Aucun modèle LLM disponible. Modèle demandé: ${model}`)
      }
    }
    return validModel
  }, [])

  const buildGenerationRequest = useCallback((
    params: {
      userInstructions: string
      maxContextTokens: number
      maxCompletionTokens: number | null
      llmModel: string
      reasoningEffort: 'none' | 'low' | 'medium' | 'high' | 'xhigh' | null
      topP: number | null
      maxChoices: number | null
      choicesMode: 'free' | 'capped'
      narrativeTags: string[]
      previousDialoguePreview: string | null
      availableModels: LLMModelResponse[]
    }
  ): GenerateUnityDialogueRequest => {
    const contextSelections = buildContextSelections()
    
    // Valider le modèle
    const modelToUse = validateModel(params.llmModel, params.availableModels)
    
    // Clamp maxCompletionTokens si nécessaire
    const safeMaxCompletionTokens = params.maxCompletionTokens !== null
      ? Math.min(Math.max(params.maxCompletionTokens, 100), 16000)
      : null

    // Utiliser une valeur par défaut si userInstructions est vide (backend exige min_length=1)
    const userInstructionsValue = params.userInstructions.trim() || ' '

    // Récupérer fieldConfigs avec essentialFields
    const { fieldConfigs: fieldConfigsForRequest, essentialFields, organization } = useContextConfigStore.getState()
    const fieldConfigsWithEssential: Record<string, string[]> = {}
    for (const [elementType, fields] of Object.entries(fieldConfigsForRequest)) {
      const essential = essentialFields[elementType] || []
      fieldConfigsWithEssential[elementType] = [...new Set([...essential, ...fields])]
    }

    // Récupérer les flags
    const { getSelectedFlagsArray } = useFlagsStore.getState()
    const inGameFlags = getSelectedFlagsArray()

    const request: GenerateUnityDialogueRequest = {
      user_instructions: userInstructionsValue,
      context_selections: contextSelections,
      npc_speaker_id: sceneSelection.characterB || undefined,
      max_context_tokens: params.maxContextTokens,
      max_completion_tokens: safeMaxCompletionTokens ?? undefined,
      system_prompt_override: systemPromptOverride || undefined,
      author_profile: authorProfile || undefined,
      llm_model_identifier: modelToUse,
      reasoning_effort: params.reasoningEffort ?? undefined,
      top_p: params.topP ?? undefined,
      max_choices: params.maxChoices ?? undefined,
      choices_mode: params.choicesMode,
      narrative_tags: params.narrativeTags.length > 0 ? params.narrativeTags : undefined,
      vocabulary_config: vocabularyConfig ? (vocabularyConfig as unknown as Record<string, string>) : undefined,
      include_narrative_guides: includeNarrativeGuides,
      previous_dialogue_preview: params.previousDialoguePreview || undefined,
      field_configs: Object.keys(fieldConfigsWithEssential).length > 0 ? fieldConfigsWithEssential : undefined,
      organization_mode: organization,
      in_game_flags: inGameFlags.length > 0 ? inGameFlags : undefined,
    }

    return request
  }, [buildContextSelections, validateModel, sceneSelection, systemPromptOverride, authorProfile, vocabularyConfig, includeNarrativeGuides])

  return {
    buildContextSelections,
    buildGenerationRequest,
    validateModel,
  }
}
