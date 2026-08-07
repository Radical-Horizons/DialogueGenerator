/**
 * Panneau de génération de dialogues.
 * 
 * Composant refactorisé utilisant des hooks métier et composants UI extraits.
 */
import { useState, useEffect, useCallback, useRef } from 'react'
import * as configAPI from '../../api/config'
import * as dialoguesAPI from '../../api/dialogues'
import { useGenerationStore } from '../../store/generationStore'
import { useContextConfigStore } from '../../store/contextConfigStore'
import { useContextStore } from '../../store/contextStore'
import { useGenerationActionsStore } from '../../store/generationActionsStore'
import { useLLMStore } from '../../store/llmStore'
import { useUiLayoutStore } from '../../store/uiLayoutStore'

import {
  MAX_GENERATION_OPTIONS,
  cancelBackgroundOptions,
  useGenerationOptionsStore,
} from '../../store/generationOptionsStore'
import { GenerationOptionsComparison } from './GenerationOptionsComparison'
import { useAuthorProfile } from '../../hooks/useAuthorProfile'
import { theme } from '../../theme'
import type { LLMModelResponse } from '../../types/api'
import { SystemPromptEditor } from './SystemPromptEditor'
import { SceneSelectionWidget } from './SceneSelectionWidget'
import { DialogueFlagsPanel } from './DialogueFlagsPanel'
import { GenerationStreamingInline } from './GenerationStreamingInline'
import { ModelSelector } from './ModelSelector'
import { PresetSelector } from './PresetSelector'
import { useToast } from '../shared'
import { StyledSelect } from '../shared/StyledSelect'
import {
  CONTEXT_TOKENS_LIMITS,
  COMPLETION_TOKENS_LIMITS,
  DEFAULT_MODEL,
  API_TIMEOUTS,
  REASONING_EFFORT_MODELS,
} from '../../constants'
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts'
// Hooks métier extraits
import { useGenerationOrchestrator } from '../../hooks/useGenerationOrchestrator'
import { useGenerationDraft } from '../../hooks/useGenerationDraft'
import { usePresetManagement } from '../../hooks/usePresetManagement'
// Composants UI extraits
import { GenerationPanelControls } from './GenerationPanelControls'
import { GenerationPanelModals } from './GenerationPanelModals'
import { useNarrowInlineSize } from '../../hooks/useNarrowInlineSize'
import { PANEL_COMFORT_MIN_WIDTH_PX, generationPanelChrome } from '../../theme/responsiveChrome'
import { GenerationPanelNarrowProvider } from './GenerationPanelNarrowContext'
import { redesignAccent, redesignFont, redesignHairline, redesignReadingColumn, redesignText } from '../../theme/redesignTokens'
import { remSize } from '../../theme/uiTypography'

const REASONING_EFFORT_SHORT_LABELS: Record<string, string> = {
  none: 'aucun',
  minimal: 'minimal',
  low: 'faible',
  medium: 'moyen',
  high: 'élevé',
  xhigh: 'xhigh',
  max: 'max',
}

function formatTokensShort(value: number): string {
  return value >= 1000 ? `${Math.round(value / 1000)}K` : String(value)
}

