/**
 * Hook pour gérer les handlers de génération et reset.
 * 
 * Extrait la logique de handleGenerate et handlers reset depuis GenerationPanel.
 */
import { useCallback } from 'react'
import { useGenerationStore } from '../store/generationStore'
import { useContextStore } from '../store/contextStore'
import * as dialoguesAPI from '../api/dialogues'
import * as configAPI from '../api/config'
import { getErrorMessage } from '../types/errors'
import { useGenerationRequest } from './useGenerationRequest'
import { useCostGovernance } from './useCostGovernance'
import { CONTEXT_TOKENS_LIMITS } from '../constants'
import type { LLMModelResponse } from '../types/api'

export interface UseGenerationHandlersOptions {
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
  /** Token count estimé */
  tokenCount: number | null
  /** Fonction pour connecter SSE (passée depuis orchestrator pour éviter duplication) */
  connectSSE: (jobId: string) => void
}

export interface UseGenerationHandlersReturn {
  /** Générer un dialogue Unity */
  handleGenerate: () => Promise<void>
  /** Réinitialiser le formulaire */
  handleReset: () => void
  /** Réinitialiser tout */
  handleResetAll: () => void
  /** Réinitialiser les instructions */
  handleResetInstructions: () => void
  /** Réinitialiser les sélections */
  handleResetSelections: () => void
  /** Prévisualiser (TODO) */
  handlePreview: () => void
  /** Exporter Unity (TODO) */
  handleExportUnity: () => void
}

/**
 * Hook pour gérer les handlers de génération et reset.
 * 
 * @param options - Options avec tous les paramètres nécessaires
 * @returns Handlers de génération et reset
 */
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
    setIsLoading,
    setError,
    setAvailableModels,
    setIsDirty,
    setUserInstructions,
    setMaxContextTokens,
    setMaxCompletionTokens,
    setMaxChoices,
    setNarrativeTags,
    toast,
    connectSSE,  // Passé depuis orchestrator pour éviter duplication
  } = options

  const {
    sceneSelection,
    setDialogueStructure,
    setSystemPromptOverride,
    setSceneSelection,
    setUnityDialogueResponse,
    startGeneration,
    resetStreamingState,
    isGenerating,  // Utiliser isGenerating du store au lieu de isLoading
  } = useGenerationStore()

  const { clearSelections } = useContextStore()
  const { checkBudget } = useCostGovernance()
  
  const { buildContextSelections, buildGenerationRequest } = useGenerationRequest()

  const handleGenerate = useCallback(async () => {
    // Protection contre les doubles appels
    if (isGenerating) {
      console.warn('handleGenerate appelé alors qu\'une génération est déjà en cours')
      return
    }

    // Validation minimale
    if (!sceneSelection.characterA && !sceneSelection.characterB && !userInstructions.trim()) {
      toast('Veuillez sélectionner au moins un personnage ou ajouter des instructions', 'error')
      return
    }

    // Vérifier le budget avant génération
    const budgetCheck = await checkBudget()
    if (!budgetCheck.allowed) {
      toast(budgetCheck.message || 'Budget dépassé', 'error')
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      buildContextSelections() // appel pour cohérence; la requête utilise buildGenerationRequest qui lit les stores

      // NOTE: La validation métier (personnages requis, etc.) est maintenant effectuée par le backend
      // via les validators Pydantic. Le backend rejettera avec un message clair si la requête est invalide.
      
      // Valider que le modèle sélectionné existe dans la liste des modèles disponibles
      // Si availableModels est vide, essayer de charger les modèles d'abord
      let modelsToCheck = availableModels
      if (modelsToCheck.length === 0) {
        try {
          const response = await configAPI.listLLMModels()
          setAvailableModels(response.models)
          modelsToCheck = response.models
        } catch (err) {
          console.error('Erreur lors du chargement des modèles:', err)
          throw new Error('Impossible de charger les modèles LLM disponibles')
        }
      }
      
      // Construire la requête avec validation du modèle
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

      // Créer le job de génération avec streaming SSE
      const job = await dialoguesAPI.createGenerationJob(request)
      
      // Démarrer la génération avec le job_id
      startGeneration(job.job_id)
      
      // Connecter le SSE pour recevoir les événements
      connectSSE(job.job_id)
    } catch (err) {
      const errorMsg = getErrorMessage(err)
      const errorDetails = err instanceof Error ? `\n\n${err.message}${err.stack ? `\n\nStack trace:\n${err.stack}` : ''}` : ''
      const fullErrorMessage = `${errorMsg}${errorDetails}`
      setError(fullErrorMessage)
      toast(fullErrorMessage, 'error')
      // Si la création du job échoue, on peut reset le streaming
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
    startGeneration,
    resetStreamingState,
    connectSSE,  // Passé depuis orchestrator
    setIsLoading,
    setError,
    toast,
    checkBudget,
    isGenerating,  // Utiliser isGenerating du store pour la protection
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
    // TODO: Implémenter prévisualisation
    toast('Prévisualisation à implémenter', 'info')
  }, [toast])

  const handleExportUnity = useCallback(() => {
    // TODO: Implémenter export Unity
    toast('Export Unity à implémenter', 'info')
  }, [toast])

  return {
    handleGenerate,
    handleReset,
    handleResetAll,
    handleResetInstructions,
    handleResetSelections,
    handlePreview,
    handleExportUnity,
  }
}
