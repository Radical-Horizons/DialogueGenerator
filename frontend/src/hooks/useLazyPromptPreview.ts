/**
 * Charge le prompt complet à la demande (POST /dialogues/preview-prompt).
 *
 * Ne lance pas preview-prompt tant que l'utilisateur est sur un autre onglet du panneau droit.
 */
import { useCallback, useEffect, useRef } from 'react'
import { previewPrompt } from '../api/dialogues'
import { useGenerationStore } from '../store/generationStore'
import { useContextStore } from '../store/contextStore'
import { useContextConfigStore } from '../store/contextConfigStore'
import { useVocabularyStore } from '../store/vocabularyStore'
import { useNarrativeGuidesStore } from '../store/narrativeGuidesStore'
import { useAuthorProfile } from './useAuthorProfile'
import { useGenerationRequest } from './useGenerationRequest'
import { computeStateHash } from '../utils/hashUtils'
import { buildPromptStateParams, buildTokenEstimateRequest } from '../utils/buildTokenEstimateRequest'

export interface UseLazyPromptPreviewOptions {
  /** Onglet Prompt visible dans le panneau droit. */
  enabled: boolean
}

export interface UseLazyPromptPreviewReturn {
  /** Déclenche POST /dialogues/preview-prompt (idempotent si hash inchangé). */
  requestPreview: () => Promise<void>
}

/** Preview prompt : chargement manuel, car le payload complet est lourd. */
export function useLazyPromptPreview(
  options: UseLazyPromptPreviewOptions
): UseLazyPromptPreviewReturn {
  const { enabled } = options

  const { selections } = useContextStore()
  const maxContextTokens = useContextConfigStore((s) => s.contextTokenBudgetMax)
  const {
    sceneSelection,
    systemPromptOverride,
    gameRules,
    rawPrompt,
    previewInputHash,
    generationUserInstructions,
    setRawPrompt,
  } = useGenerationStore()
  const { vocabularyConfig } = useVocabularyStore()
  const { includeNarrativeGuides } = useNarrativeGuidesStore()
  const { authorProfile } = useAuthorProfile()
  const { buildContextSelections } = useGenerationRequest()

  const seqRef = useRef(0)
  const abortRef = useRef<AbortController | null>(null)

  const requestPreview = useCallback(async () => {
    if (!enabled) return

    const userInstructions = generationUserInstructions
    const hasAnySelections =
      selections.characters_full.length > 0 ||
      selections.locations_full.length > 0 ||
      Boolean(sceneSelection.characterA || sceneSelection.characterB)
    const hasSystemPrompt = Boolean(systemPromptOverride?.trim())
    const hasCriteria = Boolean(userInstructions.trim() || hasAnySelections || hasSystemPrompt)
    if (!hasCriteria) return

    const contextSelections = buildContextSelections()
    const userInstructionsValue = userInstructions.trim() || ' '
    const params = buildPromptStateParams({
      userInstructions: userInstructionsValue,
      contextSelections,
      maxContextTokens,
      maxCompletionTokens: null,
      maxChoices: null,
      choicesMode: 'free',
      narrativeTags: [],
      systemPromptOverride,
      gameRules,
      authorProfile,
      vocabularyConfig: vocabularyConfig
        ? (vocabularyConfig as unknown as Record<string, string>)
        : null,
      includeNarrativeGuides,
      previousDialoguePreview: null,
      npcSpeakerId: sceneSelection.characterB,
    })

    const computedHash = await computeStateHash(params)
    if (computedHash === previewInputHash && rawPrompt != null) {
      return
    }

    abortRef.current?.abort()
    const seq = seqRef.current + 1
    seqRef.current = seq
    const controller = new AbortController()
    abortRef.current = controller

    const stateBefore = useGenerationStore.getState()
    setRawPrompt(
      stateBefore.rawPrompt,
      stateBefore.tokenCount,
      stateBefore.promptHash,
      true,
      stateBefore.structuredPrompt,
      'preserve'
    )

    try {
      const request = buildTokenEstimateRequest({
        userInstructions: userInstructionsValue,
        contextSelections,
        maxContextTokens,
        maxCompletionTokens: null,
        maxChoices: null,
        choicesMode: 'free',
        narrativeTags: [],
        systemPromptOverride,
        gameRules,
        authorProfile,
        vocabularyConfig: vocabularyConfig
          ? (vocabularyConfig as unknown as Record<string, string>)
          : null,
        includeNarrativeGuides,
        previousDialoguePreview: null,
        npcSpeakerId: sceneSelection.characterB,
      })

      const response = await previewPrompt(request)
      if (seqRef.current !== seq || controller.signal.aborted) return

      setRawPrompt(
        response.raw_prompt,
        useGenerationStore.getState().tokenCount,
        response.prompt_hash,
        false,
        response.structured_prompt ?? null,
        computedHash
      )
    } catch {
      if (seqRef.current !== seq) return
      const current = useGenerationStore.getState()
      setRawPrompt(
        current.rawPrompt,
        current.tokenCount,
        current.promptHash,
        false,
        current.structuredPrompt,
        'preserve'
      )
    }
  }, [
    generationUserInstructions,
    selections,
    maxContextTokens,
    sceneSelection,
    systemPromptOverride,
    gameRules,
    vocabularyConfig,
    includeNarrativeGuides,
    authorProfile,
    rawPrompt,
    previewInputHash,
    enabled,
    buildContextSelections,
    setRawPrompt,
  ])

  useEffect(() => {
    if (!enabled) {
      abortRef.current?.abort()
    }
  }, [enabled])

  return { requestPreview }
}
