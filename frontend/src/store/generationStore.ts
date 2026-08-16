/**
 * Store Zustand pour gérer l'état de génération.
 */
import { create } from 'zustand'
import type { ContextDroppingRules } from '../types/graph'
import type { SceneSelection } from '../types/generation'
import type { ContextSelection } from '../types/api'
import type { ContextTokenBreakdownRow, GenerateUnityDialogueResponse, RawPrompt } from '../types/api'
import type { ContextItem, PromptSection, PromptStructure } from '../types/prompt'
import {
  entityTokenCacheKey,
  type EntityType,
} from '../utils/contextEntityTokenCache'
import {
  buildStructuredFromBootstrap,
  computeTotalsFromStructuredPrompt,
  reconcileStructuredPromptTotals,
  rebuildContextFromEntityCache,
} from '../utils/structuredPromptMerge'

interface GenerationState {
  // Sélection de scène
  sceneSelection: SceneSelection
  
  // Structure de dialogue
  dialogueStructure: string[]
  
  // System prompt
  systemPromptOverride: string | null
  defaultSystemPrompt: string | null
  gameRules: string
  
  // Source de vérité unique pour le prompt
  rawPrompt: RawPrompt | null
  structuredPrompt: PromptStructure | null
  promptHash: string | null
  /** Hash des paramètres d’entrée (SHA des params normalisés) — aligné avec computeStateHash ; sert au cache d’estimation. */
  previewInputHash: string | null
  tokenCount: number | null
  /** Tokens du prompt complet (POST /dialogues/estimate-tokens → token_count). */
  promptTokenCount: number | null
  isEstimating: boolean
  /** Erreur POST /context/estimate-tokens (compteur unique UI). */
  contextEstimationError: string | null
  contextTokenBreakdown: ContextTokenBreakdownRow[]
  contextBreakdownNote: string
  /** Tokens par fiche (clé entityTokenCacheKey) — soustraction locale au retrait. */
  entityTokenByKey: Record<string, number>
  /** ContextItem par fiche — reconstruction prompt structuré incrémental. */
  entityContextItemsByKey: Record<string, ContextItem>
  /** Overhead prompt (hors GDD), mis en cache après 1ère estimation complète. */
  promptOverheadTokens: number | null
  
  // Résultats de génération
  unityDialogueResponse: GenerateUnityDialogueResponse | null
  tokensUsed: number | null

  /** Overlay session anti-drop (template 6.5). null = hériter fichier 4.10. */
  contextDroppingRulesOverlay: ContextDroppingRules | null
  setContextDroppingRulesOverlay: (rules: ContextDroppingRules | null) => void
  contextDroppingWarning: string | null
  setContextDroppingWarning: (message: string | null) => void
  /** Brief génération (textarea) — lu par preview/optimize sans le store graphe. */
  generationUserInstructions: string
  setGenerationUserInstructions: (value: string) => void
  
  // État streaming (Task 2 - Story 0.2)
  isGenerating: boolean
  streamingContent: string
  currentStep: 'Prompting' | 'Generating' | 'Validating' | 'Complete'
  isMinimized: boolean
  error: string | null
  currentJobId: string | null
  isInterrupting: boolean  // Task 4 - Story 0.8
  /** Horodatage du début du run (écran 2a : compteur `GÉNÉRATION · MM:SS` du header). */
  generationStartedAt: number | null
  chunkBuffer: Map<number, string>  // Buffer pour réordonner les chunks avec séquence
  lastProcessedSequence: number  // Dernière séquence traitée (pour réordonnancement)
  
