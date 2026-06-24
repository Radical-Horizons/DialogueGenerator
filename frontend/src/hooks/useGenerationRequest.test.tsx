/**
 * Vérifie le mapping budget UI → payload génération (FR20 / Task 5 code-review).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useGenerationRequest } from './useGenerationRequest'
import type { LLMModelResponse } from '../types/api'

vi.mock('../store/contextStore', () => ({
  useContextStore: vi.fn(() => ({
    selections: {
      characters_full: ['Alice'],
      characters_excerpt: [],
      locations_full: [],
      locations_excerpt: [],
      items_full: [],
      items_excerpt: [],
      species_full: [],
      species_excerpt: [],
      communities_full: [],
      communities_excerpt: [],
    },
  })),
}))

vi.mock('../store/generationStore', () => ({
  useGenerationStore: vi.fn(() => ({
    sceneSelection: { characterA: 'Alice', characterB: null, sceneRegion: null, subLocation: null },
    dialogueStructure: ['PNJ', 'PJ', 'Stop', '', '', ''],
    systemPromptOverride: null,
  })),
}))

vi.mock('./useAuthorProfile', () => ({
  useAuthorProfile: () => ({ authorProfile: null }),
}))

vi.mock('../store/vocabularyStore', () => ({
  useVocabularyStore: vi.fn(() => ({ vocabularyConfig: null })),
}))

vi.mock('../store/narrativeGuidesStore', () => ({
  useNarrativeGuidesStore: vi.fn(() => ({ includeNarrativeGuides: false })),
}))

vi.mock('../store/flagsStore', () => ({
  useFlagsStore: {
    getState: () => ({ getSelectedFlagsArray: () => [] }),
  },
}))

vi.mock('../store/contextConfigStore', () => ({
  useContextConfigStore: {
    getState: () => ({
      fieldConfigs: {},
      essentialFields: {},
      organization: 'narrative' as const,
    }),
  },
}))

const models: LLMModelResponse[] = [
  {
    model_identifier: 'gpt-5.2',
    display_name: 'GPT-5.2',
    client_type: 'openai',
    max_tokens: 128_000,
  },
  {
    model_identifier: 'gpt-test',
    display_name: 'Test',
    client_type: 'openai',
    max_tokens: 128_000,
  },
]

const baseParams = {
  userInstructions: 'Hello',
  maxCompletionTokens: null as number | null,
  llmModel: 'gpt-test',
  reasoningEffort: null,
  topP: null as number | null,
  maxChoices: null as number | null,
  choicesMode: 'free' as const,
  narrativeTags: [] as string[],
  previousDialoguePreview: null as string | null,
  availableModels: models,
}

describe('useGenerationRequest', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('mappe maxContextTokens vers max_context_tokens du payload (aligné budget contexte)', () => {
    const { result } = renderHook(() => useGenerationRequest())
    const req = result.current.buildGenerationRequest({
      ...baseParams,
      maxContextTokens: 42_000,
    })
    expect(req.max_context_tokens).toBe(42_000)
    expect(req.llm_model_identifier).toBe('gpt-5.2')
  })

  it('reflète une réduction de plafond dans le payload (cohérence estimation vs build)', () => {
    const { result } = renderHook(() => useGenerationRequest())
    const req = result.current.buildGenerationRequest({
      ...baseParams,
      maxContextTokens: 12_000,
    })
    expect(req.max_context_tokens).toBe(12_000)
  })
})
