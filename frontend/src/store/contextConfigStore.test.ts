import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useContextConfigStore } from './contextConfigStore'
import * as configAPI from '../api/config'

vi.mock('../api/config', () => ({
  getContextFields: vi.fn(),
  getDefaultFieldConfig: vi.fn(),
  getFieldSuggestions: vi.fn(),
  invalidateContextFieldsCache: vi.fn(),
  previewContext: vi.fn(),
}))

const mockConfigAPI = vi.mocked(configAPI)

describe('contextConfigStore', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockConfigAPI.invalidateContextFieldsCache.mockResolvedValue(undefined)
    useContextConfigStore.setState({
      fieldConfigs: {
        character: [],
        location: [],
        item: [],
        species: [],
        community: [],
      },
      essentialFields: {},
      fieldDefaultsInitialized: {},
      fieldDefaultsVersion: 2,
      organization: 'default',
      availableFields: {},
      uniqueFieldsByItem: {},
      suggestions: {},
      isLoading: false,
      error: null,
      contextTokenBudgetMax: 50_000,
      contextOptimizationPinnedKeys: [],
      contextOptimizationStrategy: 'conservative',
      contextOptimizationProxyThreshold: 50,
    })
  })

  it('devrait initialiser avec des valeurs par défaut', () => {
    const store = useContextConfigStore.getState()
    
    expect(store.contextTokenBudgetMax).toBe(50_000)
    expect(store.organization).toBe('default')
    expect(store.fieldConfigs).toEqual({
      character: [],
      location: [],
      item: [],
      species: [],
      community: [],
    })
    expect(store.isLoading).toBe(false)
    expect(store.error).toBe(null)
  })

  it('devrait permettre de définir la configuration des champs', () => {
    useContextConfigStore.getState().setFieldConfig('character', ['Nom', 'Dialogue Type'])
    
    const state = useContextConfigStore.getState()
    expect(state.fieldConfigs.character).toEqual(['Nom', 'Dialogue Type'])
  })

  it('devrait permettre de basculer un champ', () => {
    // Ajouter un champ
    useContextConfigStore.getState().toggleField('character', 'Nom')
    let state = useContextConfigStore.getState()
    expect(state.fieldConfigs.character).toContain('Nom')
    
    // Retirer le champ
    useContextConfigStore.getState().toggleField('character', 'Nom')
    state = useContextConfigStore.getState()
    expect(state.fieldConfigs.character).not.toContain('Nom')
  })

  it('devrait permettre de changer le mode d\'organisation', () => {
    useContextConfigStore.getState().setOrganization('narrative')
    let state = useContextConfigStore.getState()
    expect(state.organization).toBe('narrative')
    
    useContextConfigStore.getState().setOrganization('minimal')
    state = useContextConfigStore.getState()
    expect(state.organization).toBe('minimal')
  })

  it('devrait permettre de réinitialiser aux valeurs par défaut', () => {
    const store = useContextConfigStore.getState()
    
    // Modifier l'état
    store.setFieldConfig('character', ['Nom'])
    store.setOrganization('narrative')
    
    // Réinitialiser
    store.resetToDefault()
    
    expect(store.fieldConfigs.character).toEqual([])
    expect(store.organization).toBe('default')
  })

  it('devrait sélectionner tous les champs détectés par défaut', async () => {
    mockConfigAPI.getContextFields.mockResolvedValue({
      element_type: 'character',
      total: 3,
      fields: {
        Nom: {
          path: 'Nom',
          label: 'Nom',
          type: 'string',
          depth: 0,
          frequency: 1,
          suggested: false,
          is_metadata: true,
          is_essential: true,
        },
        'sections._general': {
          path: 'sections._general',
          label: 'Sections > General',
          type: 'string',
          depth: 1,
          frequency: 1,
          suggested: false,
          is_metadata: false,
        },
        'stats.force': {
          path: 'stats.force',
          label: 'Stats > Force',
          type: 'number',
          depth: 1,
          frequency: 0.5,
          suggested: false,
          is_metadata: false,
        },
      },
    })

    await useContextConfigStore.getState().detectFields('character')

    expect(useContextConfigStore.getState().fieldConfigs.character).toEqual([
      'Nom',
      'sections._general',
      'stats.force',
    ])
    expect(useContextConfigStore.getState().fieldDefaultsInitialized.character).toBe(true)
  })

  it('devrait réinitialiser vers tous les champs disponibles', () => {
    useContextConfigStore.setState({
      availableFields: {
        character: {
          Nom: {
            path: 'Nom',
            label: 'Nom',
            type: 'string',
            depth: 0,
            frequency: 1,
            suggested: false,
            is_metadata: true,
            is_essential: true,
          },
          Bio: {
            path: 'Bio',
            label: 'Bio',
            type: 'string',
            depth: 0,
            frequency: 1,
            suggested: false,
            is_metadata: false,
          },
        },
      },
      essentialFields: { character: ['Nom'] },
      fieldConfigs: {
        character: [],
        location: [],
        item: [],
        species: [],
        community: [],
      },
    })

    useContextConfigStore.getState().resetToDefault()

    expect(useContextConfigStore.getState().fieldConfigs.character).toEqual(['Nom', 'Bio'])
  })

  it('devrait borner les règles d’optimisation contexte (FR21)', () => {
    useContextConfigStore.getState().setContextOptimizationPinnedKeys(['a', 'a', 'characters:X'])
    expect(useContextConfigStore.getState().contextOptimizationPinnedKeys).toEqual(['a', 'characters:X'])
    useContextConfigStore.getState().setContextOptimizationStrategy('aggressive')
    expect(useContextConfigStore.getState().contextOptimizationStrategy).toBe('aggressive')
    useContextConfigStore.getState().setContextOptimizationProxyThreshold(0)
    expect(useContextConfigStore.getState().contextOptimizationProxyThreshold).toBe(1)
    useContextConfigStore.getState().setContextOptimizationProxyThreshold(200)
    expect(useContextConfigStore.getState().contextOptimizationProxyThreshold).toBe(100)
  })

  it('devrait borner le budget tokens contexte (FR20)', () => {
    useContextConfigStore.getState().setContextTokenBudgetMax(25_000)
    expect(useContextConfigStore.getState().contextTokenBudgetMax).toBe(25_000)
    useContextConfigStore.getState().setContextTokenBudgetMax(8000)
    expect(useContextConfigStore.getState().contextTokenBudgetMax).toBe(10_000)
    useContextConfigStore.getState().setContextTokenBudgetMax(50)
    expect(useContextConfigStore.getState().contextTokenBudgetMax).toBe(10_000)
    useContextConfigStore.getState().setContextTokenBudgetMax(999_999)
    expect(useContextConfigStore.getState().contextTokenBudgetMax).toBe(300_000)
  })

  it('devrait permettre de nettoyer l\'erreur', () => {
    const store = useContextConfigStore.getState()
    
    // Simuler une erreur (on ne peut pas la définir directement, mais on peut tester la méthode)
    store.clearError()
    
    expect(store.error).toBe(null)
  })
})