export function GenerationPanel() {
  // Stores
  const {
    systemPromptOverride,
    gameRules,
    setSystemPromptOverride,
    setGameRules,
    // État streaming (Story 0.2)
    isGenerating,
    streamingContent,
    currentStep,
    isMinimized,
    error: streamingError,
    currentJobId,
    isInterrupting,
    unityDialogueResponse,
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
  const maxContextTokens = useContextConfigStore((s) => s.contextTokenBudgetMax)
  const setMaxContextTokens = useContextConfigStore((s) => s.setContextTokenBudgetMax)
  const [maxCompletionTokens, setMaxCompletionTokens] = useState<number | null>(null)
  const [llmModel, setLlmModel] = useState<string>(DEFAULT_MODEL)
  const [reasoningEffort, setReasoningEffort] = useState<
    'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'max' | null
  >(null)
  const [topP, setTopP] = useState<number | null>(null)
  const [maxChoices, setMaxChoices] = useState<number | null>(null)
  const choicesMode: 'free' | 'capped' = maxChoices !== null ? 'capped' : 'free'
  const [availableModels, setAvailableModels] = useState<LLMModelResponse[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [narrativeTags, setNarrativeTags] = useState<string[]>([])
  const [previousDialoguePreview] = useState<string | null>(null)
  const [showResetConfirm, setShowResetConfirm] = useState(false)
  const [showModelSettings, setShowModelSettings] = useState(false)
  /** 1c : les variables et flags passent derrière un lien du bandeau de brief. */
  const [showFlagsPanel, setShowFlagsPanel] = useState(false)
  // `=== true` : certains mocks de test renvoient l'objet store entier au lieu du champ
  // sélectionné ; sans cette coercition le bouton serait désactivé à tort.
  const gddCatalogLoading = useContextStore((s) => s.gddCatalogLoading) === true
  const toast = useToast()
  
  const availableNarrativeTags = ['tension', 'humour', 'dramatique', 'intime', 'révélation']
  const maxContextSliderRef = useRef<HTMLInputElement>(null)
  const maxCompletionSliderRef = useRef<HTMLInputElement>(null)
  
  // Hooks métier extraits
  useEffect(() => {
    const getState = useGenerationStore.getState
    if (typeof getState !== 'function') {
      return
    }
    const st = getState() as { setGenerationUserInstructions?: (s: string) => void } | undefined
    if (!st) {
      return
    }
    const sync = st.setGenerationUserInstructions
    if (typeof sync === 'function') {
      sync(userInstructions)
    }
  }, [userInstructions])

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
    setLlmModel,
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
  const isGenerateShortcutBlocked = isLoading || orchestrator.isEstimating

  useKeyboardShortcuts(
    [
      {
        key: 'ctrl+enter',
        handler: () => {
          if (!isGenerateShortcutBlocked) {
            orchestrator.handleGenerate()
          }
        },
        description: 'Générer un dialogue',
        enabled: !isGenerateShortcutBlocked,
      },
      {
        key: 'ctrl+n',
        handler: () => {
          orchestrator.handleReset()
        },
        description: 'Nouveau dialogue (réinitialiser)',
      },
    ],
    [isGenerateShortcutBlocked, orchestrator.handleGenerate, orchestrator.handleReset]
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
    estimateTokens: orchestrator.estimateTokens,
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
      estimateTokens: orchestrator.estimateTokens,
    }
  }, [
    orchestrator.handleGenerate,
    orchestrator.handlePreview,
    orchestrator.handleExportUnity,
    orchestrator.handleReset,
    orchestrator.handleResetAll,
    orchestrator.handleResetInstructions,
    orchestrator.handleResetSelections,
    orchestrator.estimateTokens,
  ])

  // Exposer les handlers via le store pour Dashboard
  useEffect(() => {
    setActions({
      handleGenerate: () => {
        void handlersRef.current.handleGenerate()
      },
      handlePreview: handlersRef.current.handlePreview,
      handleExportUnity: handlersRef.current.handleExportUnity,
      handleReset: handlersRef.current.handleReset,
      estimateTokens: handlersRef.current.estimateTokens,
      isLoading,
      isDirty: draft.isDirty,
      saveStatus: draft.saveStatus,
      draftLastSavedAt: draft.draftLastSavedAt,
    })
  }, [
    isLoading,
    draft.isDirty,
    draft.saveStatus,
    draft.draftLastSavedAt,
    setActions,
  ])
  
  // Initialiser le store au montage
  useEffect(() => {
    setActions({
      handleGenerate: () => {
        void handlersRef.current.handleGenerate()
      },
      handlePreview: handlersRef.current.handlePreview,
      handleExportUnity: handlersRef.current.handleExportUnity,
      handleReset: handlersRef.current.handleReset,
      estimateTokens: handlersRef.current.estimateTokens,
      isLoading,
      isDirty: draft.isDirty,
      saveStatus: draft.saveStatus,
      draftLastSavedAt: draft.draftLastSavedAt,
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

  const { ref: generationScrollRef, isNarrow: isGenerationNarrow } = useNarrowInlineSize(
    PANEL_COMFORT_MIN_WIDTH_PX
  )
  const genChrome = isGenerationNarrow ? generationPanelChrome.narrow : generationPanelChrome.comfortable
  const writingMode = useUiLayoutStore((s) => s.writingMode)
  // 2a : pendant le run, le brief se range et le formulaire cède la colonne au texte
  // qui arrive. « voir » le redéploie sans interrompre la génération.
  // Valeurs déjà déstructurées du store plus haut : pas de seconde souscription, et
  // surtout pas de sélecteur — les mocks de test qui renvoient le store entier
  // rendraient un sélecteur inopérant ici (cf. `useGenerationRunActive`).
  const runActive = isGenerating || isInterrupting
  const [briefExpandedDuringRun, setBriefExpandedDuringRun] = useState(false)
  const optionCount = useGenerationOptionsStore((s) => s.optionCount)
  const optionSlots = useGenerationOptionsStore((s) => s.slots)
  const comparisonActive = optionSlots.length >= 2
  /**
   * Le brief se range dès qu'autre chose occupe la colonne : le texte qui arrive
   * (2a) ou les options à trancher (2b). Il reste rappelable d'un lien — c'est un
   * repli, pas une suppression.
   */
  const briefCollapsedByContext = runActive || comparisonActive
  const showGenerationForm = !briefCollapsedByContext || briefExpandedDuringRun
  useEffect(() => {
    if (!briefCollapsedByContext) setBriefExpandedDuringRun(false)
  }, [briefCollapsedByContext])
  /** 2c : chips de ton, flags et réglages se condensent dans la barre de pied. */
  const showFormExtras = showGenerationForm && !writingMode

  // Multi-options : l'option 1 est le stream principal — quand il aboutit (ou échoue),
  // refléter son état dans le slot 0 de la comparaison.
  useEffect(() => {
    if (optionSlots.length < 2) return
    const slot0 = optionSlots.find((s) => s.index === 0)
    if (!slot0 || slot0.status !== 'running') return
    if (unityDialogueResponse) {
      useGenerationOptionsStore
        .getState()
        .updateSlot(0, { status: 'completed', result: unityDialogueResponse })
    } else if (streamingError) {
      useGenerationOptionsStore.getState().updateSlot(0, { status: 'error', error: streamingError })
    }
  }, [optionSlots, unityDialogueResponse, streamingError])

  /**
   * Interruption de la génération en cours : annulation du job puis remise à zéro de l'état SSE.
   * Comportement inchangé depuis la modale de progression (Story 0.8).
   */
  const handleInterruptGeneration = useCallback(async () => {
    // Afficher "Interruption en cours..."
    setInterrupting(true)

    // Multi-options : annuler aussi les jobs d'arrière-plan (2b).
    cancelBackgroundOptions()

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

    // `interrupt()` remet à zéro streamingContent et error : l'appeler ici effacerait
    // l'avis d'interruption et le texte déjà écrit avant tout rendu. On laisse donc le
    // bloc afficher « Génération interrompue » + le partiel, puis on nettoie au timeout.
    setTimeout(() => {
      setInterrupting(false)
      interrupt()
      resetStreamingState()
      setIsLoading(false)
    }, 2000)
  }, [
    currentJobId,
    closeEventSource,
    interrupt,
    resetStreamingState,
    setInterrupting,
    setStreamingError,
  ])

  /**
   * Seconde sortie de l'écran 2a : couper l'appel **sans** jeter le texte déjà streamé.
   * Contrairement à `handleInterruptGeneration`, on ne remet pas l'état à zéro : le bloc
   * reste affiché avec son partiel, l'utilisateur le ferme quand il l'a récupéré.
   */
  const handleKeepPartialGeneration = useCallback(async () => {
    cancelBackgroundOptions()
    if (currentJobId) {
      await dialoguesAPI.cancelGenerationJob(currentJobId).catch((err) => {
        console.warn('Erreur lors de l\'annulation du job:', err)
      })
    }
    closeEventSource()
    setStreamingError('Génération interrompue — texte conservé')
    setIsLoading(false)
  }, [currentJobId, closeEventSource, setStreamingError])

  const handleCloseStreaming = useCallback(() => {
    closeEventSource()
    resetStreamingState()
    setIsLoading(false)
  }, [closeEventSource, resetStreamingState])

  /** Même garde que l'ancien bouton du pied : génération, estimation, catalogue GDD. */
  const isGeneratePrimaryDisabled =
    isLoading || orchestrator.isEstimating || gddCatalogLoading

  const modelSettingsSummary = [
    llmModel,
    REASONING_EFFORT_SHORT_LABELS[reasoningEffort ?? 'none'],
    `${formatTokensShort(maxContextTokens)}/${formatTokensShort(maxCompletionTokens ?? COMPLETION_TOKENS_LIMITS.DEFAULT)}`,
    maxChoices === null ? 'libre' : `≤ ${maxChoices}`,
  ].join(' · ')

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', backgroundColor: theme.background.panel }}>
      <GenerationPanelNarrowProvider value={isGenerationNarrow}>
      <div
        ref={generationScrollRef}
        style={{
          padding: genChrome.containerPadding,
          flex: 1,
          overflowY: 'auto',
          minWidth: 0,
          // Le contenu défile ; la barre d'action est ancrée en dehors (voir plus
          // bas), donc plus besoin de forcer un flux vertical pleine hauteur ici.
          // Colonne de lecture 660px centrée (écran 1c) — 760px en mode écriture (2c).
          // 2b : la comparaison n'est pas une lecture, elle prend toute la largeur
          // (option ouverte + colonne diagnostic ne tiennent pas dans 660px).
          width: '100%',
          // Mode écriture : largeur fixe de la maquette. Sinon : marges flexibles
          // plafonnées, la colonne prend le reste — sur un écran large, une largeur
          // fixe rejetterait le texte au milieu d'un vide qui grandit sans fin.
          maxWidth: isGenerationNarrow || comparisonActive
            ? undefined
            : writingMode
              ? redesignReadingColumn.writingMode
              : undefined,
          paddingLeft:
            isGenerationNarrow || comparisonActive || writingMode
              ? undefined
              : redesignReadingColumn.sideGutter,
          paddingRight:
            isGenerationNarrow || comparisonActive || writingMode
              ? undefined
              : redesignReadingColumn.sideGutter,
          marginLeft: isGenerationNarrow ? undefined : 'auto',
          marginRight: isGenerationNarrow ? undefined : 'auto',
          boxSizing: 'border-box',
        }}
      >
        {/* Le titre de scène ouvre la colonne sur tous les états (1c, 2a, 2b) : c'est
            le repère qui ne bouge pas pendant que le reste se transforme. */}
        <SceneSelectionWidget />

        {/* Progression du streaming : dans le flux de l'écran, plus de modale (Story 0.2 → refonte UI) */}
        <GenerationStreamingInline
          isActive={
            // 2b : dès qu'un lot d'options est là, la comparaison porte le résultat —
            // laisser le bloc de streaming au-dessus ferait un doublon vide.
            !comparisonActive &&
            (isGenerating ||
              currentStep === 'Complete' ||
              Boolean(streamingError) ||
              isInterrupting)
          }
          content={streamingContent}
          currentStep={currentStep}
          isMinimized={isMinimized}
          error={streamingError}
          isInterrupting={isInterrupting}
          reasoningTrace={unityDialogueResponse?.reasoning_trace ?? null}
          onInterrupt={() => {
            void handleInterruptGeneration()
          }}
          onKeepPartial={() => {
            void handleKeepPartialGeneration()
          }}
          onMinimize={minimize}
          onClose={handleCloseStreaming}
        />

        {/* Comparaison des options (écran 2b) — rendue dès qu'un run multi-options existe. */}
        <GenerationOptionsComparison
          onEditKept={() => {
            // « Éditer » garde l'option puis ouvre l'onglet Édition, seule surface
            // d'édition du dialogue généré.
            useGenerationActionsStore.getState().actions?.handlePreview?.()
          }}
          briefExpanded={briefExpandedDuringRun}
          onEditBrief={() => setBriefExpandedDuringRun((v) => !v)}
        />

        {/* 1c ne montre pas la barre de preset : elle vit avec les réglages du modèle. */}
        <div style={{ display: showModelSettings && showGenerationForm ? 'block' : 'none' }}>
          <PresetSelector
            onPresetLoaded={presets.handlePresetLoaded}
            getCurrentConfiguration={presets.getCurrentConfiguration}
            saveStatus={draft.saveStatus}
          />
        </div>

      {/* 2a : pendant le run, le brief se replie en une ligne avec son coût. */}
      {runActive && !briefExpandedDuringRun && (
        <div
          data-testid="brief-collapsed-line"
          style={{
            display: 'flex',
            alignItems: 'baseline',
            justifyContent: 'flex-end',
            gap: 6,
            marginBottom: 22,
            fontSize: '12px',
            color: redesignText.muted,
          }}
        >
          <span>brief · {Math.max(1, Math.ceil(userInstructions.length / 4))} tok ·</span>
          <button
            type="button"
            data-testid="brief-reveal"
            onClick={() => setBriefExpandedDuringRun(true)}
            style={{
              border: 'none',
              background: 'none',
              padding: 0,
              cursor: 'pointer',
              color: redesignText.secondary,
              fontSize: '12px',
            }}
          >
            voir
          </button>
        </div>
      )}

      {/* Chips de ton (écran 1c) — juste sous le titre de scène. */}
      <div
        style={{
          display: showFormExtras ? 'flex' : 'none',
          flexWrap: 'wrap',
          gap: 7,
          marginBottom: 22,
        }}
      >
        {availableNarrativeTags.map((tag) => {
          const active = narrativeTags.includes(tag)
          return (
            <button
              key={tag}
              type="button"
              onClick={() => {
                setNarrativeTags(
                  active ? narrativeTags.filter((t) => t !== tag) : [...narrativeTags, tag],
                )
                draft.markDirty()
              }}
              style={{
                height: 25,
                padding: '0 10px',
                borderRadius: 99,
                border: active
                  ? '1px solid rgba(79,127,255,0.4)'
                  : '1px solid rgba(255,255,255,0.12)',
                backgroundColor: active ? 'rgba(79,127,255,0.1)' : 'transparent',
                color: active ? '#a9c3ff' : redesignText.muted,
                fontSize: '11.5px',
                display: 'flex',
                alignItems: 'center',
                cursor: 'pointer',
              }}
            >
              {tag}
            </button>
          )
        })}
      </div>

      <div style={{ display: showGenerationForm ? 'block' : 'none' }}>
      <SystemPromptEditor
        flagsPanelOpen={showFlagsPanel}
        onToggleFlagsPanel={() => setShowFlagsPanel((v) => !v)}
        userInstructions={userInstructions}
        authorProfile={authorProfile}
        gameRules={gameRules}
        systemPromptOverride={systemPromptOverride}
        onUserInstructionsChange={(value) => {
          setUserInstructions(value)
          draft.markDirty()
        }}
        onAuthorProfileChange={(value) => {
          updateAuthorProfile(value)
          draft.markDirty()
        }}
        onGameRulesChange={(value) => {
          setGameRules(value)
          draft.markDirty()
        }}
        onSystemPromptChange={(value) => {
          setSystemPromptOverride(value)
          draft.markDirty()
        }}
      />
      </div>

      {/* 1c : les flags sont un lien du bandeau de brief, pas une section pleine.
          Le panneau ne se monte que sur demande. */}
      <div
        style={{
          marginBottom: 22,
          display: showFormExtras && showFlagsPanel ? 'block' : 'none',
        }}
      >
        <DialogueFlagsPanel />
      </div>

      {/* Réglages du modèle : résumés en une ligne cliquable (refonte UI), détail dépliable. */}
      <div style={{ marginBottom: '1rem', display: showFormExtras ? 'block' : 'none' }}>
        <button
          type="button"
          onClick={() => setShowModelSettings((v) => !v)}
          data-testid="model-settings-summary-toggle"
          aria-expanded={showModelSettings}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.4rem',
            padding: '0.4rem 0',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: theme.text.secondary,
            fontFamily: redesignFont.mono,
            fontSize: remSize('small'),
            width: '100%',
            textAlign: 'left',
          }}
        >
          <span style={{ color: theme.text.tertiary }}>Réglages du modèle</span>
          <span style={{ color: theme.text.primary }}>{modelSettingsSummary}</span>
          <span aria-hidden style={{ marginLeft: 'auto', color: theme.text.tertiary }}>
            {showModelSettings ? '▴' : '▾'}
          </span>
        </button>
      </div>

      {showModelSettings && showFormExtras && (
      <>
      {/* Sélecteur de modèle LLM (Story 0.3) */}
      <div style={{ marginBottom: '1rem' }}>
        <div
          style={{
            display: 'flex',
            flexWrap: isGenerationNarrow ? 'wrap' : 'nowrap',
            gap: `${genChrome.controlGapRem}rem`,
            alignItems: 'flex-start',
          }}
        >
          {/* Colonne Modèle */}
          <div style={{ flex: isGenerationNarrow ? '1 1 100%' : '1', minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
              <label
                htmlFor="model-select"
                style={{
                  color: theme.text.primary,
                  fontSize: `${genChrome.labelFontRem}rem`,
                  fontWeight: 500,
                }}
              >
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
          {(REASONING_EFFORT_MODELS as readonly string[]).includes(llmModel) && (
            <div style={{ flex: isGenerationNarrow ? '1 1 100%' : '1', minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                <label
                  htmlFor="reasoning-effort-select"
                  style={{
                    color: theme.text.primary,
                    fontSize: `${genChrome.labelFontRem}rem`,
                    fontWeight: 500,
                  }}
                >
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
                    title="Contrôle la profondeur de raisonnement GPT-5.6 (none → max). Plus élevé = meilleure qualité mais plus lent et plus coûteux."
                  >
                    ?
                  </button>
                </div>
              </div>
              <StyledSelect
                id="reasoning-effort-select"
                value={reasoningEffort || 'none'}
                onChange={(e) => {
                  const newValue = e.target.value as 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'max'
                  setReasoningEffort(newValue === 'none' ? null : newValue)
                  draft.markDirty()
                }}
                style={{ 
                  width: '100%', 
                  padding: genChrome.selectTriggerPadding, 
                  boxSizing: 'border-box',
                  backgroundColor: theme.input.background,
                  border: `1px solid ${theme.input.border}`,
                  color: theme.input.color,
                  borderRadius: '4px',
                  fontSize: `${genChrome.selectTextFontRem}rem`,
                }}
              >
                <>
                  <option value="none">Aucun (rapide, latence minimale)</option>
                  <option value="low">Faible</option>
                  <option value="medium">Moyen (équilibré, recommandé)</option>
                  <option value="high">Élevé</option>
                  <option value="xhigh">Très élevé (xhigh)</option>
                  <option value="max">Maximum (qualité d'abord)</option>
                </>
              </StyledSelect>
            </div>
          )}
          
          {/* Contrôle Top_p */}
          <div
            style={{
              marginTop: isGenerationNarrow ? 0 : '1rem',
              flex: isGenerationNarrow ? '1 1 100%' : undefined,
              minWidth: isGenerationNarrow ? 0 : undefined,
              width: isGenerationNarrow ? '100%' : undefined,
            }}
          >
            <label style={{ 
              display: 'block', 
              marginBottom: '0.5rem', 
              fontSize: `${genChrome.labelFontRem}rem`,
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
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: `${genChrome.controlGapRem}rem`,
                flexWrap: isGenerationNarrow ? 'wrap' : 'nowrap',
              }}
            >
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
                  padding: genChrome.selectTriggerPadding, 
                  boxSizing: 'border-box',
                  backgroundColor: theme.input.background,
                  border: `1px solid ${theme.input.border}`,
                  color: theme.input.color,
                  borderRadius: '4px',
                  fontSize: `${genChrome.selectTextFontRem}rem`,
                }}
              />
              <button
                type="button"
                onClick={() => {
                  setTopP(null)
                  draft.markDirty()
                }}
                style={{
                  padding: genChrome.buttonPadding,
                  backgroundColor: theme.button.secondary.background,
                  color: theme.button.secondary.color,
                  border: `1px solid ${theme.button.secondary.border}`,
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: `${genChrome.buttonFontRem}rem`,
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
                'Non utilisé — GPT-5.6 n\'accepte ni temperature ni top_p ; régler le niveau de raisonnement.'
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
        configFixes={orchestrator.configFixes}
        onApplyConfigFixes={orchestrator.applyConfigFixesToState}
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
      </>
      )}

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

      {/* Barre d'action bas de colonne de lecture (écran 1c) : réglages résumés, bouton, coût.
          2a : masquée pendant le run — les deux sorties vivent dans le bloc de streaming.
          2c : une seule rangée — mots · tokens · coût à gauche, réglages + Générer à droite. */}
      <div
        data-testid="generation-primary-action"
        // 2a : les deux sorties vivent dans le bloc de streaming. 2b : l'action
        // primaire est « Garder et continuer », et relancer passe par
        // « Régénérer les N ». Dans les deux cas la barre revient dès que
        // l'utilisateur redéploie le brief.
        hidden={!showGenerationForm}
        style={{
          borderTop: `1px solid ${redesignHairline.strong}`,
          paddingTop: writingMode ? 16 : 13,
          // Ancrée par la structure (sœur du conteneur défilant), plus par une
          // marge : `marginTop: auto` la collait au bas du *contenu*, donc elle
          // partait sous le tiroir bas dès que le contenu débordait (mesuré à
          // 1024x800 : barre en 739-824, colonne défilante arrêtée à 764).
          marginTop: 0,
          flexShrink: 0,
          paddingBottom: writingMode ? 40 : 0,
          // `display` explicite : un `display` inline l'emporte sur la règle UA
          // `[hidden] { display: none }`, donc l'attribut seul ne masquerait rien.
          display: showGenerationForm ? 'flex' : 'none',
          flexDirection: writingMode ? 'row' : 'column',
          alignItems: writingMode ? 'center' : undefined,
          justifyContent: writingMode ? 'space-between' : undefined,
          gap: writingMode ? 22 : 9,
          flexWrap: 'wrap',
        }}
      >
        {writingMode && (
          <span
            data-testid="writing-mode-metrics"
            style={{
              display: 'flex',
              gap: 22,
              fontFamily: redesignFont.mono,
              fontSize: '10.5px',
              letterSpacing: '0.05em',
              color: redesignText.label,
              whiteSpace: 'nowrap',
            }}
          >
            <span>
              {userInstructions.trim() ? userInstructions.trim().split(/\s+/).length : 0} MOTS
            </span>
            {orchestrator.tokenCount != null && (
              <span>{orchestrator.tokenCount.toLocaleString('fr-FR')} TOKENS</span>
            )}
          </span>
        )}
        {writingMode && (
          <span
            style={{
              fontFamily: redesignFont.mono,
              fontSize: '11px',
              color: redesignText.muted,
              whiteSpace: 'nowrap',
              marginLeft: 'auto',
            }}
          >
            {modelSettingsSummary}
          </span>
        )}
        <div style={{ display: 'flex', gap: 9, flexShrink: 0 }}>
          <button
            type="button"
            onClick={() => void orchestrator.handleGenerate()}
            disabled={isGeneratePrimaryDisabled}
            style={{
              height: writingMode ? 38 : 46,
              padding: writingMode ? '0 20px' : undefined,
              borderRadius: 6,
              border: 'none',
              backgroundColor: redesignAccent.base,
              color: '#ffffff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 11,
              cursor: isGeneratePrimaryDisabled ? 'not-allowed' : 'pointer',
              opacity: isGeneratePrimaryDisabled ? 0.6 : 1,
              flex: 1,
              minWidth: 0,
            }}
          >
            <span style={{ fontSize: writingMode ? '13.5px' : '14.5px', fontWeight: 600 }}>
              {optionCount > 1
                ? `Générer ${optionCount} options`
                : writingMode
                  ? 'Générer'
                  : 'Générer le premier nœud'}
            </span>
            <span
              style={{
                fontFamily: redesignFont.mono,
                fontSize: '11px',
                // Sur l'accent, le blanc pur plafonne à 3,61:1 : on prend ce maximum
                // plutôt que 2,26:1. AA reste hors d'atteinte sans changer l'accent,
                // ce que la décision produit interdit (voir spec-audit-rendu-ui).
                color: theme.button.primary.color,
              }}
            >
              CTRL+↵
            </span>
          </button>
          {/* 2b : nombre d'options par génération — N appels LLM parallèles, plafonnés. */}
          <button
            type="button"
            data-testid="generation-option-count"
            onClick={() =>
              useGenerationOptionsStore
                .getState()
                .setOptionCount(optionCount >= MAX_GENERATION_OPTIONS ? 1 : optionCount + 1)
            }
            disabled={isGeneratePrimaryDisabled}
            title={`Nombre d'options générées en parallèle (coût ×${optionCount}). Cliquer pour changer — max ${MAX_GENERATION_OPTIONS}.`}
            style={{
              height: 46,
              padding: '0 14px',
              borderRadius: 6,
              border: '1px solid #2e2e36',
              backgroundColor: 'transparent',
              color: optionCount > 1 ? redesignAccent.light : redesignText.secondary,
              fontFamily: redesignFont.mono,
              fontSize: '11px',
              letterSpacing: '0.05em',
              cursor: isGeneratePrimaryDisabled ? 'not-allowed' : 'pointer',
              opacity: isGeneratePrimaryDisabled ? 0.6 : 1,
              flexShrink: 0,
            }}
          >
            × {optionCount}
          </button>
        </div>
        {orchestrator.tokenCount != null && !writingMode && (
          <div
            style={{
              textAlign: 'center',
              fontFamily: redesignFont.mono,
              fontSize: '10.5px',
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              color: redesignText.label,
            }}
          >
            {orchestrator.tokenCount.toLocaleString('fr-FR')} tokens · {llmModel}
          </div>
        )}
      </div>
      </GenerationPanelNarrowProvider>
      
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

