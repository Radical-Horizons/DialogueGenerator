/**
 * Hook pour estimer les tokens du prompt avec debounce.
 * 
 * Extrait la logique d'estimation de tokens depuis GenerationPanel.
 */
import { useState, useCallback, useEffect } from 'react'
import { useGenerationStore } from '../store/generationStore'
import { useContextStore } from '../store/contextStore'
import { useContextConfigStore } from '../store/contextConfigStore'
import { useVocabularyStore } from '../store/vocabularyStore'
import { useNarrativeGuidesStore } from '../store/narrativeGuidesStore'
import { useAuthorProfile } from '../hooks/useAuthorProfile'
import { useFlagsStore } from '../store/flagsStore'
import * as dialoguesAPI from '../api/dialogues'
// NOTE: estimateTokensUtil supprimé - utiliser uniquement token_count du backend
import { getErrorMessage } from '../types/errors'
import { useGenerationRequest } from './useGenerationRequest'
import { computeStateHash, type PromptStateParams } from '../utils/hashUtils'
export interface UseTokenEstimationOptions {
  /** Instructions utilisateur */
  userInstructions: string
  /** Max tokens pour contexte */
  maxContextTokens: number
  /** Max tokens pour completion (null = valeur par défaut) */
  maxCompletionTokens: number | null
  /** Nombre max de choix */
  maxChoices: number | null
  /** Mode de choix */
  choicesMode: 'free' | 'capped'
  /** Tags narratifs */
  narrativeTags: string[]
  /** Preview du dialogue précédent */
  previousDialoguePreview: string | null
  /** Toast function */
  toast?: (message: string, type?: 'success' | 'error' | 'info' | 'warning', duration?: number) => void
}

export interface UseTokenEstimationReturn {
  /** Estimer les tokens manuellement */
  estimateTokens: () => Promise<void>
  /** Indique si l'estimation est en cours */
  isEstimating: boolean
  /** Nombre de tokens estimé */
  tokenCount: number | null
  /** Erreur d'estimation */
  estimationError: string | null
}

/**
 * Hook pour estimer les tokens du prompt avec debounce automatique.
 * 
 * L'estimation se déclenche automatiquement avec un debounce de 500ms
 * quand les paramètres changent.
 * 
 * @param options - Options d'estimation
 * @returns Fonction d'estimation manuelle et état
 */