  // Actions
  setSceneSelection: (selection: Partial<SceneSelection>) => void
  setDialogueStructure: (structure: string[]) => void
  setSystemPromptOverride: (prompt: string | null) => void
  setGameRules: (rules: string) => void
  setDefaultSystemPrompt: (prompt: string | null) => void
  resetSystemPrompt: () => void
  setRawPrompt: (
    prompt: RawPrompt | null,
    tokens: number | null,
    hash: string | null,
    isEstimating: boolean,
    structuredPrompt?: PromptStructure | null,
    previewHashUpdate?: 'invalidate' | 'preserve' | string
  ) => void
  /** Met à jour les compteurs (prompt complet + sélection GDD) et optionnellement le preview. */
  setContextTokenEstimate: (update: {
    selectionTokens: number | null
    promptTokenCount?: number | null
    isEstimating: boolean
    previewInputHash?: string | null | 'preserve' | 'invalidate'
    contextEstimationError?: string | null
    contextTokenBreakdown?: ContextTokenBreakdownRow[]
    contextBreakdownNote?: string
    rawPrompt?: RawPrompt | null
    structuredPrompt?: PromptStructure | null
    promptHash?: string | null
    entityTokenByKey?: Record<string, number>
    entityContextItemsByKey?: Record<string, ContextItem>
    promptOverheadTokens?: number | null
  }) => void
  setEntityTokenCache: (cache: Record<string, number>) => void
  applyOptimisticEntityRemovals: (
    removals: Array<{ entityType: string; name: string; mode: 'full' | 'excerpt' }>,
    selections: ContextSelection,
  ) => boolean
  applyOptimisticEntityAdditions: (
    additions: Array<{
      entityType: string
      name: string
      mode: 'full' | 'excerpt'
      token_count: number
      context_item?: ContextItem | null
    }>,
    selections: ContextSelection,
  ) => void
  syncIncrementalContextFromCache: (selections: ContextSelection) => void
  applyBootstrapFromPrecomputed: (
    selections: ContextSelection,
    payload: {
      entities: Array<{
        entityType: string
        name: string
        mode: 'full' | 'excerpt'
        token_count: number
        context_item?: ContextItem | null
      }>
      overheadSections?: PromptSection[] | null
    },
  ) => void
  setUnityDialogueResponse: (response: GenerateUnityDialogueResponse | null) => void
  setTokensUsed: (tokens: number | null) => void
  clearGenerationResults: () => void
  
  // Actions streaming (Task 2 - Story 0.2)
  startGeneration: (jobId: string) => void
  appendChunk: (chunk: string, sequence?: number) => void
  setStep: (step: 'Prompting' | 'Generating' | 'Validating' | 'Complete') => void
  interrupt: () => void
  minimize: () => void
  complete: () => void
  setError: (error: string) => void
  resetStreamingState: () => void
  setInterrupting: (isInterrupting: boolean) => void  // Task 4 - Story 0.8
}


const defaultSceneSelection: SceneSelection = {
  characterA: null,
  characterB: null,
  sceneRegion: null,
  subLocation: null,
}

const defaultDialogueStructure: string[] = ['PNJ', 'PJ', 'Stop', '', '', '']
const defaultGameRules = [
  'Influence et Respect ne doivent être utilisés que si la relation avec le PNJ le justifie.',
  'Axes de réputation disponibles: Admiration, Prestige, Crainte.',
  'Quand c’est pertinent, proposer des choix liés aux traits requis et aux gains systémiques plutôt que de les injecter artificiellement.',
  'Viser un équilibre raisonnable entre options sociales (Influence/Respect), à effets de réputation et neutres selon la scène.',
].join('\n')

