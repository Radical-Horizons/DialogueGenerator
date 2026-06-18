/**
 * Estimation debouncée des tokens de sélection GDD (POST /api/v1/context/estimate-tokens).
 * Utilisé par le panneau budget contexte (FR20).
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { estimateContextTokens } from '../api/context'
import { useContextStore } from '../store/contextStore'
import { useContextConfigStore } from '../store/contextConfigStore'
import { useGenerationStore } from '../store/generationStore'
import { useVocabularyStore } from '../store/vocabularyStore'
import { useNarrativeGuidesStore } from '../store/narrativeGuidesStore'
import { useFlagsStore } from '../store/flagsStore'
import { useAuthorProfile } from './useAuthorProfile'
import { useGenerationRequest } from './useGenerationRequest'
import { getErrorMessage } from '../types/errors'
import type { EstimateTokensRequest, EstimateTokensResponse } from '../types/api'

const DEBOUNCE_MS = 550

function buildFieldConfigsWithEssential(): Record<string, string[]> {
  const { fieldConfigs, essentialFields } = useContextConfigStore.getState()
  const out: Record<string, string[]> = {}
  for (const [elementType, fields] of Object.entries(fieldConfigs)) {
    const essential = essentialFields[elementType] || []
    out[elementType] = [...new Set([...essential, ...fields])]
  }
  return out
}

export interface UseContextSelectionTokenEstimateResult {
  data: EstimateTokensResponse | null
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
}

export function useContextSelectionTokenEstimate(): UseContextSelectionTokenEstimateResult {
  const { buildContextSelections } = useGenerationRequest()
  const selections = useContextStore((s) => s.selections)
  const organization = useContextConfigStore((s) => s.organization)
  const fieldConfigs = useContextConfigStore((s) => s.fieldConfigs)
  const essentialFields = useContextConfigStore((s) => s.essentialFields)
  const contextTokenBudgetMax = useContextConfigStore((s) => s.contextTokenBudgetMax)
  const generationUserInstructions = useGenerationStore((s) => s.generationUserInstructions)
  const sceneSelection = useGenerationStore((s) => s.sceneSelection)
  const systemPromptOverride = useGenerationStore((s) => s.systemPromptOverride)
  const gameRules = useGenerationStore((s) => s.gameRules)
  const vocabularyConfig = useVocabularyStore((s) => s.vocabularyConfig)
  const includeNarrativeGuides = useNarrativeGuidesStore((s) => s.includeNarrativeGuides)
  const { authorProfile } = useAuthorProfile()

  const [data, setData] = useState<EstimateTokensResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const requestSeqRef = useRef(0)
  const abortRef = useRef<AbortController | null>(null)

  const latestRef = useRef({
    organization,
    fieldConfigs,
    essentialFields,
    contextTokenBudgetMax,
    generationUserInstructions,
    sceneSelection,
    systemPromptOverride,
    gameRules,
    vocabularyConfig,
    includeNarrativeGuides,
    authorProfile,
  })
  latestRef.current = {
    organization,
    fieldConfigs,
    essentialFields,
    contextTokenBudgetMax,
    generationUserInstructions,
    sceneSelection,
    systemPromptOverride,
    gameRules,
    vocabularyConfig,
    includeNarrativeGuides,
    authorProfile,
  }

  const run = useCallback(async () => {
    const ctx = latestRef.current
    const contextSelections = buildContextSelections()
    const fieldConfigsWithEssential = buildFieldConfigsWithEssential()
    const inGameFlags = useFlagsStore.getState().getSelectedFlagsArray()
    const userInstructionsValue = ctx.generationUserInstructions.trim() || ' '

    const request: EstimateTokensRequest = {
      user_instructions: userInstructionsValue,
      context_selections: contextSelections,
      npc_speaker_id: ctx.sceneSelection.characterB || undefined,
      max_context_tokens: ctx.contextTokenBudgetMax,
      system_prompt_override: ctx.systemPromptOverride || undefined,
      game_rules: ctx.gameRules || undefined,
      author_profile: ctx.authorProfile || undefined,
      max_choices: null,
      choices_mode: 'free',
      narrative_tags: undefined,
      vocabulary_config: ctx.vocabularyConfig
        ? (ctx.vocabularyConfig as unknown as Record<string, string>)
        : undefined,
      include_narrative_guides: ctx.includeNarrativeGuides,
      previous_dialogue_preview: undefined,
      field_configs: Object.keys(fieldConfigsWithEssential).length > 0 ? fieldConfigsWithEssential : undefined,
      organization_mode: ctx.organization,
      in_game_flags: inGameFlags.length > 0 ? inGameFlags : undefined,
    }

    abortRef.current?.abort()
    const seq = requestSeqRef.current + 1
    requestSeqRef.current = seq
    const controller = new AbortController()
    abortRef.current = controller

    setLoading(true)
    setError(null)
    try {
      const res = await estimateContextTokens(request, controller.signal)
      if (requestSeqRef.current !== seq) return
      setData(res)
    } catch (e) {
      if (controller.signal.aborted || requestSeqRef.current !== seq) return
      setData(null)
      setError(getErrorMessage(e))
    } finally {
      if (requestSeqRef.current === seq) {
        setLoading(false)
      }
    }
  }, [buildContextSelections])

  useEffect(() => {
    const id = window.setTimeout(() => {
      void run()
    }, DEBOUNCE_MS)
    return () => {
      window.clearTimeout(id)
      abortRef.current?.abort()
    }
  }, [selections, organization, fieldConfigs, essentialFields, contextTokenBudgetMax, generationUserInstructions, sceneSelection, systemPromptOverride, gameRules, vocabularyConfig, includeNarrativeGuides, authorProfile, run])

  return { data, loading, error, refresh: run }
}
