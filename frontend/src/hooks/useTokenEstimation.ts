/**
 * Estimation debouncée des tokens contexte GDD (POST /api/v1/context/estimate-tokens).
 * Source unique pour le compteur UI — ne reconstruit pas le prompt complet.
 */
import { useState, useCallback, useEffect, useRef } from 'react'
import { estimateContextTokens } from '../api/context'
import { useGenerationStore } from '../store/generationStore'
import { useContextStore } from '../store/contextStore'
import { useContextConfigStore } from '../store/contextConfigStore'
import { useVocabularyStore } from '../store/vocabularyStore'
import { useNarrativeGuidesStore } from '../store/narrativeGuidesStore'
import { useAuthorProfile } from '../hooks/useAuthorProfile'
import { useGenerationRequest } from './useGenerationRequest'
import { getErrorMessage } from '../types/errors'
import { computeStateHash } from '../utils/hashUtils'
import { buildPromptStateParams, buildTokenEstimateRequest } from '../utils/buildTokenEstimateRequest'

const DEBOUNCE_MS = 500
const DEBOUNCE_FIRST_MS = 100

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
  /** selection_tokens (contexte GDD) */
  tokenCount: number | null
  /** Erreur d'estimation */
  estimationError: string | null
}

/**
 * Hook pour estimer les tokens de sélection contexte avec debounce automatique.
 */
