/**
 * Panneau de génération de dialogues.
 * 
 * Composant refactorisé utilisant des hooks métier et composants UI extraits.
 */
import { useState, useEffect, useCallback, useRef } from 'react'
import * as configAPI from '../../api/config'
import * as dialoguesAPI from '../../api/dialogues'
import { useGenerationStore } from '../../store/generationStore'
import { useGenerationActionsStore } from '../../store/generationActionsStore'
import { useLLMStore } from '../../store/llmStore'
import { useAuthorProfile } from '../../hooks/useAuthorProfile'
import { theme } from '../../theme'
import type { LLMModelResponse } from '../../types/api'
import { DialogueStructureWidget } from './DialogueStructureWidget'
import { SystemPromptEditor } from './SystemPromptEditor'
import { SceneSelectionWidget } from './SceneSelectionWidget'
import { InGameFlagsSummary } from './InGameFlagsSummary'
import { GenerationProgressModal } from './GenerationProgressModal'
import { ModelSelector } from './ModelSelector'
import { PresetSelector } from './PresetSelector'
import { useToast } from '../shared'
import { CONTEXT_TOKENS_LIMITS, COMPLETION_TOKENS_LIMITS, DEFAULT_MODEL, API_TIMEOUTS } from '../../constants'
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts'
import type { DialogueStructure } from '../../types/generation'
// Hooks métier extraits
import { useGenerationOrchestrator } from '../../hooks/useGenerationOrchestrator'
import { useGenerationDraft } from '../../hooks/useGenerationDraft'
import { usePresetManagement } from '../../hooks/usePresetManagement'
// Composants UI extraits
import { GenerationPanelControls } from './GenerationPanelControls'
import { GenerationPanelModals } from './GenerationPanelModals'


