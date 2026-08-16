import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import { usePresetManagement } from '../hooks/usePresetManagement'
import type { Template } from '../types/template'
import type { PresetValidationResult } from '../types/preset'

const mocks = vi.hoisted(() => ({
  getTemplateApi: vi.fn(),
  validateTemplateApi: vi.fn(),
  recordSuggestionUsedApi: vi.fn(),
  copyMarketplaceListingApi: vi.fn(),
  setSceneSelection: vi.fn(),
  setProvider: vi.fn(),
  setModel: vi.fn(),
  restoreState: vi.fn(),
  clearSelections: vi.fn(),
  toggleCharacter: vi.fn(),
  setRegion: vi.fn(),
  toggleSubLocation: vi.fn(),
  setContextDroppingRulesOverlay: vi.fn(),
  setAppliedTemplate: vi.fn(),
  clearTemplateSession: vi.fn(),
}))

vi.mock('../api/templates', () => ({
  getTemplateApi: mocks.getTemplateApi,
  validateTemplateApi: mocks.validateTemplateApi,
  recordSuggestionUsedApi: mocks.recordSuggestionUsedApi,
  copyMarketplaceListingApi: mocks.copyMarketplaceListingApi,
}))

vi.mock('../store/generationStore', () => ({
  useGenerationStore: Object.assign(
    () => ({
      sceneSelection: {
        characterA: null,
        characterB: null,
        sceneRegion: null,
        subLocation: null,
      },
      setSceneSelection: mocks.setSceneSelection,
    }),
    {
      getState: () => ({
        setContextDroppingRulesOverlay: mocks.setContextDroppingRulesOverlay,
        setAppliedTemplate: mocks.setAppliedTemplate,
        clearTemplateSession: mocks.clearTemplateSession,
        contextDroppingRulesOverlay: null,
      }),
    },
  ),
}))

vi.mock('../store/presetStore', () => ({
  usePresetStore: {
    getState: () => ({
      validatePreset: vi.fn(),
    }),
  },
}))

vi.mock('../store/contextStore', () => ({
  useContextStore: {
    getState: () => ({
      restoreState: mocks.restoreState,
      clearSelections: mocks.clearSelections,
      toggleCharacter: mocks.toggleCharacter,
      setRegion: mocks.setRegion,
      toggleSubLocation: mocks.toggleSubLocation,
      selections: {},
      selectedRegion: null,
      selectedSubLocations: [],
    }),
  },
}))

vi.mock('../store/llmStore', () => ({
  useLLMStore: {
    getState: () => ({
      setProvider: mocks.setProvider,
      setModel: mocks.setModel,
    }),
  },
}))