export function useTokenEstimation(options: UseTokenEstimationOptions): UseTokenEstimationReturn {
  const {
    userInstructions,
    maxContextTokens,
    maxCompletionTokens,
    maxChoices,
    choicesMode,
    narrativeTags,
    previousDialoguePreview,
    toast,
  } = options

  const [estimationError, setEstimationError] = useState<string | null>(null)
  const requestSeqRef = useRef(0)
  const abortRef = useRef<AbortController | null>(null)

  const { selections } = useContextStore()
  const fieldConfigs = useContextConfigStore((s) => s.fieldConfigs)
  const essentialFields = useContextConfigStore((s) => s.essentialFields)
  const organization = useContextConfigStore((s) => s.organization)
  const {
    sceneSelection,
    dialogueStructure,
    systemPromptOverride,
    gameRules,
    tokenCount,
    setContextTokenEstimate,
  } = useGenerationStore()
  const { vocabularyConfig } = useVocabularyStore()
  const { includeNarrativeGuides } = useNarrativeGuidesStore()
  const { authorProfile } = useAuthorProfile()
  const { buildContextSelections } = useGenerationRequest()

  const isEstimating = useGenerationStore((s) => s.isEstimating)

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
      selections.dialogues_examples.length > 0 ||
      selections.narrative_structures.length > 0 ||
      selections.chapters.length > 0 ||
      selections.scenes.length > 0 ||
      Boolean(sceneSelection.characterA || sceneSelection.characterB)
    )
  }, [sceneSelection.characterA, sceneSelection.characterB, selections])

  const estimateTokens = useCallback(async () => {
    const hasSystemPrompt = systemPromptOverride && systemPromptOverride.trim().length > 0
    if (!userInstructions.trim() && !hasSelections() && !hasSystemPrompt) {
      setEstimationError(null)
      setContextTokenEstimate({
        selectionTokens: null,
        isEstimating: false,
        previewInputHash: 'invalidate',
        contextEstimationError: null,
        contextTokenBreakdown: [],
        contextBreakdownNote: '',
      })
      return
    }

    const contextSelections = buildContextSelections()
    const userInstructionsValue = userInstructions.trim() || ' '

    const promptParams = buildPromptStateParams({
      userInstructions: userInstructionsValue,
      contextSelections,
      maxContextTokens,
      maxCompletionTokens,
      maxChoices,
      choicesMode,
      narrativeTags,
      systemPromptOverride,
      gameRules,
      authorProfile,
      vocabularyConfig: vocabularyConfig
        ? (vocabularyConfig as unknown as Record<string, string>)
        : null,
      includeNarrativeGuides,
      previousDialoguePreview,
      npcSpeakerId: sceneSelection.characterB,
    })

    const computedHash = await computeStateHash(promptParams)
    const { previewInputHash, tokenCount: currentTokenCount } = useGenerationStore.getState()

    if (computedHash === previewInputHash && currentTokenCount !== null) {
      return
    }

    abortRef.current?.abort()
    const seq = requestSeqRef.current + 1
    requestSeqRef.current = seq
    const controller = new AbortController()
    abortRef.current = controller

    setEstimationError(null)
    setContextTokenEstimate({
      selectionTokens: currentTokenCount,
      isEstimating: true,
      previewInputHash: 'preserve',
      contextEstimationError: null,
    })

    try {
      const request = buildTokenEstimateRequest({
        userInstructions: userInstructionsValue,
        contextSelections,
        maxContextTokens,
        maxCompletionTokens,
        maxChoices,
        choicesMode,
        narrativeTags,
        systemPromptOverride,
        gameRules,
        authorProfile,
        vocabularyConfig: vocabularyConfig
          ? (vocabularyConfig as unknown as Record<string, string>)
          : null,
        includeNarrativeGuides,
        previousDialoguePreview,
        npcSpeakerId: sceneSelection.characterB,
      })

      const response = await estimateContextTokens(request, controller.signal)
      if (requestSeqRef.current !== seq) return

      setEstimationError(null)
      setContextTokenEstimate({
        selectionTokens: response.selection_tokens,
        isEstimating: false,
        previewInputHash: computedHash,
        contextEstimationError: null,
        contextTokenBreakdown: response.context_token_breakdown,
        contextBreakdownNote: response.context_breakdown_note,
      })
    } catch (err: unknown) {
      if (controller.signal.aborted || requestSeqRef.current !== seq) return
      const e = err as { code?: string; response?: { status?: number } } | null
      if (e?.code !== 'ERR_NETWORK' && e?.code !== 'ECONNREFUSED' && e?.response?.status !== 401) {
        console.error('Erreur lors de l\'estimation contexte:', err)
        const errorMessage = getErrorMessage(err)
        setEstimationError(errorMessage)
        if (toast) {
          toast(errorMessage, 'error', 5000)
        }
      }
      setContextTokenEstimate({
        selectionTokens: useGenerationStore.getState().tokenCount,
        isEstimating: false,
        previewInputHash: 'invalidate',
        contextEstimationError: getErrorMessage(err),
      })
    }
  }, [
    userInstructions,
    authorProfile,
    maxChoices,
    maxCompletionTokens,
    narrativeTags,
    previousDialoguePreview,
    hasSelections,
    maxContextTokens,
    buildContextSelections,
    setContextTokenEstimate,
    systemPromptOverride,
    gameRules,
    vocabularyConfig,
    includeNarrativeGuides,
    sceneSelection.characterB,
    toast,
    choicesMode,
  ])

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
      selections.dialogues_examples.length > 0 ||
      selections.narrative_structures.length > 0 ||
      selections.chapters.length > 0 ||
      selections.scenes.length > 0 ||
      Boolean(sceneSelection.characterA || sceneSelection.characterB)

    const hasSystemPrompt = systemPromptOverride && systemPromptOverride.trim().length > 0
    const hasCriteria = Boolean(userInstructions.trim() || hasAnySelections || hasSystemPrompt)
    const debounceMs =
      hasCriteria && useGenerationStore.getState().tokenCount == null ? DEBOUNCE_FIRST_MS : DEBOUNCE_MS

    const timeoutId = setTimeout(() => {
      if (hasCriteria) {
        void estimateTokens()
      } else {
        setEstimationError(null)
        setContextTokenEstimate({
          selectionTokens: null,
          isEstimating: false,
          previewInputHash: 'invalidate',
          contextEstimationError: null,
          contextTokenBreakdown: [],
          contextBreakdownNote: '',
        })
      }
    }, debounceMs)

    return () => {
      clearTimeout(timeoutId)
      abortRef.current?.abort()
    }
  }, [
    userInstructions,
    selections,
    fieldConfigs,
    essentialFields,
    organization,
    authorProfile,
    maxChoices,
    narrativeTags,
    previousDialoguePreview,
    maxContextTokens,
    estimateTokens,
    sceneSelection,
    dialogueStructure,
    systemPromptOverride,
    gameRules,
    setContextTokenEstimate,
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
