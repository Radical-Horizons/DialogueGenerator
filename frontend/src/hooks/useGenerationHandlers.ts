/**
 * Hook pour gérer les handlers de génération et reset.
 */
import { useCallback } from 'react'
import { useGenerationStore } from '../store/generationStore'
import { useContextStore } from '../store/contextStore'
import * as dialoguesAPI from '../api/dialogues'
import * as configAPI from '../api/config'
import { getErrorMessage } from '../types/errors'
import type { APIError } from '../types/errors'
import type { ToastAction } from '../components/shared/Toast'
import { useGenerationRequest } from './useGenerationRequest'
import { useCostGovernance } from './useCostGovernance'
import {
  launchBackgroundOption,
  useGenerationOptionsStore,
} from '../store/generationOptionsStore'
import { CONTEXT_TOKENS_LIMITS } from '../constants'
import {
  applyGenerationConfigFixes,
  fixesFromApiValidationDetails,
  type GenerationConfigFix,
} from '../utils/generationConfigNormalization'
import type { LLMModelResponse, ReasoningEffort } from '../types/api'

export interface UseGenerationHandlersOptions {
  userInstructions: string
  maxContextTokens: number
  maxCompletionTokens: number | null
  llmModel: string
  reasoningEffort: ReasoningEffort | null
  topP: number | null
  maxChoices: number | null
  choicesMode: 'free' | 'capped'
  narrativeTags: string[]
  previousDialoguePreview: string | null
  availableModels: LLMModelResponse[]
  configFixes: GenerationConfigFix[]
  setIsLoading: (loading: boolean) => void
  setError: (error: string | null) => void
  setAvailableModels: (models: LLMModelResponse[]) => void
  setIsDirty: (dirty: boolean) => void
  setUserInstructions: (instructions: string) => void
  setMaxContextTokens: (tokens: number) => void
  setMaxCompletionTokens: (tokens: number | null) => void
  setMaxChoices: (choices: number | null) => void
  setNarrativeTags: (tags: string[]) => void
  setLlmModel: (model: string) => void
  toast: (
    message: string,
    type?: 'success' | 'error' | 'info' | 'warning',
    duration?: number,
    actions?: ToastAction[],
  ) => string
  tokenCount: number | null
  connectSSE: (streamUrl: string) => void
  disconnectSSE: () => void
}

export interface UseGenerationHandlersReturn {
  handleGenerate: () => Promise<void>
  handleReset: () => void
  handleResetAll: () => void
  handleResetInstructions: () => void
  handleResetSelections: () => void
  handlePreview: () => void
  handleExportUnity: () => void
  applyConfigFixesToState: () => void
}

function applyPatchToState(
  patch: ReturnType<typeof applyGenerationConfigFixes>,
  setters: {
    setMaxContextTokens: (v: number) => void
    setMaxCompletionTokens: (v: number | null) => void
    setLlmModel: (v: string) => void
  },
): void {
  if (patch.maxContextTokens !== undefined) {
    setters.setMaxContextTokens(patch.maxContextTokens)
  }
  if (patch.maxCompletionTokens !== undefined) {
    setters.setMaxCompletionTokens(patch.maxCompletionTokens)
  }
  if (patch.llmModel !== undefined) {
    setters.setLlmModel(patch.llmModel)
  }
}

