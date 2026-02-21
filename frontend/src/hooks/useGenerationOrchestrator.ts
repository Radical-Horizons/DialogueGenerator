/**
 * Hook orchestrateur qui compose tous les hooks métier pour simplifier GenerationPanel.
 * 
 * Ce hook centralise la composition des hooks métier et documente les dépendances
 * implicitement en les combinant.
 */
import { useGenerationRequest } from './useGenerationRequest'
import { useTokenEstimation } from './useTokenEstimation'
import { useGenerationValidation } from './useGenerationValidation'
import { useSSEStreaming } from './useSSEStreaming'
import { useGenerationHandlers } from './useGenerationHandlers'
import { useGraphStore } from '../store/graphStore'
import type { LLMModelResponse } from '../types/api'

export interface UseGenerationOrchestratorOptions {
  /** Instructions utilisateur */
  userInstructions: string
  /** Max tokens pour contexte */
  maxContextTokens: number
  /** Max tokens pour completion */
  maxCompletionTokens: number | null
  /** Modèle LLM sélectionné */
  llmModel: string
  /** Reasoning effort */
  reasoningEffort: 'none' | 'low' | 'medium' | 'high' | 'xhigh' | null
  /** Top_p (nucleus sampling) */
  topP: number | null
  /** Nombre max de choix */
  maxChoices: number | null
  /** Mode de choix */
  choicesMode: 'free' | 'capped'
  /** Tags narratifs */
  narrativeTags: string[]
  /** Preview du dialogue précédent */
  previousDialoguePreview: string | null
  /** Modèles disponibles */
  availableModels: LLMModelResponse[]
  /** Setter pour isLoading */
  setIsLoading: (loading: boolean) => void
  /** Setter pour error */
  setError: (error: string | null) => void
  /** Setter pour availableModels */
  setAvailableModels: (models: LLMModelResponse[]) => void
  /** Setter pour isDirty */
  setIsDirty: (dirty: boolean) => void
  /** Setter pour userInstructions */
  setUserInstructions: (instructions: string) => void
  /** Setter pour maxContextTokens */
  setMaxContextTokens: (tokens: number) => void
  /** Setter pour maxCompletionTokens */
  setMaxCompletionTokens: (tokens: number | null) => void
  /** Setter pour maxChoices */
  setMaxChoices: (choices: number | null) => void
  /** Setter pour narrativeTags */
  setNarrativeTags: (tags: string[]) => void
  /** Toast function */
  toast: (message: string, type?: 'success' | 'error' | 'info' | 'warning', duration?: number) => void
}

export interface UseGenerationOrchestratorReturn {
  // Request
  buildContextSelections: () => unknown
  buildGenerationRequest: (params: unknown) => unknown
  validateModel: (model: string, availableModels: LLMModelResponse[]) => string
  
  // Estimation
  estimateTokens: () => Promise<void>
  isEstimating: boolean
  tokenCount: number | null
  estimationError: string | null
  
  // Validation
  validationErrors: Record<string, string>
  validate: () => boolean
  hasErrors: boolean
  validateCharacters: () => boolean
  
  // Handlers
  handleGenerate: () => Promise<void>
  handleReset: () => void
  handleResetAll: () => void
  handleResetInstructions: () => void
  handleResetSelections: () => void
  handlePreview: () => void
  handleExportUnity: () => void
  
  // SSE
  connectSSE: (jobId: string) => void
  disconnectSSE: () => void
  isSSEConnected: boolean
  sseError: string | null
}

/**
 * Hook orchestrateur qui compose tous les hooks métier.
 * 
 * Simplifie l'utilisation dans GenerationPanel en exposant une interface unifiée.
 * 
 * @param options - Options avec tous les paramètres nécessaires
 * @returns Interface unifiée avec toutes les fonctionnalités
 */
export function useGenerationOrchestrator(
  options: UseGenerationOrchestratorOptions
): UseGenerationOrchestratorReturn {
  const { loadDialogue } = useGraphStore()

  // Hooks métier (ordre respecte les dépendances)
  const request = useGenerationRequest()
  const estimation = useTokenEstimation({
    userInstructions: options.userInstructions,
    maxContextTokens: options.maxContextTokens,
    maxCompletionTokens: options.maxCompletionTokens,
    maxChoices: options.maxChoices,
    choicesMode: options.choicesMode,
    narrativeTags: options.narrativeTags,
    previousDialoguePreview: options.previousDialoguePreview,
    toast: options.toast,
  })
  const validation = useGenerationValidation({
    maxContextTokens: options.maxContextTokens,
    maxCompletionTokens: options.maxCompletionTokens,
    tokenCount: estimation.tokenCount,
  })
  const sse = useSSEStreaming({
    onComplete: async (result) => {
      // Charger le graphe généré
      if (result.json_content) {
        try {
          await loadDialogue(result.json_content)
        } catch (graphError) {
          console.warn('Erreur lors du chargement du graphe généré:', graphError)
        }
      }
    },
    setIsLoading: options.setIsLoading,
    toast: options.toast,
  })
  const handlers = useGenerationHandlers({
    userInstructions: options.userInstructions,
    maxContextTokens: options.maxContextTokens,
    maxCompletionTokens: options.maxCompletionTokens,
    llmModel: options.llmModel,
    reasoningEffort: options.reasoningEffort,
    topP: options.topP,
    maxChoices: options.maxChoices,
    choicesMode: options.choicesMode,
    narrativeTags: options.narrativeTags,
    previousDialoguePreview: options.previousDialoguePreview,
    availableModels: options.availableModels,
    setIsLoading: options.setIsLoading,
    setError: options.setError,
    setAvailableModels: options.setAvailableModels,
    setIsDirty: options.setIsDirty,
    setUserInstructions: options.setUserInstructions,
    setMaxContextTokens: options.setMaxContextTokens,
    setMaxCompletionTokens: options.setMaxCompletionTokens,
    setMaxChoices: options.setMaxChoices,
    setNarrativeTags: options.setNarrativeTags,
    toast: options.toast,
    tokenCount: estimation.tokenCount,
    connectSSE: sse.connect,  // Passer la fonction de connexion depuis l'orchestrator
  })

  // Retourner interface unifiée
  return {
    // Request
    buildContextSelections: request.buildContextSelections,
    buildGenerationRequest: request.buildGenerationRequest,
    validateModel: request.validateModel,
    
    // Estimation
    estimateTokens: estimation.estimateTokens,
    isEstimating: estimation.isEstimating,
    tokenCount: estimation.tokenCount,
    estimationError: estimation.estimationError,
    
    // Validation (UX uniquement)
    validationErrors: validation.validationErrors,
    validate: validation.validate,
    hasErrors: validation.hasErrors,
    
    // Handlers
    handleGenerate: handlers.handleGenerate,
    handleReset: handlers.handleReset,
    handleResetAll: handlers.handleResetAll,
    handleResetInstructions: handlers.handleResetInstructions,
    handleResetSelections: handlers.handleResetSelections,
    handlePreview: handlers.handlePreview,
    handleExportUnity: handlers.handleExportUnity,
    
    // SSE
    connectSSE: sse.connect,
    disconnectSSE: sse.disconnect,
    isSSEConnected: sse.isConnected,
    sseError: sse.connectionError,
  }
}
