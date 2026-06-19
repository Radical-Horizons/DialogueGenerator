import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useLazyPromptPreview } from './useLazyPromptPreview'
import * as dialoguesAPI from '../api/dialogues'
import { useGenerationStore } from '../store/generationStore'
import { useContextStore } from '../store/contextStore'

vi.mock('../api/dialogues', () => ({
  previewPrompt: vi.fn(),
}))

vi.mock('./useAuthorProfile', () => ({
  useAuthorProfile: () => ({ authorProfile: '' }),
}))

vi.mock('./useGenerationRequest', () => ({
  useGenerationRequest: () => ({
    buildContextSelections: () => ({
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
    }),
  }),
}))

describe('useLazyPromptPreview', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useGenerationStore.setState({
      rawPrompt: null,
      previewInputHash: null,
      generationUserInstructions: 'Test instructions',
      sceneSelection: { characterA: null, characterB: null, sceneRegion: null, subLocation: null },
      systemPromptOverride: null,
      gameRules: '',
      tokenCount: null,
      isEstimating: false,
      structuredPrompt: null,
      promptHash: null,
    })
    useContextStore.setState({
      selections: {
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
      },
    })
    vi.mocked(dialoguesAPI.previewPrompt).mockResolvedValue({
      raw_prompt: 'prompt xml',
      prompt_hash: 'hash-1',
      structured_prompt: null,
    })
  })

  it('ne charge pas automatiquement le prompt au mount', async () => {
    renderHook(() => useLazyPromptPreview({ enabled: true }))

    await new Promise((resolve) => setTimeout(resolve, 250))
    expect(dialoguesAPI.previewPrompt).not.toHaveBeenCalled()
  })

  it('charge le prompt sur demande explicite', async () => {
    const { result } = renderHook(() => useLazyPromptPreview({ enabled: true }))

    await act(async () => {
      await result.current.requestPreview()
    })

    await waitFor(() => {
      expect(dialoguesAPI.previewPrompt).toHaveBeenCalledTimes(1)
    })
  })

  it('ne charge pas le prompt tant que l’onglet Prompt est inactif', async () => {
    renderHook(() => useLazyPromptPreview({ enabled: false }))

    await new Promise((resolve) => setTimeout(resolve, 250))
    expect(dialoguesAPI.previewPrompt).not.toHaveBeenCalled()
  })
})