export function GenerationPanel() {
  // Stores
  const {
    dialogueStructure,
    systemPromptOverride,
    setDialogueStructure,
    setSystemPromptOverride,
    // État streaming (Story 0.2)
    isGenerating,
    streamingContent,
    currentStep,
    isMinimized,
    error: streamingError,
    currentJobId,
    isInterrupting,
    interrupt,
    minimize,
    resetStreamingState,
    setInterrupting,
    setError: setStreamingError,
  } = useGenerationStore()
  
  const { authorProfile, updateProfile: updateAuthorProfile } = useAuthorProfile()
  const { model: selectedLLMModel, provider: currentProvider } = useLLMStore()
  
  // État local UI
  const [showBudgetBlockModal, setShowBudgetBlockModal] = useState(false)
  const [budgetBlockMessage] = useState<string>('')
  
  // État local UI
  const [userInstructions, setUserInstructions] = useState('')
  const [maxContextTokens, setMaxContextTokens] = useState<number>(CONTEXT_TOKENS_LIMITS.DEFAULT)
  const [maxCompletionTokens, setMaxCompletionTokens] = useState<number | null>(null)
  const [llmModel, setLlmModel] = useState<string>(DEFAULT_MODEL)
  const [reasoningEffort, setReasoningEffort] = useState<'none' | 'low' | 'medium' | 'high' | 'xhigh' | null>(null)
  const [topP, setTopP] = useState<number | null>(null)
  const [maxChoices, setMaxChoices] = useState<number | null>(null)
  const choicesMode: 'free' | 'capped' = maxChoices !== null ? 'capped' : 'free'
  const [availableModels, setAvailableModels] = useState<LLMModelResponse[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [narrativeTags, setNarrativeTags] = useState<string[]>([])
  const [previousDialoguePreview] = useState<string | null>(null)
  const [showResetConfirm, setShowResetConfirm] = useState(false)
  const toast = useToast()
  
  const availableNarrativeTags = ['tension', 'humour', 'dramatique', 'intime', 'révélation']
  const maxContextSliderRef = useRef<HTMLInputElement>(null)
  const maxCompletionSliderRef = useRef<HTMLInputElement>(null)
  
  // Hooks métier extraits
  const draft = useGenerationDraft({
    userInstructions,
    maxContextTokens,
    maxCompletionTokens,
    llmModel,
    reasoningEffort,
    topP,
    maxChoices,
    choicesMode,
    narrativeTags,
    setUserInstructions,
    setMaxContextTokens,
    setMaxCompletionTokens,
    setLlmModel,
    setReasoningEffort,
    setTopP,
    setMaxChoices,
    setNarrativeTags,
    updateAuthorProfile,
  })
  
  const presets = usePresetManagement({
    userInstructions,
    setUserInstructions,
    setIsDirty: draft.markDirty,
    setSaveStatus: () => {
      // Draft hook gère saveStatus en interne - on peut appeler markDirty qui met à jour saveStatus
    },
    toast,
    topP,
    setTopP,
    reasoningEffort,
    setReasoningEffort,
    maxCompletionTokens,
    setMaxCompletionTokens,
    maxChoices,
    setMaxChoices,
    llmModel,
    setLlmModel,
  })
  
  // Synchroniser l'état local llmModel avec useLLMStore (Story 0.3)
  useEffect(() => {
    if (selectedLLMModel && selectedLLMModel !== llmModel) {
      setLlmModel(selectedLLMModel)
      draft.markDirty()
    }
  }, [selectedLLMModel, llmModel, draft])

  const orchestrator = useGenerationOrchestrator({
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
    setIsDirty: draft.markDirty,
    setUserInstructions,
    setMaxContextTokens,
    setMaxCompletionTokens,
    setMaxChoices,
    setNarrativeTags,
    toast,
  })

  /**
   * Ferme l'EventSource proprement (utilisé pour l'interruption).
   * Utilise la connexion SSE de l'orchestrator (source de vérité unique).
   * 
   * NOTE: La connexion SSE est gérée par handleGenerate dans useGenerationHandlers,
   * qui appelle connectSSE(job.job_id) après la création du job.
   * Pas besoin de useEffect pour se connecter automatiquement ici.
   */
  const closeEventSource = useCallback(() => {
    orchestrator.disconnectSSE()
  }, [orchestrator])

  // Draft hook gère la sauvegarde automatique et le chargement
  // (logique extraite dans useGenerationDraft)

  // Cache pour les modèles LLM (TTL: 5 minutes)
  const modelsCacheRef = useRef<{ models: LLMModelResponse[], timestamp: number } | null>(null)
  const MODELS_CACHE_TTL = 5 * 60 * 1000 // 5 minutes

  // Chargement des modèles LLM disponibles
  const loadModels = useCallback(async () => {
    // Vérifier le cache avant l'appel API
    if (modelsCacheRef.current && Date.now() - modelsCacheRef.current.timestamp < MODELS_CACHE_TTL) {
      setAvailableModels(modelsCacheRef.current.models)
      // Valider que le modèle actuel existe dans la liste
      if (modelsCacheRef.current.models.length > 0) {
        const currentModelExists = llmModel && modelsCacheRef.current.models.some(m => m.model_identifier === llmModel && m.model_identifier !== "unknown")
        if (!currentModelExists) {
          const firstModel = modelsCacheRef.current.models.find(m => m.model_identifier && m.model_identifier !== "unknown") || modelsCacheRef.current.models[0]
          if (firstModel && firstModel.model_identifier && firstModel.model_identifier !== "unknown") {
            setLlmModel(firstModel.model_identifier)
          }
        }
      }
      return
    }

    try {
      const response = await configAPI.listLLMModels()
      
      // Mettre à jour le cache
      modelsCacheRef.current = {
        models: response.models,
        timestamp: Date.now(),
      }
      
      setAvailableModels(response.models)
      // Valider que le modèle actuel existe dans la liste
      if (response.models.length > 0) {
        const currentModelExists = llmModel && response.models.some(m => m.model_identifier === llmModel && m.model_identifier !== "unknown")
        if (!currentModelExists) {
          const firstModel = response.models.find(m => m.model_identifier && m.model_identifier !== "unknown") || response.models[0]
          if (firstModel && firstModel.model_identifier && firstModel.model_identifier !== "unknown") {
            setLlmModel(firstModel.model_identifier)
          }
        }
      }
    } catch (err) {
      console.error('Erreur lors du chargement des modèles:', err)
      // En cas d'erreur, utiliser le cache même s'il est expiré si disponible
      if (modelsCacheRef.current) {
        setAvailableModels(modelsCacheRef.current.models)
      }
    }
  }, [llmModel, MODELS_CACHE_TTL])

  useEffect(() => {
    loadModels()
  }, [loadModels])

  // Raccourcis clavier
  useKeyboardShortcuts(
    [
      {
        key: 'ctrl+enter',
        handler: () => {
          if (!isLoading) {
            orchestrator.handleGenerate()
          }
        },
        description: 'Générer un dialogue',
        enabled: !isLoading,
      },
      {
        key: 'ctrl+n',
        handler: () => {
          orchestrator.handleReset()
        },
        description: 'Nouveau dialogue (réinitialiser)',
      },
    ],
    [isLoading, orchestrator.handleGenerate, orchestrator.handleReset]
  )

  const { setActions } = useGenerationActionsStore()

  // Utiliser useRef pour stocker les handlers et éviter les boucles infinies
  const handlersRef = useRef({
    handleGenerate: orchestrator.handleGenerate,
    handlePreview: orchestrator.handlePreview,
    handleExportUnity: orchestrator.handleExportUnity,
    handleReset: orchestrator.handleReset,
    handleResetAll: orchestrator.handleResetAll,
    handleResetInstructions: orchestrator.handleResetInstructions,
    handleResetSelections: orchestrator.handleResetSelections,
  })
  
  // Mettre à jour la ref quand les handlers changent
  useEffect(() => {
    handlersRef.current = {
      handleGenerate: orchestrator.handleGenerate,
      handlePreview: orchestrator.handlePreview,
      handleExportUnity: orchestrator.handleExportUnity,
      handleReset: orchestrator.handleReset,
      handleResetAll: orchestrator.handleResetAll,
      handleResetInstructions: orchestrator.handleResetInstructions,
      handleResetSelections: orchestrator.handleResetSelections,
    }
  }, [
    orchestrator.handleGenerate,
    orchestrator.handlePreview,
    orchestrator.handleExportUnity,
    orchestrator.handleReset,
    orchestrator.handleResetAll,
    orchestrator.handleResetInstructions,
    orchestrator.handleResetSelections,
  ])

  // Exposer les handlers via le store pour Dashboard
  useEffect(() => {
    setActions({
      handleGenerate: handlersRef.current.handleGenerate,
      handlePreview: handlersRef.current.handlePreview,
      handleExportUnity: handlersRef.current.handleExportUnity,
      handleReset: handlersRef.current.handleReset,
      isLoading,
      isDirty: draft.isDirty,
    })
  }, [isLoading, draft.isDirty, setActions])
  
  // Initialiser le store au montage
  useEffect(() => {
    setActions({
      handleGenerate: handlersRef.current.handleGenerate,
      handlePreview: handlersRef.current.handlePreview,
      handleExportUnity: handlersRef.current.handleExportUnity,
      handleReset: handlersRef.current.handleReset,
      isLoading,
      isDirty: draft.isDirty,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // Exécuter une seule fois au montage

  // Mettre à jour le style du slider en fonction de la valeur
  const applyRangeGradient = useCallback(
    (el: HTMLInputElement | null, value: number, min: number, max: number) => {
      if (!el) return
      const safeMax = Math.max(min + 1, max)
      const percentage = ((value - min) / (safeMax - min)) * 100
      const gradient = `linear-gradient(to right, ${theme.border.focus} 0%, ${theme.border.focus} ${percentage}%, ${theme.input.background} ${percentage}%, ${theme.input.background} 100%)`
      // Certains navigateurs dessinent la piste via les pseudo-éléments (track).
      // On expose donc le gradient en variable CSS pour l'utiliser sur la track.
      el.style.setProperty('--range-track-bg', gradient)
      // Et on le met aussi sur l'input pour les implémentations qui lisent le background directement.
      el.style.background = gradient
    },
    []
  )

  useEffect(() => {
    applyRangeGradient(
      maxContextSliderRef.current,
      maxContextTokens,
      CONTEXT_TOKENS_LIMITS.MIN,
      CONTEXT_TOKENS_LIMITS.MAX
    )
  }, [applyRangeGradient, maxContextTokens])

  useEffect(() => {
    const value = maxCompletionTokens ?? COMPLETION_TOKENS_LIMITS.DEFAULT
    applyRangeGradient(maxCompletionSliderRef.current, value, COMPLETION_TOKENS_LIMITS.MIN, COMPLETION_TOKENS_LIMITS.MAX)
  }, [applyRangeGradient, maxCompletionTokens])

  const normalizedDialogueStructure = ((): DialogueStructure => {
    const arr = Array.isArray(dialogueStructure) ? dialogueStructure : []
    // Le store peut exposer un string[]; le widget attend une structure de longueur 6.
    return [...arr, '', '', '', '', '', ''].slice(0, 6) as DialogueStructure
  })()

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', backgroundColor: theme.background.panel }}>
      <div style={{ padding: '1.5rem', flex: 1, overflowY: 'auto' }}>
        {/* PresetSelector (Task 6) */}
        <PresetSelector
          onPresetLoaded={presets.handlePresetLoaded}
          getCurrentConfiguration={presets.getCurrentConfiguration}
          saveStatus={draft.saveStatus}
        />

            <SceneSelectionWidget />

      <SystemPromptEditor
        userInstructions={userInstructions}
        authorProfile={authorProfile}
        systemPromptOverride={systemPromptOverride}
        onUserInstructionsChange={(value) => {
          setUserInstructions(value)
          draft.markDirty()
        }}
        onAuthorProfileChange={(value) => {
          updateAuthorProfile(value)
          draft.markDirty()
        }}
        onSystemPromptChange={(value) => {
          setSystemPromptOverride(value)
          draft.markDirty()
        }}
      />

      <DialogueStructureWidget
        value={normalizedDialogueStructure}
        onChange={(value) => {
          setDialogueStructure(value)
          draft.markDirty()
        }}
      />

      <InGameFlagsSummary />

      {/* Sélecteur de modèle LLM (Story 0.3) */}
      <div style={{ marginBottom: '1rem' }}>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
          {/* Colonne Modèle */}
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
              <label htmlFor="model-select" style={{ color: theme.text.primary, fontSize: '0.9rem', fontWeight: 500 }}>
                Modèle
              </label>
              <div style={{ position: 'relative', display: 'inline-block' }}>
                <button
                  type="button"
                  style={{
                    width: '24px',
                    height: '24px',
                    borderRadius: '12px',
                    border: `1px solid ${theme.border.primary}`,
                    backgroundColor: theme.background.secondary,
                    color: theme.text.secondary,
                    cursor: 'pointer',
                    fontSize: '14px',
                    fontWeight: 'bold',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: 0,
                  }}
                  title={`Provider actuel: ${currentProvider === 'openai' ? 'OpenAI' : 'Mistral'}`}
                >
                  ?
                </button>
              </div>
            </div>
            <ModelSelector />
          </div>

          {/* Colonne Niveau de raisonnement */}
          {(llmModel === "gpt-5.2" || llmModel === "gpt-5.2-pro" || llmModel === "gpt-5-mini" || llmModel === "gpt-5-nano") && (
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                <label htmlFor="reasoning-effort-select" style={{ color: theme.text.primary, fontSize: '0.9rem', fontWeight: 500 }}>
                  Niveau de raisonnement
                </label>
                <div style={{ position: 'relative', display: 'inline-block' }}>
                  <button
                    type="button"
                    style={{
                      width: '24px',
                      height: '24px',
                      borderRadius: '12px',
                      border: `1px solid ${theme.border.primary}`,
                      backgroundColor: theme.background.secondary,
                      color: theme.text.secondary,
                      cursor: 'pointer',
                      fontSize: '14px',
                      fontWeight: 'bold',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      padding: 0,
                    }}
                    title={
                      llmModel === "gpt-5-mini" || llmModel === "gpt-5-nano"
                        ? "Contrôle la profondeur de raisonnement. Mini/nano supportent uniquement minimal, low, medium, high (pas 'none' ni 'xhigh'). Le reasoning est toujours actif."
                        : "Contrôle la profondeur de raisonnement du modèle. Plus élevé = meilleure qualité mais plus lent et plus coûteux."
                    }
                  >
                    ?
                  </button>
                </div>
              </div>
              <select
                id="reasoning-effort-select"
                value={reasoningEffort || (llmModel === "gpt-5-mini" || llmModel === "gpt-5-nano" ? 'minimal' : 'none')}
                onChange={(e) => {
                  const newValue = e.target.value as 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh'
                  setReasoningEffort(newValue === 'none' ? null : newValue)
                  draft.markDirty()
                }}
                style={{ 
                  width: '100%', 
                  padding: '0.5rem', 
                  boxSizing: 'border-box',
                  backgroundColor: theme.input.background,
                  border: `1px solid ${theme.input.border}`,
                  color: theme.input.color,
                  borderRadius: '4px',
                  fontSize: '0.9rem',
                }}
              >
                {/* Options différentes selon le modèle */}
                {llmModel === "gpt-5.2" || llmModel === "gpt-5.2-pro" ? (
                  <>
                    <option value="none">Aucun (rapide, latence minimale)</option>
                    <option value="low">Faible (raisonnement minimal)</option>
                    <option value="medium">Moyen (équilibré, recommandé)</option>
                    <option value="high">Élevé (raisonnement approfondi)</option>
                    <option value="xhigh">Très élevé (raisonnement maximal)</option>
                  </>
                ) : (
                  <>
                    <option value="minimal">Minimal (raisonnement minimal, toujours actif)</option>
                    <option value="low">Faible (raisonnement léger)</option>
                    <option value="medium">Moyen (équilibré, recommandé)</option>
                    <option value="high">Élevé (raisonnement approfondi)</option>
                  </>
                )}
              </select>
            </div>
          )}
          
          {/* Contrôle Top_p */}
          <div style={{ marginTop: '1rem' }}>
            <label style={{ 
              display: 'block', 
              marginBottom: '0.5rem', 
              fontSize: '0.9rem',
              color: theme.text.secondary,
              fontWeight: 500
            }}>
              Top_p (Nucleus Sampling)
              <span style={{ 
                marginLeft: '0.5rem', 
                fontSize: '0.8rem', 
                color: theme.text.tertiary,
                fontWeight: 'normal'
              }}>
                {topP !== null && topP !== undefined ? `(${topP.toFixed(1)})` : '(non utilisé)'}
              </span>
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <input
                type="range"
                min="0"
                max="1"
                step="0.1"
                value={topP ?? 0.5}
                onChange={(e) => {
                  const value = parseFloat(e.target.value)
                  setTopP(value === 0.5 ? null : value)
                  draft.markDirty()
                }}
                style={{ 
                  flex: 1,
                  height: '6px',
                  borderRadius: '3px',
                  background: theme.input.background,
                  outline: 'none',
                }}
              />
              <input
                type="number"
                min="0"
                max="1"
                step="0.1"
                value={topP ?? ''}
                placeholder="Auto"
                onChange={(e) => {
                  const value = e.target.value === '' ? null : parseFloat(e.target.value)
                  if (value === null || (value >= 0 && value <= 1)) {
                    setTopP(value)
                    draft.markDirty()
                  }
                }}
                style={{ 
                  width: '80px', 
                  padding: '0.5rem', 
                  boxSizing: 'border-box',
                  backgroundColor: theme.input.background,
                  border: `1px solid ${theme.input.border}`,
                  color: theme.input.color,
                  borderRadius: '4px',
                  fontSize: '0.9rem',
                }}
              />
              <button
                type="button"
                onClick={() => {
                  setTopP(null)
                  draft.markDirty()
                }}
                style={{
                  padding: '0.5rem 1rem',
                  backgroundColor: theme.button.secondary.background,
                  color: theme.button.secondary.color,
                  border: `1px solid ${theme.button.secondary.border}`,
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '0.9rem',
                }}
              >
                Réinitialiser
              </button>
            </div>
            <div style={{ 
              marginTop: '0.25rem', 
              fontSize: '0.75rem', 
              color: theme.text.tertiary 
            }}>
              {topP === null ? (
                'Non utilisé (temperature sera utilisée si disponible)'
              ) : topP < 0.3 ? (
                'Focalisé (réponses plus déterministes)'
              ) : topP > 0.7 ? (
                'Diversifié (réponses plus créatives)'
              ) : (
                'Équilibré'
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Contrôles de génération (sliders tokens, max choix, tags narratifs) */}
      <GenerationPanelControls
        maxContextTokens={maxContextTokens}
        maxCompletionTokens={maxCompletionTokens}
        maxChoices={maxChoices}
        narrativeTags={narrativeTags}
        availableNarrativeTags={availableNarrativeTags}
        validationErrors={orchestrator.validationErrors}
        tokenCount={orchestrator.tokenCount}
        onMaxContextTokensChange={(value) => {
          setMaxContextTokens(value)
          draft.markDirty()
        }}
        onMaxCompletionTokensChange={(value) => {
          setMaxCompletionTokens(value)
          draft.markDirty()
        }}
        onMaxChoicesChange={(value) => {
          setMaxChoices(value)
          draft.markDirty()
        }}
        onNarrativeTagsChange={(tags) => {
          setNarrativeTags(tags)
          draft.markDirty()
        }}
        onDirty={draft.markDirty}
      />




      {error && (
        <div style={{ 
          color: theme.state.error.color, 
          marginTop: '1rem', 
          padding: '0.5rem', 
          backgroundColor: theme.state.error.background, 
          borderRadius: '4px' 
        }}>
          {error}
        </div>
      )}
      </div>
      
      {/* Modal de progression streaming (Story 0.2) */}
      <GenerationProgressModal
        isOpen={isGenerating}
        content={streamingContent}
        currentStep={currentStep}
        isMinimized={isMinimized}
        error={streamingError}
        isInterrupting={isInterrupting}
        onInterrupt={async () => {
          // Afficher "Interruption en cours..."
          setInterrupting(true)
          
          // Appeler l'API de cancel avec le job_id avec timeout de 10s
          if (currentJobId) {
            try {
              const cancelPromise = dialoguesAPI.cancelGenerationJob(currentJobId).catch((err) => {
                console.warn('Erreur lors de l\'annulation du job:', err)
                return 'error' as const
              })
              const timeoutPromise = new Promise<'timeout'>((resolve) => 
                setTimeout(() => resolve('timeout'), API_TIMEOUTS.CANCEL_JOB)
              )
              
              const result = await Promise.race([cancelPromise, timeoutPromise])
              
              // Si timeout atteint ou erreur, force close EventSource
              if (result === 'timeout' || result === 'error') {
                closeEventSource()
                setStreamingError('Interruption terminée')
              } else {
                // Interruption réussie
                closeEventSource()
                setStreamingError('Génération interrompue')
              }
            } catch (err) {
              console.warn('Erreur lors de l\'annulation du job:', err)
              closeEventSource()
              setStreamingError('Interruption terminée')
            }
          } else {
            closeEventSource()
            setStreamingError('Génération interrompue')
          }
          
          // Réinitialiser l'état
          interrupt()
          
          // Réinitialiser l'état d'interruption après un court délai
          setTimeout(() => {
            setInterrupting(false)
            resetStreamingState()
            setIsLoading(false)
          }, 2000)
        }}
        onMinimize={minimize}
        onClose={() => {
          resetStreamingState()
          setIsLoading(false)
        }}
      />
      
      {/* Modals (reset confirm, preset validation, budget block) */}
      <GenerationPanelModals
        showResetConfirm={showResetConfirm}
        showBudgetBlock={showBudgetBlockModal}
        budgetBlockMessage={budgetBlockMessage}
        validationResult={presets.validationResult}
        isValidationModalOpen={presets.isValidationModalOpen}
        onResetConfirm={() => {
          if (draft.isDirty) {
            orchestrator.handleResetAll()
          } else {
            orchestrator.handleReset()
          }
          setShowResetConfirm(false)
        }}
        onResetCancel={() => setShowResetConfirm(false)}
        onBudgetBlockClose={() => setShowBudgetBlockModal(false)}
        onValidationClose={presets.handleValidationClose}
        onValidationConfirm={presets.handleValidationConfirm}
      />
    </div>
  )
}