export function useGenerationHandlers(
  options: UseGenerationHandlersOptions
): UseGenerationHandlersReturn {
  const {
    userInstructions,
    maxContextTokens,
    maxCompletionTokens,
    llmModel,
    reasoningEffort,
    topP,
    maxChoices,
    choicesMode,
    narrativeTags,
    previousDialoguePreview,
    availableModels,
    configFixes,
    setIsLoading,
    setError,
    setAvailableModels,
    setIsDirty,
    setUserInstructions,
    setMaxContextTokens,
    setMaxCompletionTokens,
    setMaxChoices,
    setNarrativeTags,
    setLlmModel,
    toast,
    tokenCount,
    connectSSE,
    disconnectSSE,
  } = options

  const {
    sceneSelection,
    setDialogueStructure,
    setSystemPromptOverride,
    setSceneSelection,
    setUnityDialogueResponse,
    startGeneration,
    resetStreamingState,
    isGenerating,
  } = useGenerationStore()

  const { clearSelections } = useContextStore()
  const { checkBudget } = useCostGovernance()
  const { buildContextSelections, buildGenerationRequest } = useGenerationRequest()

  const applyConfigFixesToState = useCallback(() => {
    const patch = applyGenerationConfigFixes(configFixes)
    applyPatchToState(patch, { setMaxContextTokens, setMaxCompletionTokens, setLlmModel })
    if (configFixes.length > 0) {
      toast('Paramètres de génération corrigés.', 'info')
    }
  }, [configFixes, setMaxContextTokens, setMaxCompletionTokens, setLlmModel, toast])

  const handleGenerate = useCallback(async () => {
    if (isGenerating) {
      console.warn('handleGenerate appelé alors qu\'une génération est déjà en cours')
      return
    }

    if (!sceneSelection.characterA && !sceneSelection.characterB && !userInstructions.trim()) {
      toast('Veuillez sélectionner au moins un personnage ou ajouter des instructions', 'error')
      return
    }

    const budgetCheck = await checkBudget()
    if (!budgetCheck.allowed) {
      toast(budgetCheck.message || 'Budget dépassé', 'error')
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      buildContextSelections()

      let modelsToCheck = availableModels
      if (modelsToCheck.length === 0) {
        const response = await configAPI.listLLMModels()
        setAvailableModels(response.models)
        modelsToCheck = response.models
      }

      const request = buildGenerationRequest({
        userInstructions,
        maxContextTokens,
        maxCompletionTokens,
        llmModel,
        reasoningEffort,
        topP,
        maxChoices,
        choicesMode,
        narrativeTags,
        previousDialoguePreview,
        availableModels: modelsToCheck,
      })

      const costEstimate = {
        promptTokens: tokenCount ?? undefined,
        completionTokens: request.max_completion_tokens ?? undefined,
        llmModelIdentifier: request.llm_model_identifier ?? undefined,
      }
      const job = await dialoguesAPI.createGenerationJob(request, costEstimate)

      disconnectSSE()
      startGeneration(job.job_id)
      connectSSE(job.stream_url)

      // Multi-options (écran 2b) : N-1 jobs parallèles supplémentaires, plafonnés.
      // L'option 1 reste le stream principal ; les autres se résolvent en arrière-plan.
      const { optionCount, startRun, updateSlot, clearRun } =
        useGenerationOptionsStore.getState()
      if (optionCount > 1) {
        startRun(optionCount, request)
        updateSlot(0, { jobId: job.job_id, status: 'running' })
        for (let i = 1; i < optionCount; i++) {
          void launchBackgroundOption(i, request, costEstimate)
        }
      } else {
        clearRun()
      }
    } catch (err) {
      const axiosErr = err as APIError
      const errorMsg = getErrorMessage(err)
      setError(errorMsg)

      const validationDetails = axiosErr.response?.data?.error?.details as
        | Record<string, unknown>
        | undefined
      const apiFixes = fixesFromApiValidationDetails(
        validationDetails,
        { maxContextTokens, maxCompletionTokens, llmModel },
        availableModels,
      )
      const fixes = apiFixes.length > 0 ? apiFixes : configFixes

      if (fixes.length > 0) {
        const patch = applyGenerationConfigFixes(fixes)
        toast(errorMsg, 'error', 12_000, [
          {
            label: 'Corriger les paramètres',
            action: () => {
              applyPatchToState(patch, {
                setMaxContextTokens,
                setMaxCompletionTokens,
                setLlmModel,
              })
            },
          },
        ])
      } else {
        toast(errorMsg, 'error')
      }

      resetStreamingState()
    } finally {
      setIsLoading(false)
    }
  }, [
    sceneSelection,
    userInstructions,
    buildContextSelections,
    buildGenerationRequest,
    availableModels,
    setAvailableModels,
    maxContextTokens,
    maxCompletionTokens,
    llmModel,
    reasoningEffort,
    topP,
    maxChoices,
    choicesMode,
    narrativeTags,
    previousDialoguePreview,
    tokenCount,
    configFixes,
    startGeneration,
    resetStreamingState,
    connectSSE,
    disconnectSSE,
    setIsLoading,
    setError,
    setMaxContextTokens,
    setMaxCompletionTokens,
    setLlmModel,
    toast,
    checkBudget,
    isGenerating,
  ])

  const handleReset = useCallback(() => {
    setUserInstructions('')
    setError(null)
    setIsDirty(false)
    setUnityDialogueResponse(null)
    toast('Formulaire réinitialisé', 'info')
  }, [setUserInstructions, setError, setIsDirty, setUnityDialogueResponse, toast])

  const handleResetAll = useCallback(() => {
    setUserInstructions('')
    setError(null)
    setIsDirty(false)
    setSystemPromptOverride(null)
    setDialogueStructure(['PNJ', 'PJ', 'Stop', '', '', ''])
    setSceneSelection({ characterA: null, characterB: null, sceneRegion: null, subLocation: null })
    setMaxContextTokens(CONTEXT_TOKENS_LIMITS.DEFAULT)
    setMaxCompletionTokens(null)
    setMaxChoices(null)
    setNarrativeTags([])
    setUnityDialogueResponse(null)
    clearSelections()
    toast('Tout a été réinitialisé', 'info')
  }, [
    setUserInstructions,
    setError,
    setIsDirty,
    setSystemPromptOverride,
    setDialogueStructure,
    setSceneSelection,
    setMaxContextTokens,
    setMaxCompletionTokens,
    setMaxChoices,
    setNarrativeTags,
    setUnityDialogueResponse,
    clearSelections,
    toast,
  ])

  const handleResetInstructions = useCallback(() => {
    setUserInstructions('')
    setIsDirty(true)
    toast('Instructions réinitialisées', 'info')
  }, [setUserInstructions, setIsDirty, toast])

  const handleResetSelections = useCallback(() => {
    clearSelections()
    toast('Sélections réinitialisées', 'info')
  }, [clearSelections, toast])

  const handlePreview = useCallback(() => {
    toast('Utilisez l’aperçu prompt ou l’éditeur de graphe pour prévisualiser le dialogue.', 'info')
  }, [toast])

  const handleExportUnity = useCallback(() => {
    toast('Exportez depuis l’éditeur de graphe (Unity JSON) ou la liste des dialogues.', 'info')
  }, [toast])

  return {
    handleGenerate,
    handleReset,
    handleResetAll,
    handleResetInstructions,
    handleResetSelections,
    handlePreview,
    handleExportUnity,
    applyConfigFixesToState,
  }
}
