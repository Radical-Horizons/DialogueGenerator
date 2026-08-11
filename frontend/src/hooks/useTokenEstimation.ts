/**
 * Estimation debouncée du prompt total léger + sélection GDD (POST /context/estimate-tokens).
 * Ne charge pas le prompt brut : l'onglet Prompt le fait uniquement sur demande.
 */
import { useState, useCallback, useEffect, useRef, useMemo } from 'react'
import { estimateContextTokens, fetchPrecomputedEntityTokens } from '../api/context'
import { useGenerationStore } from '../store/generationStore'
import { useContextStore } from '../store/contextStore'
import { useContextConfigStore } from '../store/contextConfigStore'
import { useVocabularyStore } from '../store/vocabularyStore'
import { useNarrativeGuidesStore } from '../store/narrativeGuidesStore'
import { useAuthorProfile } from '../hooks/useAuthorProfile'
import { useGenerationRequest } from './useGenerationRequest'
import { getErrorMessage } from '../types/errors'
import type { ContextSelection } from '../types/api'
import { computeStateHash } from '../utils/hashUtils'
import { buildFieldConfigsWithEssential, buildPromptStateParams, buildTokenEstimateRequest } from '../utils/buildTokenEstimateRequest'
import {
  buildEntityContextItemsFromStructuredPrompt,
  buildEntityTokenCacheFromStructuredPrompt,
  findAdditionsOnly,
  findRemovalsOnly,
  listAllSelectionEntities,
  selectionFingerprint,
  type SelectionEntityDelta,
} from '../utils/contextEntityTokenCache'
import {
  fetchPrecomputedBootstrap,
  isBootstrapComplete,
} from '../utils/precomputedBootstrap'

const EMPTY_CONTEXT_SELECTION: ContextSelection = {
  characters_full: [],
  characters_excerpt: [],
  locations_full: [],
  locations_excerpt: [],
  items_full: [],
  items_excerpt: [],
  species_full: [],
  species_excerpt: [],
  communities_full: [],
  communities_excerpt: [],
  dialogues_examples: [],
  narrative_structures: [],
  chapters: [],
  scenes: [],
}

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
  /** selection_tokens (contexte GDD — budget / optimisation) */
  tokenCount: number | null
  /** token_count (prompt complet envoyé au LLM) */
  promptTokenCount: number | null
  /** Erreur d'estimation */
  estimationError: string | null
}