const sampleTemplate: Template = {
  id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
  name: 'Salut',
  description: '',
  category: 'Salutation',
  icon: '👋',
  metadata: { created: '2026-08-16T10:00:00Z', modified: '2026-08-16T10:00:00Z' },
  configuration: {
    characters: ['char-alpha', 'char-ghost'],
    locations: ['loc-alpha'],
    region: 'loc-alpha',
    sceneType: 'Generic',
    instructions: 'Brief snapshot',
    llmModel: 'gpt-5.6-terra',
    llmProvider: 'mistral',
    contextSelections: {
      characters_full: ['char-alpha', 'char-ghost'],
      characters_excerpt: [],
      locations_full: ['loc-alpha'],
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
  },
}

const validValidation: PresetValidationResult = {
  valid: true,
  warnings: [],
  obsoleteRefs: [],
}

const obsoleteValidation: PresetValidationResult = {
  valid: false,
  warnings: ["Character 'char-ghost' not found in GDD"],
  obsoleteRefs: ['char-ghost'],
}

describe('usePresetManagement — templates [6.3]', () => {
  const setUserInstructions = vi.fn()
  const setIsDirty = vi.fn()
  const setSaveStatus = vi.fn()
  const toast = vi.fn()
  const setLlmModel = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getTemplateApi.mockResolvedValue(sampleTemplate)
    mocks.validateTemplateApi.mockResolvedValue(validValidation)
    mocks.recordSuggestionUsedApi.mockResolvedValue({
      source: 'custom',
      id: 'tpl-1',
      useCount: 1,
    })
  })

  function renderManagement() {
    return renderHook(() =>
      usePresetManagement({
        userInstructions: 'Ancien brief',
        setUserInstructions,
        setIsDirty,
        setSaveStatus,
        toast,
        setLlmModel,
      }),
    )
  }

  it('applique instructions, modèle et provider si validate OK', async () => {
    const { result } = renderManagement()

    await act(async () => {
      await result.current.handleTemplateLoaded(sampleTemplate)
    })

    expect(mocks.getTemplateApi).toHaveBeenCalledWith(sampleTemplate.id)
    expect(mocks.validateTemplateApi).toHaveBeenCalledWith(sampleTemplate.id)
    expect(setUserInstructions).toHaveBeenCalledWith('Brief snapshot')
    expect(setLlmModel).toHaveBeenCalledWith('gpt-5.6-terra')
    expect(mocks.setProvider).toHaveBeenCalledWith('mistral')
    expect(mocks.setModel).toHaveBeenCalledWith('gpt-5.6-terra')
    expect(mocks.setContextDroppingRulesOverlay).toHaveBeenCalledWith(null)
    expect(mocks.setAppliedTemplate).toHaveBeenCalledWith(sampleTemplate.id, sampleTemplate.name)
    expect(toast).toHaveBeenCalledWith('Template chargé avec succès', 'success')
    expect(result.current.isValidationModalOpen).toBe(false)
    expect(mocks.recordSuggestionUsedApi).toHaveBeenCalledWith('custom', sampleTemplate.id)
  })

  it('ouvre le modal et n’applique pas si GDD obsolète', async () => {
    mocks.validateTemplateApi.mockResolvedValue(obsoleteValidation)
    const { result } = renderManagement()

    await act(async () => {
      await result.current.handleTemplateLoaded(sampleTemplate)
    })

    expect(setUserInstructions).not.toHaveBeenCalled()
    expect(mocks.setProvider).not.toHaveBeenCalled()
    expect(result.current.isValidationModalOpen).toBe(true)
    expect(result.current.validationEntityLabel).toBe('template')
    expect(result.current.validationResult).toEqual(obsoleteValidation)
    expect(mocks.recordSuggestionUsedApi).not.toHaveBeenCalled()
  })

  it('Annuler laisse le formulaire inchangé', async () => {
    mocks.validateTemplateApi.mockResolvedValue(obsoleteValidation)
    const { result } = renderManagement()

    await act(async () => {
      await result.current.handleTemplateLoaded(sampleTemplate)
    })
    act(() => {
      result.current.handleValidationClose()
    })

    expect(setUserInstructions).not.toHaveBeenCalled()
    expect(result.current.isValidationModalOpen).toBe(false)
    expect(result.current.validationResult).toBeNull()
  })

  it('Charger quand même omet les IDs cassés', async () => {
    mocks.validateTemplateApi.mockResolvedValue(obsoleteValidation)
    const { result } = renderManagement()

    await act(async () => {
      await result.current.handleTemplateLoaded(sampleTemplate)
    })
    act(() => {
      result.current.handleValidationConfirm()
    })

    expect(setUserInstructions).toHaveBeenCalledWith('Brief snapshot')
    expect(mocks.restoreState).toHaveBeenCalled()
    const restoredSelections = mocks.restoreState.mock.calls[0][0] as {
      characters_full: string[]
    }
    expect(restoredSelections.characters_full).toEqual(['char-alpha'])
    expect(mocks.toggleCharacter).not.toHaveBeenCalled()
    expect(mocks.setProvider).toHaveBeenCalledWith('mistral')
    expect(mocks.setModel).toHaveBeenCalledWith('gpt-5.6-terra')
    expect(toast).toHaveBeenCalledWith(
      'Template chargé avec 1 référence(s) obsolète(s) ignorée(s)',
      'warning',
    )
    expect(mocks.recordSuggestionUsedApi).toHaveBeenCalledWith('custom', sampleTemplate.id)
  })

  it('toast erreur si GET 404', async () => {
    mocks.getTemplateApi.mockRejectedValue({
      response: { data: { detail: 'Template not found' } },
    })
    const { result } = renderManagement()
    let loaded = true

    await act(async () => {
      loaded = await result.current.handleTemplateLoaded(sampleTemplate)
    })

    expect(loaded).toBe(false)
    expect(mocks.validateTemplateApi).not.toHaveBeenCalled()
    expect(setUserInstructions).not.toHaveBeenCalled()
    expect(mocks.recordSuggestionUsedApi).not.toHaveBeenCalled()
    await waitFor(() => {
      expect(toast).toHaveBeenCalledWith(
        expect.stringMatching(/Erreur lors du chargement du template/),
        'error',
      )
    })
  })

  it('applique le snapshot GET, pas la carte stale', async () => {
    mocks.getTemplateApi.mockResolvedValue({
      ...sampleTemplate,
      configuration: {
        ...sampleTemplate.configuration,
        instructions: 'Brief disque',
        characters: ['char-alpha'],
      },
    })
    const staleCard: Template = {
      ...sampleTemplate,
      configuration: {
        ...sampleTemplate.configuration,
        instructions: 'Brief carte périmé',
      },
    }
    const { result } = renderManagement()

    await act(async () => {
      await result.current.handleTemplateLoaded(staleCard)
    })

    expect(setUserInstructions).toHaveBeenCalledWith('Brief disque')
    expect(setUserInstructions).not.toHaveBeenCalledWith('Brief carte périmé')
  })

  it('ignore la réponse GET d’un clic précédent', async () => {
    let resolveFirst: ((value: Template) => void) | undefined
    mocks.getTemplateApi.mockImplementationOnce(
      () =>
        new Promise<Template>((resolve) => {
          resolveFirst = resolve
        }),
    )
    mocks.getTemplateApi.mockResolvedValueOnce({
      ...sampleTemplate,
      configuration: { ...sampleTemplate.configuration, instructions: 'Brief B' },
    })
    const { result } = renderManagement()

    let firstClick: Promise<boolean> | undefined
    act(() => {
      firstClick = result.current.handleTemplateLoaded({
        ...sampleTemplate,
        configuration: { ...sampleTemplate.configuration, instructions: 'Brief A' },
      })
    })
    await act(async () => {
      await result.current.handleTemplateLoaded({
        ...sampleTemplate,
        configuration: { ...sampleTemplate.configuration, instructions: 'Brief B' },
      })
    })
    await act(async () => {
      resolveFirst?.({
        ...sampleTemplate,
        configuration: { ...sampleTemplate.configuration, instructions: 'Brief A' },
      })
      await firstClick
    })

    expect(setUserInstructions).toHaveBeenCalledWith('Brief B')
    expect(setUserInstructions).not.toHaveBeenCalledWith('Brief A')
  })

  it('handlePrebuiltLoaded hydrate le brief sans GET UUID', () => {
    const { result } = renderManagement()
    const prebuilt = {
      id: 'confrontation',
      name: 'Confrontation',
      description: '',
      category: 'Confrontation',
      icon: '⚔️',
      gddSystem: 'Skill check',
      sceneTypeHint: 'confrontation',
      objectif: '',
      casUsage: '',
      examples: [],
      addedAt: '2026-08-16T00:00:00Z',
      configuration: {
        characters: [],
        locations: [],
        region: '',
        sceneType: 'Generic',
        instructions: 'Brief pré-built confrontation',
      },
    }

    act(() => {
      result.current.handlePrebuiltLoaded(prebuilt)
    })

    expect(mocks.getTemplateApi).not.toHaveBeenCalled()
    expect(setUserInstructions).toHaveBeenCalledWith('Brief pré-built confrontation')
    expect(toast).toHaveBeenCalledWith('Template chargé avec succès', 'success')
  })

  it('handlePrebuiltLoaded ignore un GET custom encore en vol', async () => {
    let resolveCustom: ((value: Template) => void) | undefined
    mocks.getTemplateApi.mockImplementationOnce(
      () =>
        new Promise<Template>((resolve) => {
          resolveCustom = resolve
        }),
    )
    const { result } = renderManagement()
    const prebuilt = {
      id: 'confrontation',
      name: 'Confrontation',
      description: '',
      category: 'Confrontation',
      icon: '⚔️',
      gddSystem: 'Skill check',
      sceneTypeHint: 'confrontation',
      objectif: '',
      casUsage: '',
      examples: [],
      addedAt: '2026-08-16T00:00:00Z',
      configuration: {
        characters: [],
        locations: [],
        region: '',
        sceneType: 'Generic',
        instructions: 'Brief pré-built confrontation',
      },
    }

    let customClick: Promise<boolean> | undefined
    act(() => {
      customClick = result.current.handleTemplateLoaded(sampleTemplate)
    })
    act(() => {
      result.current.handlePrebuiltLoaded(prebuilt)
    })
    await act(async () => {
      resolveCustom?.(sampleTemplate)
      await customClick
    })

    expect(setUserInstructions).toHaveBeenCalledWith('Brief pré-built confrontation')
    expect(setUserInstructions).not.toHaveBeenCalledWith('Brief snapshot')
  })

  it('applique la température snapshotée si le setter est fourni', async () => {
    const setTemperature = vi.fn()
    const withTemp = {
      ...sampleTemplate,
      configuration: { ...sampleTemplate.configuration, temperature: 0.4 },
    }
    mocks.getTemplateApi.mockResolvedValue(withTemp)
    const { result } = renderHook(() =>
      usePresetManagement({
        userInstructions: 'Ancien brief',
        setUserInstructions,
        setIsDirty,
        setSaveStatus,
        toast,
        setLlmModel,
        setTemperature,
      }),
    )

    await act(async () => {
      await result.current.handleTemplateLoaded(withTemp)
    })

    expect(setTemperature).toHaveBeenCalledWith(0.4)
  })

  it('pose l’overlay session si le template a des règles anti-drop', async () => {
    const rules = {
      rules_profile: 'strict' as const,
      tolerance: null,
      mandatory_info: [],
      dialogue_type_overrides: {},
      schema_version: '1.0',
    }
    const withRules = {
      ...sampleTemplate,
      configuration: { ...sampleTemplate.configuration, contextDroppingRules: rules },
    }
    mocks.getTemplateApi.mockResolvedValue(withRules)
    const { result } = renderManagement()

    await act(async () => {
      await result.current.handleTemplateLoaded(withRules)
    })

    expect(mocks.setContextDroppingRulesOverlay).toHaveBeenCalledWith(rules)
  })

  it('handlePrebuiltLoaded pose l’overlay strict de Confrontation', () => {
    const rules = {
      rules_profile: 'strict' as const,
      tolerance: null,
      mandatory_info: [],
      dialogue_type_overrides: {},
      schema_version: '1.0',
    }
    const { result } = renderManagement()
    const prebuilt = {
      id: 'confrontation',
      name: 'Confrontation',
      description: '',
      category: 'Confrontation',
      icon: '⚔️',
      gddSystem: 'Skill check',
      sceneTypeHint: 'confrontation',
      objectif: '',
      casUsage: '',
      examples: [],
      addedAt: '2026-08-16T00:00:00Z',
      configuration: {
        characters: [],
        locations: [],
        region: '',
        sceneType: 'Generic',
        instructions: 'Brief pré-built confrontation',
        contextDroppingRules: rules,
      },
    }

    act(() => {
      result.current.handlePrebuiltLoaded(prebuilt)
    })

    expect(mocks.setContextDroppingRulesOverlay).toHaveBeenCalledWith(rules)
    expect(mocks.setAppliedTemplate).toHaveBeenCalledWith('confrontation', 'Confrontation')
  })

  it('handleSuggestionLoaded marketplace applique sans GET /use', async () => {
    mocks.recordSuggestionUsedApi.mockResolvedValue({
      source: 'marketplace',
      id: 'listing-1',
      useCount: 1,
    })
    const { result } = renderManagement()
    await act(async () => {
      await result.current.handleSuggestionLoaded({
        source: 'marketplace',
        id: 'listing-1',
        name: 'Listing public',
        description: '',
        category: 'Confrontation',
        icon: '⚔️',
        score: 40,
        reasons: ['Correspond aux mots-clés du brief'],
        configuration: {
          characters: ['char-alpha'],
          locations: [],
          region: '',
          sceneType: 'Generic',
          instructions: 'Brief listing',
        },
      })
    })
    expect(mocks.getTemplateApi).not.toHaveBeenCalled()
    expect(mocks.setAppliedTemplate).toHaveBeenCalledWith('listing-1', 'Listing public')
    expect(mocks.recordSuggestionUsedApi).toHaveBeenCalledWith('marketplace', 'listing-1')
    expect(mocks.copyMarketplaceListingApi).not.toHaveBeenCalled()
  })

  it('handleSuggestionLoaded custom 404 relance l’erreur', async () => {
    mocks.getTemplateApi.mockRejectedValue({
      response: { data: { detail: 'Template not found' } },
    })
    const { result } = renderManagement()
    await act(async () => {
      await expect(
        result.current.handleSuggestionLoaded({
          source: 'custom',
          id: sampleTemplate.id,
          name: sampleTemplate.name,
          description: '',
          category: 'Salutation',
          icon: '👋',
          score: 20,
          reasons: [],
          configuration: sampleTemplate.configuration,
        }),
      ).rejects.toThrow('load-failed')
    })
    expect(mocks.recordSuggestionUsedApi).not.toHaveBeenCalled()
  })
})