export function useTokenEstimation(options: UseTokenEstimationOptions): UseTokenEstimationReturn {
  const {
    userInstructions,
    maxContextTokens,
    maxChoices,
    choicesMode,
    narrativeTags,
    previousDialoguePreview,
    toast,
  } = options

  const [isEstimating, setIsEstimating] = useState(false)
  const [estimationError, setEstimationError] = useState<string | null>(null)

  const { selections } = useContextStore()
  const { sceneSelection, dialogueStructure, systemPromptOverride, tokenCount, setRawPrompt } = useGenerationStore()
  const { vocabularyConfig } = useVocabularyStore()
  const { includeNarrativeGuides } = useNarrativeGuidesStore()
  const { authorProfile } = useAuthorProfile()
  const { buildContextSelections } = useGenerationRequest()

  const hasSelections = useCallback(() => {
    return (
      selections.characters_full.length > 0 ||
      selections.characters_excerpt.length > 0 ||
      selections.locations_full.length > 0 ||
      selections.locations_excerpt.length > 0 ||
      selections.items_full.length > 0 ||
      selections.items_excerpt.length > 0 ||
      selections.species_full.length > 0 ||
      selections.species_excerpt.length > 0 ||
      selections.communities_full.length > 0 ||
      selections.communities_excerpt.length > 0 ||
      selections.dialogues_examples.length > 0
    )
  }, [selections])

  const estimateTokens = useCallback(async () => {
    // Permettre l'estimation si on a au moins : instructions, sélections, ou un system prompt
    const hasSystemPrompt = systemPromptOverride && systemPromptOverride.trim().length > 0
    if (!userInstructions.trim() && !hasSelections() && !hasSystemPrompt) {
      setRawPrompt(null, null, null, false, null)
      return
    }

    // Construire les paramètres pour le calcul du hash
    const contextSelections = buildContextSelections()
    
    // Récupérer les fieldConfigs et organization depuis le store
    const { fieldConfigs, essentialFields, organization } = useContextConfigStore.getState()
    
    // Inclure les champs essentiels dans la config
    const fieldConfigsWithEssential: Record<string, string[]> = {}
    for (const [elementType, fields] of Object.entries(fieldConfigs)) {
      const essential = essentialFields[elementType] || []
      fieldConfigsWithEssential[elementType] = [...new Set([...essential, ...fields])]
    }
    
    // Récupérer les flags sélectionnés
    const { getSelectedFlagsArray } = useFlagsStore.getState()
    const inGameFlags = getSelectedFlagsArray()
    
    // Utiliser une valeur par défaut si userInstructions est vide (backend exige min_length=1)
    const userInstructionsValue = userInstructions.trim() || ' '
    
    // Construire les paramètres pour le hash
    const promptParams: PromptStateParams = {
      user_instructions: userInstructionsValue,
      context_selections: contextSelections,
      npc_speaker_id: sceneSelection.characterB || undefined,
      max_context_tokens: maxContextTokens,
      system_prompt_override: systemPromptOverride || undefined,
      author_profile: authorProfile || undefined,
      max_choices: maxChoices ?? undefined,
      choices_mode: choicesMode,
      narrative_tags: narrativeTags.length > 0 ? narrativeTags : undefined,
      vocabulary_config: vocabularyConfig ? (vocabularyConfig as unknown as Record<string, string>) : undefined,
      include_narrative_guides: includeNarrativeGuides,
      previous_dialogue_preview: previousDialoguePreview || undefined,
      field_configs: Object.keys(fieldConfigsWithEssential).length > 0 ? fieldConfigsWithEssential : undefined,
      organization_mode: organization,
      in_game_flags: inGameFlags.length > 0 ? inGameFlags : undefined,
    }
    
    // Calculer le hash AVANT l'appel API pour vérifier le cache
    const computedHash = await computeStateHash(promptParams)
    const { promptHash: currentHash, tokenCount: currentTokenCount } = useGenerationStore.getState()

    // Si le hash est identique et qu'on a déjà un tokenCount, skip l'appel API
    if (computedHash === currentHash && currentTokenCount !== null) {
      // Cache hit: pas besoin d'appeler l'API
      return
    }
    
    // Ne pas effacer le prompt existant pendant l'estimation
    setIsEstimating(true)
    setEstimationError(null)
    // Mettre à jour le store pour afficher "Construction du prompt..." dans le panneau Détails
    const stateBeforeCall = useGenerationStore.getState()
    setRawPrompt(
      stateBeforeCall.rawPrompt,
      stateBeforeCall.tokenCount,
      stateBeforeCall.promptHash,
      true,
      stateBeforeCall.structuredPrompt
    )

    try {
      // Appel API seulement si le hash a changé
      const response = await dialoguesAPI.previewPrompt(promptParams)
      
      // Utiliser token_count du backend (source de vérité, utilise le vrai PromptEngine)
      // Note: previewPrompt ne retourne pas token_count dans PreviewPromptResponse
      // Pour avoir le vrai token_count, utiliser estimate-tokens à la place
      // Estimation approximative basée sur la longueur pour l'affichage (le backend sera la source de vérité lors de la génération)
      const estimatedTokenCount = Math.ceil(response.raw_prompt.length / 4)
      
      // Mettre à jour le prompt seulement si le hash a changé ou si on n'avait pas de prompt
      // Cela évite de reconstruire l'affichage si le prompt est identique
      // Note: response.prompt_hash devrait correspondre à computedHash, mais on utilise celui du backend comme source de vérité
      if (computedHash !== response.prompt_hash) {
        // Log warning si les hashs ne correspondent pas (devrait être rare)
        console.warn('Hash mismatch: computed', computedHash, 'vs backend', response.prompt_hash)
      }
      
      if (currentHash !== response.prompt_hash || currentHash === null) {
        setRawPrompt(response.raw_prompt, estimatedTokenCount, response.prompt_hash, false, response.structured_prompt || null)
      } else {
        // Même hash : ne pas remplacer le contenu mais remettre isEstimating à false dans le store
        const stateAfter = useGenerationStore.getState()
        setRawPrompt(stateAfter.rawPrompt, stateAfter.tokenCount, stateAfter.promptHash, false, stateAfter.structuredPrompt)
      }
    } catch (err: unknown) {
      // Ne logger que les erreurs non liées à la connexion (backend non accessible)
      const e = err as { code?: string; response?: { status?: number } } | null
      if (e?.code !== 'ERR_NETWORK' && e?.code !== 'ECONNREFUSED' && e?.response?.status !== 401) {
        console.error('Erreur lors de l\'estimation:', err)
        const errorMessage = getErrorMessage(err)
        setEstimationError(errorMessage)
        // Afficher un toast pour informer l'utilisateur de l'erreur
        if (toast) {
          toast(errorMessage, 'error', 5000)
        }
      }
      // Ne pas effacer le prompt existant si l'estimation échoue
      // Le prompt précédent reste visible pour l'utilisateur
      const currentState = useGenerationStore.getState()
      setRawPrompt(currentState.rawPrompt, currentState.tokenCount, currentState.promptHash, false, null)
    } finally {
      setIsEstimating(false)
    }
  }, [
    userInstructions,
    authorProfile,
    maxChoices,
    narrativeTags,
    previousDialoguePreview,
    hasSelections,
    maxContextTokens,
    buildContextSelections,
    setRawPrompt,
    systemPromptOverride,
    vocabularyConfig,
    includeNarrativeGuides,
    sceneSelection.characterB,
    toast,
    choicesMode,
  ])

  // Debounce automatique de l'estimation (500ms, ou 100ms si on a des critères mais pas encore de prompt)
  useEffect(() => {
    const hasAnySelections =
      selections.characters_full.length > 0 ||
      selections.characters_excerpt.length > 0 ||
      selections.locations_full.length > 0 ||
      selections.locations_excerpt.length > 0 ||
      selections.items_full.length > 0 ||
      selections.items_excerpt.length > 0 ||
      selections.species_full.length > 0 ||
      selections.species_excerpt.length > 0 ||
      selections.communities_full.length > 0 ||
      selections.communities_excerpt.length > 0 ||
      selections.dialogues_examples.length > 0

    const hasSystemPrompt = systemPromptOverride && systemPromptOverride.trim().length > 0
    const hasCriteria = Boolean(userInstructions.trim() || hasAnySelections || hasSystemPrompt)
    const hasNoPromptYet = useGenerationStore.getState().rawPrompt == null
    const debounceMs = hasCriteria && hasNoPromptYet ? 100 : 500

    const timeoutId = setTimeout(() => {
      if (hasCriteria) {
        void estimateTokens()
      } else {
        setRawPrompt(null, null, null, false, null)
      }
    }, debounceMs)

    return () => clearTimeout(timeoutId)
  }, [
    userInstructions,
    selections,
    authorProfile,
    maxChoices,
    narrativeTags,
    previousDialoguePreview,
    maxContextTokens,
    estimateTokens,
    sceneSelection,
    dialogueStructure,
    systemPromptOverride,
    setRawPrompt,
    vocabularyConfig,
    includeNarrativeGuides,
  ])

  return {
    estimateTokens,
    isEstimating,
    tokenCount,
    estimationError,
  }
}