/**
 * Hook pour estimer le prompt complet et la sélection GDD avec debounce automatique.
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
    promptTokenCount,
    setContextTokenEstimate,
  } = useGenerationStore()
  const applyOptimisticEntityRemovals = useGenerationStore((s) => s.applyOptimisticEntityRemovals)
  const applyOptimisticEntityAdditions = useGenerationStore((s) => s.applyOptimisticEntityAdditions)
  const applyBootstrapFromPrecomputed = useGenerationStore((s) => s.applyBootstrapFromPrecomputed)
  const setEntityTokenCache = useGenerationStore((s) => s.setEntityTokenCache)
  const prevSelectionsRef = useRef<ContextSelection | null>(null)
  const lastBootstrapFingerprintRef = useRef<string | null>(null)
  const lastEstimationConfigRef = useRef<string | null>(null)
  const bootstrapPromiseRef = useRef<Promise<boolean> | null>(null)
  const [contextConfigHydrated, setContextConfigHydrated] = useState(
    () => useContextConfigStore.persist.hasHydrated(),
  )

  useEffect(() => {
    if (useContextConfigStore.persist.hasHydrated()) {
      setContextConfigHydrated(true)
      return
    }
    return useContextConfigStore.persist.onFinishHydration(() => {
      setContextConfigHydrated(true)
    })
  }, [])

  const { vocabularyConfig } = useVocabularyStore()
  const { includeNarrativeGuides } = useNarrativeGuidesStore()
  const { authorProfile } = useAuthorProfile()
  const { buildContextSelections } = useGenerationRequest()

  const estimationConfigKey = useMemo(
    () =>
      JSON.stringify({
        organization,
        fieldConfigs,
        essentialFields,
        userInstructions,
        includeNarrativeGuides,
        systemPromptOverride,
        gameRules,
        authorProfile,
        vocabularyConfig,
      }),
    [
      organization,
      fieldConfigs,
      essentialFields,
      userInstructions,
      includeNarrativeGuides,
      systemPromptOverride,
      gameRules,
      authorProfile,
      vocabularyConfig,
    ],
  )

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

  const buildBootstrapInput = useCallback(
    (targetSelections: ContextSelection) => {
      const fieldConfigsWithEssential = buildFieldConfigsWithEssential()
      return {
        selections: targetSelections,
        organizationMode: organization,
        fieldConfigs:
          Object.keys(fieldConfigsWithEssential).length > 0
            ? fieldConfigsWithEssential
            : undefined,
        userInstructions: userInstructions.trim() || ' ',
        includeNarrativeGuides,
        systemPromptOverride,
        gameRules,
        authorProfile,
        vocabularyConfig: vocabularyConfig
          ? (vocabularyConfig as unknown as Record<string, string>)
          : null,
      }
    },
    [
      organization,
      userInstructions,
      includeNarrativeGuides,
      systemPromptOverride,
      gameRules,
      authorProfile,
      vocabularyConfig,
    ],
  )

  const bootstrapSelection = useCallback(
    async (targetSelections: ContextSelection): Promise<boolean> => {
      if (bootstrapPromiseRef.current) {
        return bootstrapPromiseRef.current
      }

      const expectedCount = listAllSelectionEntities(targetSelections).length
      if (expectedCount === 0) {
        return false
      }

      const run = async (): Promise<boolean> => {
        abortRef.current?.abort()
        const seq = requestSeqRef.current + 1
        requestSeqRef.current = seq
        const controller = new AbortController()
        abortRef.current = controller

        try {
          const result = await fetchPrecomputedBootstrap(
            buildBootstrapInput(targetSelections),
            controller.signal,
          )
          if (requestSeqRef.current !== seq) {
            return true
          }
          if (!isBootstrapComplete(result, expectedCount)) {
            return false
          }

          applyBootstrapFromPrecomputed(targetSelections, {
            entities: result.entities,
            overheadSections: result.overheadSections,
          })
          lastBootstrapFingerprintRef.current = result.fingerprint
          lastEstimationConfigRef.current = estimationConfigKey
          setEstimationError(null)
          return true
        } catch (err: unknown) {
          if (controller.signal.aborted || requestSeqRef.current !== seq) {
            return false
          }
          console.warn('Bootstrap précompilé échoué, repli estimate-tokens:', err)
          return false
        } finally {
          bootstrapPromiseRef.current = null
        }
      }

      bootstrapPromiseRef.current = run()
      return bootstrapPromiseRef.current
    },
    [applyBootstrapFromPrecomputed, buildBootstrapInput, estimationConfigKey],
  )

  const applyIncrementalAdditions = useCallback(
    async (additions: SelectionEntityDelta[]): Promise<boolean> => {
      abortRef.current?.abort()
      const seq = requestSeqRef.current + 1
      requestSeqRef.current = seq
      const controller = new AbortController()
      abortRef.current = controller

      const fieldConfigsWithEssential = buildFieldConfigsWithEssential()
      try {
        const response = await fetchPrecomputedEntityTokens(
          {
            entities: additions.map((a) => ({
              entity_type: a.entityType,
              name: a.name,
              mode: a.mode,
            })),
            organization_mode: organization,
            field_configs:
              Object.keys(fieldConfigsWithEssential).length > 0
                ? fieldConfigsWithEssential
                : undefined,
          },
          controller.signal,
        )
        if (requestSeqRef.current !== seq) {
          return true
        }

        applyOptimisticEntityAdditions(
          response.entities
            .filter((row) => row.context_item && row.token_count > 0)
            .map((row) => ({
              entityType: row.entity_type,
              name: row.name,
              mode: row.mode as 'full' | 'excerpt',
              token_count: row.token_count,
              // `context_item` est un Dict[str, Any] côté backend (api/schemas/dialogue.py) :
              // le filtre ci-dessus garantit sa présence, sa forme reste non typée à la frontière.
              context_item: row.context_item as unknown as import('../types/prompt').ContextItem,
            })),
          selections,
        )
        setEstimationError(null)
        return response.entities.every((row) => row.context_item && row.token_count > 0)
      } catch (err: unknown) {
        if (controller.signal.aborted || requestSeqRef.current !== seq) {
          return false
        }
        console.warn('Lookup tokens précompilés échoué, repli estimate-tokens:', err)
        return false
      }
    },
    [organization, applyOptimisticEntityAdditions, selections],
  )

  const estimateTokens = useCallback(async () => {
    const hasSystemPrompt = systemPromptOverride && systemPromptOverride.trim().length > 0
    if (!userInstructions.trim() && !hasSelections() && !hasSystemPrompt) {
      setEstimationError(null)
      setContextTokenEstimate({
        selectionTokens: null,
        promptTokenCount: null,
        isEstimating: false,
        previewInputHash: 'invalidate',
        contextEstimationError: null,
        contextTokenBreakdown: [],
        contextBreakdownNote: '',
        rawPrompt: null,
        structuredPrompt: null,
        promptHash: null,
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
    const { previewInputHash, tokenCount: currentTokenCount, promptTokenCount: currentPromptTokenCount } =
      useGenerationStore.getState()

    if (
      computedHash === previewInputHash &&
      currentTokenCount !== null &&
      currentPromptTokenCount !== null
    ) {
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
      promptTokenCount: currentPromptTokenCount,
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
      const entityCache = buildEntityTokenCacheFromStructuredPrompt(
        response.structured_prompt ?? null,
        contextSelections,
      )
      const entityItemsCache = buildEntityContextItemsFromStructuredPrompt(
        response.structured_prompt ?? null,
        contextSelections,
      )
      const promptOverhead = response.token_count - response.selection_tokens
      setEntityTokenCache(entityCache)
      setContextTokenEstimate({
        selectionTokens: response.selection_tokens,
        promptTokenCount: response.token_count,
        isEstimating: false,
        previewInputHash: computedHash,
        contextEstimationError: null,
        contextTokenBreakdown: response.context_token_breakdown,
        contextBreakdownNote: response.context_breakdown_note,
        structuredPrompt: response.structured_prompt ?? null,
        promptHash: response.prompt_hash ?? null,
        entityTokenByKey: entityCache,
        entityContextItemsByKey: entityItemsCache,
        promptOverheadTokens: promptOverhead,
      })
    } catch (err: unknown) {
      if (controller.signal.aborted || requestSeqRef.current !== seq) return
      const e = err as { code?: string; response?: { status?: number } } | null
      if (e?.code !== 'ERR_NETWORK' && e?.code !== 'ECONNREFUSED' && e?.response?.status !== 401) {
        console.error('Erreur lors de l\'estimation du prompt:', err)
        const errorMessage = getErrorMessage(err)
        setEstimationError(errorMessage)
        if (toast) {
          toast(errorMessage, 'error', 5000)
        }
      }
      const current = useGenerationStore.getState()
      setContextTokenEstimate({
        selectionTokens: current.tokenCount,
        promptTokenCount: current.promptTokenCount,
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
    setEntityTokenCache,
    systemPromptOverride,
    gameRules,
    vocabularyConfig,
    includeNarrativeGuides,
    sceneSelection.characterB,
    toast,
    choicesMode,
  ])

  useEffect(() => {
    if (!contextConfigHydrated) {
      return
    }

    const previousSelections = prevSelectionsRef.current ?? EMPTY_CONTEXT_SELECTION
    const removals = findRemovalsOnly(previousSelections, selections)
    const additions = findAdditionsOnly(previousSelections, selections)
    const currentFingerprint = selectionFingerprint(selections)
    prevSelectionsRef.current = selections

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

    if (removals && removals.length > 0) {
      abortRef.current?.abort()
      if (applyOptimisticEntityRemovals(removals, selections)) {
        lastBootstrapFingerprintRef.current = currentFingerprint
        return
      }
    }

    const alreadyBootstrapped =
      tokenCount != null && lastBootstrapFingerprintRef.current === currentFingerprint

    if (additions && additions.length === 1 && alreadyBootstrapped) {
      void (async () => {
        const ok = await applyIncrementalAdditions(additions)
        if (!ok) {
          const booted = await bootstrapSelection(selections)
          if (!booted) void estimateTokens()
        }
      })()
      return
    }

    if (hasAnySelections) {
      const configChanged = estimationConfigKey !== lastEstimationConfigRef.current
      const needsBootstrap =
        tokenCount == null ||
        lastBootstrapFingerprintRef.current !== currentFingerprint ||
        configChanged

      if (needsBootstrap) {
        void (async () => {
          const booted = await bootstrapSelection(selections)
          if (!booted) void estimateTokens()
        })()
        return
      }

      // Sélection inchangée (ex. hydratation fieldConfigs au lancement) : ne pas relancer estimate-tokens.
      return
    }

    setEstimationError(null)
    setContextTokenEstimate({
      selectionTokens: null,
      promptTokenCount: null,
      isEstimating: false,
      previewInputHash: 'invalidate',
      contextEstimationError: null,
      contextTokenBreakdown: [],
      contextBreakdownNote: '',
      rawPrompt: null,
      structuredPrompt: null,
      promptHash: null,
      entityTokenByKey: {},
      entityContextItemsByKey: {},
      promptOverheadTokens: null,
    })
    setEntityTokenCache({})
    lastBootstrapFingerprintRef.current = null
    lastEstimationConfigRef.current = null
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
    applyOptimisticEntityRemovals,
    applyIncrementalAdditions,
    bootstrapSelection,
    setEntityTokenCache,
    vocabularyConfig,
    includeNarrativeGuides,
    estimationConfigKey,
    tokenCount,
    contextConfigHydrated,
  ])

  return {
    estimateTokens,
    isEstimating,
    tokenCount,
    promptTokenCount,
    estimationError,
  }
}