export const useGenerationStore = create<GenerationState>((set) => ({
  sceneSelection: defaultSceneSelection,
  dialogueStructure: defaultDialogueStructure,
  systemPromptOverride: null,
  defaultSystemPrompt: null,
  gameRules: defaultGameRules,
  rawPrompt: null,
  structuredPrompt: null,
  promptHash: null,
  previewInputHash: null,
  tokenCount: null,
  promptTokenCount: null,
  isEstimating: false,
  contextEstimationError: null,
  contextTokenBreakdown: [],
  contextBreakdownNote: '',
  entityTokenByKey: {},
  entityContextItemsByKey: {},
  promptOverheadTokens: null,
  unityDialogueResponse: null,
  tokensUsed: null,
  generationUserInstructions: '',
  setGenerationUserInstructions: (value: string) => set({ generationUserInstructions: value }),
  contextDroppingRulesOverlay: null,
  setContextDroppingRulesOverlay: (rules) => set({ contextDroppingRulesOverlay: rules }),
  contextDroppingWarning: null,
  setContextDroppingWarning: (message) => set({ contextDroppingWarning: message }),

  // État streaming initial (Task 2 - Story 0.2)
  isGenerating: false,
  streamingContent: '',
  currentStep: 'Prompting',
  isMinimized: false,
  error: null,
  currentJobId: null,
  isInterrupting: false,  // Task 4 - Story 0.8
  generationStartedAt: null,
  chunkBuffer: new Map<number, string>(),
  lastProcessedSequence: -1,  // Dernière séquence traitée

  setSceneSelection: (selection) =>
    set((state) => ({
      sceneSelection: { ...state.sceneSelection, ...selection },
    })),

  setDialogueStructure: (structure) =>
    set({ dialogueStructure: structure }),

  setSystemPromptOverride: (prompt) =>
    set({ systemPromptOverride: prompt }),

  setGameRules: (rules) =>
    set({ gameRules: rules }),

  setDefaultSystemPrompt: (prompt) =>
    set({ defaultSystemPrompt: prompt }),

  resetSystemPrompt: () =>
    set((state) => ({
      systemPromptOverride: state.defaultSystemPrompt,
    })),

  setRawPrompt: (prompt, tokens, hash, isEstimating, structuredPrompt = null, previewHashUpdate) =>
    set((state) => {
      let nextPreview = state.previewInputHash
      if (previewHashUpdate === undefined || previewHashUpdate === 'invalidate') {
        nextPreview = null
      } else if (previewHashUpdate === 'preserve') {
        nextPreview = state.previewInputHash
      } else {
        nextPreview = previewHashUpdate
      }
      return {
        rawPrompt: prompt,
        structuredPrompt: structuredPrompt ?? null,
        tokenCount: tokens,
        promptHash: hash,
        isEstimating,
        previewInputHash: nextPreview,
      }
    }),

  setContextTokenEstimate: (update) =>
    set((state) => {
      let nextPreview = state.previewInputHash
      const hashUpdate = update.previewInputHash
      if (hashUpdate === 'invalidate') {
        nextPreview = null
      } else if (hashUpdate === 'preserve' || hashUpdate === undefined) {
        nextPreview = state.previewInputHash
      } else if (hashUpdate !== null) {
        nextPreview = hashUpdate
      }

      return {
        tokenCount: update.selectionTokens,
        promptTokenCount:
          update.promptTokenCount !== undefined ? update.promptTokenCount : state.promptTokenCount,
        isEstimating: update.isEstimating,
        previewInputHash: nextPreview,
        contextEstimationError:
          update.contextEstimationError !== undefined ? update.contextEstimationError : state.contextEstimationError,
        contextTokenBreakdown:
          update.contextTokenBreakdown !== undefined ? update.contextTokenBreakdown : state.contextTokenBreakdown,
        contextBreakdownNote:
          update.contextBreakdownNote !== undefined ? update.contextBreakdownNote : state.contextBreakdownNote,
        ...(update.rawPrompt !== undefined ? { rawPrompt: update.rawPrompt } : {}),
        ...(update.structuredPrompt !== undefined ? { structuredPrompt: update.structuredPrompt } : {}),
        ...(update.promptHash !== undefined ? { promptHash: update.promptHash } : {}),
        ...(update.entityTokenByKey !== undefined ? { entityTokenByKey: update.entityTokenByKey } : {}),
        ...(update.entityContextItemsByKey !== undefined
          ? { entityContextItemsByKey: update.entityContextItemsByKey }
          : {}),
        ...(update.promptOverheadTokens !== undefined
          ? { promptOverheadTokens: update.promptOverheadTokens }
          : {}),
      }
    }),

  setEntityTokenCache: (cache) => set({ entityTokenByKey: cache }),

  applyOptimisticEntityRemovals: (removals, selections) => {
    const state = useGenerationStore.getState()
    if (state.tokenCount == null && Object.keys(state.entityContextItemsByKey).length === 0) {
      return false
    }

    for (const { entityType, name, mode } of removals) {
      const key = entityTokenCacheKey(entityType as EntityType, name, mode)
      if (state.entityTokenByKey[key] == null && state.entityContextItemsByKey[key] == null) {
        return false
      }
    }

    set((current) => {
      const entityTokenByKey = { ...current.entityTokenByKey }
      const entityContextItemsByKey = { ...current.entityContextItemsByKey }
      for (const { entityType, name, mode } of removals) {
        const key = entityTokenCacheKey(entityType as EntityType, name, mode)
        delete entityTokenByKey[key]
        delete entityContextItemsByKey[key]
      }
      return { entityTokenByKey, entityContextItemsByKey }
    })

    useGenerationStore.getState().syncIncrementalContextFromCache(selections)
    return true
  },

  syncIncrementalContextFromCache: (selections) => {
    set((current) => {
      const structuredPrompt = rebuildContextFromEntityCache(
        current.structuredPrompt,
        selections,
        current.entityContextItemsByKey,
      )
      const { selectionTokens, promptTokens } = computeTotalsFromStructuredPrompt(structuredPrompt)
      const entityTokenByKey: Record<string, number> = {}
      for (const [key, item] of Object.entries(current.entityContextItemsByKey)) {
        if (item.tokenCount != null) {
          entityTokenByKey[key] = item.tokenCount
        }
      }

      const breakdown: ContextTokenBreakdownRow[] = []
      const contextSection = structuredPrompt.sections.find((s) => s.type === 'context')
      for (const category of contextSection?.categories ?? []) {
        const entityType = category.type
        if (!entityType) continue
        breakdown.push({
          entity_type: entityType,
          mode: 'full',
          token_count: category.tokenCount ?? 0,
        })
      }

      return {
        structuredPrompt,
        tokenCount: selectionTokens,
        promptTokenCount: promptTokens,
        isEstimating: false,
        previewInputHash: null,
        contextEstimationError: null,
        contextTokenBreakdown: breakdown,
        entityTokenByKey,
      }
    })
  },

  applyOptimisticEntityAdditions: (additions, selections) => {
    set((current) => {
      const entityTokenByKey = { ...current.entityTokenByKey }
      const entityContextItemsByKey = { ...current.entityContextItemsByKey }

      for (const { entityType, name, mode, token_count, context_item } of additions) {
        if (!context_item || token_count <= 0) continue
        const key = entityTokenCacheKey(entityType as EntityType, name, mode)
        entityTokenByKey[key] = token_count
        entityContextItemsByKey[key] = {
          ...context_item,
          name: context_item.name ?? name,
          tokenCount: token_count,
        }
      }

      return { entityTokenByKey, entityContextItemsByKey }
    })
    useGenerationStore.getState().syncIncrementalContextFromCache(selections)
  },

  applyBootstrapFromPrecomputed: (_selections, payload) => {
    const entityTokenByKey: Record<string, number> = {}
    const entityContextItemsByKey: Record<string, ContextItem> = {}
    const entries = payload.entities
      .filter((row) => row.context_item && row.token_count > 0)
      .map((row) => {
        const key = entityTokenCacheKey(
          row.entityType as EntityType,
          row.name,
          row.mode,
        )
        const item: ContextItem = {
          ...row.context_item!,
          name: row.context_item!.name ?? row.name,
          tokenCount: row.token_count,
        }
        entityTokenByKey[key] = row.token_count
        entityContextItemsByKey[key] = item
        return {
          entityType: row.entityType as EntityType,
          name: row.name,
          mode: row.mode,
          tokenCount: row.token_count,
          contextItem: item,
        }
      })

    const structuredPrompt = reconcileStructuredPromptTotals(
      buildStructuredFromBootstrap(payload.overheadSections ?? undefined, entries),
    )
    const { selectionTokens, promptTokens } = computeTotalsFromStructuredPrompt(structuredPrompt)
    const breakdown: ContextTokenBreakdownRow[] = []
    const contextSection = structuredPrompt.sections.find((s) => s.type === 'context')
    for (const category of contextSection?.categories ?? []) {
      if (!category.type) continue
      breakdown.push({
        entity_type: category.type,
        mode: 'full',
        token_count: category.tokenCount ?? 0,
      })
    }
    const overhead = promptTokens - selectionTokens

    set({
      structuredPrompt,
      tokenCount: selectionTokens,
      promptTokenCount: promptTokens,
      isEstimating: false,
      previewInputHash: null,
      contextEstimationError: null,
      contextTokenBreakdown: breakdown,
      entityTokenByKey,
      entityContextItemsByKey,
      promptOverheadTokens: overhead > 0 ? overhead : null,
    })
  },

  setUnityDialogueResponse: (response) =>
    set({ unityDialogueResponse: response }),

  setTokensUsed: (tokens) =>
    set({ tokensUsed: tokens }),

  clearGenerationResults: () =>
    set({ unityDialogueResponse: null, tokensUsed: null }),

  // Actions streaming (Task 2 - Story 0.2)
  startGeneration: (jobId) =>
    set({
      isGenerating: true,
      streamingContent: '',
      currentStep: 'Prompting',
      isMinimized: false,
      error: null,
      currentJobId: jobId,
      generationStartedAt: Date.now(),
      chunkBuffer: new Map<number, string>(),
      lastProcessedSequence: -1,
    }),

  appendChunk: (chunk, sequence) =>
    set((state) => {
      if (sequence === undefined || sequence === null) {
        return { streamingContent: state.streamingContent + chunk }
      }

      const expected = state.lastProcessedSequence + 1
      if (sequence < expected) {
        return state
      }

      if (sequence > expected) {
        const newBuffer = new Map(state.chunkBuffer)
        newBuffer.set(sequence, chunk)
        let nextExpected = expected
        let newContent = state.streamingContent
        let lastAdded = state.lastProcessedSequence

        const sortedSequences = Array.from(newBuffer.keys()).sort((a, b) => a - b)
        for (const seq of sortedSequences) {
          if (seq === nextExpected) {
            newContent += newBuffer.get(seq)!
            newBuffer.delete(seq)
            lastAdded = seq
            nextExpected++
          } else if (seq < nextExpected) {
            newBuffer.delete(seq)
          } else {
            break
          }
        }

        return {
          streamingContent: newContent,
          chunkBuffer: newBuffer,
          lastProcessedSequence: lastAdded,
        }
      }

      return {
        streamingContent: state.streamingContent + chunk,
        ...(state.chunkBuffer.size > 0 ? { chunkBuffer: new Map<number, string>() } : {}),
        lastProcessedSequence: sequence,
      }
    }),

  setStep: (step) =>
    set({ currentStep: step }),

  interrupt: () =>
    set({
      isGenerating: false,
      streamingContent: '',
      chunkBuffer: new Map<number, string>(),
      lastProcessedSequence: -1,
      currentStep: 'Prompting',
      error: null,
      currentJobId: null,
      isInterrupting: false,  // Fix: Réinitialiser isInterrupting (Issue #4)
      generationStartedAt: null,
    }),

  minimize: () =>
    set((state) => ({
      isMinimized: !state.isMinimized,
    })),

  complete: () =>
    set({
      isGenerating: false,
      currentStep: 'Complete',
      chunkBuffer: new Map<number, string>(),
      lastProcessedSequence: -1,
    }),

  setError: (error) =>
    set({
      isGenerating: false,
      error,
    }),

  resetStreamingState: () =>
    set({
      isGenerating: false,
      streamingContent: '',
      currentStep: 'Prompting',
      isMinimized: false,
      error: null,
      currentJobId: null,
      isInterrupting: false,
      generationStartedAt: null,
      chunkBuffer: new Map<number, string>(),
      lastProcessedSequence: -1,
    }),

  setInterrupting: (isInterrupting) =>
    set({ isInterrupting }),  // Task 4 - Story 0.8
}))


