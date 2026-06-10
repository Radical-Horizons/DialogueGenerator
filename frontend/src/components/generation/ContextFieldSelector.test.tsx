import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ContextFieldSelector } from './ContextFieldSelector'
import { fieldPathTreeHierarchy } from './fieldPathTreeHierarchy'
import { useContextConfigStore } from '../../store/contextConfigStore'

// Mock du store
vi.mock('../../store/contextConfigStore', () => ({
  useContextConfigStore: vi.fn(),
}))

const mockUseContextConfigStore = vi.mocked(useContextConfigStore)

describe('fieldPathTreeHierarchy', () => {
  it('sections._general.slug : une seule feuille à la racine (pas de dossier Sections)', () => {
    expect(fieldPathTreeHierarchy('sections._general.preamble')).toEqual({
      displayParts: ['preamble'],
      mapKeys: ['sections._general.preamble'],
    })
  })

  it('conserve sections._general (monolithe) en deux segments', () => {
    expect(fieldPathTreeHierarchy('sections._general')).toEqual({
      displayParts: ['sections', '_general'],
      mapKeys: ['sections', 'sections._general'],
    })
  })

  it('chemins sans sections._general inchangés', () => {
    expect(fieldPathTreeHierarchy('Background.Histoire')).toEqual({
      displayParts: ['Background', 'Histoire'],
      mapKeys: ['Background', 'Background.Histoire'],
    })
  })
})

describe('ContextFieldSelector', () => {
  const mockDetectFields = vi.fn(() => Promise.resolve())
  const mockToggleField = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    
    mockUseContextConfigStore.mockReturnValue({
      availableFields: {
        character: {
          'Nom': {
            path: 'Nom',
            label: 'Nom',
            type: 'string',
            depth: 0,
            frequency: 1.0,
            suggested: false,
            category: 'identity',
            importance: 'essential',
          },
          'Dialogue Type': {
            path: 'Dialogue Type',
            label: 'Dialogue Type',
            type: 'dict',
            depth: 0,
            frequency: 0.8,
            suggested: true,
            category: 'voice',
            importance: 'essential',
          },
        },
      },
      uniqueFieldsByItem: {},
      fieldConfigs: {
        character: ['Nom'],
      },
      suggestions: {
        character: ['Dialogue Type'],
      },
      toggleField: mockToggleField,
      detectFields: mockDetectFields,
      isLoading: false,
      error: null,
    } as ReturnType<typeof useContextConfigStore>)
  })

  it('devrait afficher un message de chargement quand isLoading est true', () => {
    const defaultReturn = {
      availableFields: { character: {} },
      uniqueFieldsByItem: {},
      fieldConfigs: { character: [] },
      suggestions: { character: [] },
      toggleField: mockToggleField,
      detectFields: mockDetectFields,
      isLoading: false,
      error: null,
    }
    mockUseContextConfigStore.mockReturnValue({
      ...defaultReturn,
      isLoading: true,
    } as ReturnType<typeof useContextConfigStore>)

    render(<ContextFieldSelector elementType="character" />)
    
    expect(screen.getByText(/détection des champs en cours/i)).toBeInTheDocument()
  })

  it('devrait afficher une erreur quand error est défini', () => {
    const defaultReturn = {
      availableFields: { character: {} },
      uniqueFieldsByItem: {},
      fieldConfigs: { character: [] },
      suggestions: { character: [] },
      toggleField: mockToggleField,
      detectFields: mockDetectFields,
      isLoading: false,
      error: null,
    }
    mockUseContextConfigStore.mockReturnValue({
      ...defaultReturn,
      error: 'Erreur de test',
    } as ReturnType<typeof useContextConfigStore>)

    render(<ContextFieldSelector elementType="character" />)
    
    expect(screen.getByText(/erreur: erreur de test/i)).toBeInTheDocument()
  })

  it('devrait appeler detectFields au montage si aucun champ n\'est disponible', async () => {
    const mockDetectFieldsWithPromise = vi.fn(() => Promise.resolve())

    const defaultReturn = {
      availableFields: { character: {} },
      uniqueFieldsByItem: {},
      fieldConfigs: { character: [] },
      suggestions: { character: [] },
      toggleField: mockToggleField,
      detectFields: mockDetectFields,
      isLoading: false,
      error: null,
    }
    mockUseContextConfigStore.mockReturnValue({
      ...defaultReturn,
      availableFields: {
        character: {},
      },
      detectFields: mockDetectFieldsWithPromise,
    } as ReturnType<typeof useContextConfigStore>)

    render(<ContextFieldSelector elementType="character" />)
    
    await waitFor(() => {
      expect(mockDetectFieldsWithPromise).toHaveBeenCalledWith('character')
    })
  })

  it('devrait afficher les champs disponibles', () => {
    render(<ContextFieldSelector elementType="character" />)
    
    expect(screen.getByText(/nom/i)).toBeInTheDocument()
    expect(screen.getByText(/dialogue type/i)).toBeInTheDocument()
  })

  it('devrait permettre de rechercher des champs', async () => {
    const user = userEvent.setup()
    render(<ContextFieldSelector elementType="character" />)
    
    const searchInput = screen.getByPlaceholderText(/rechercher un champ/i)
    await user.type(searchInput, 'Nom')
    
    // Le champ "Nom" devrait être visible, "Dialogue Type" ne devrait pas l'être
    expect(screen.getByText(/nom/i)).toBeInTheDocument()
  })

  it('sections._general.* : pas de groupe Sections, champs visibles à la racine', () => {
    mockUseContextConfigStore.mockReturnValue({
      availableFields: {
        location: {
          'sections._general.preamble': {
            path: 'sections._general.preamble',
            label: 'Sections > Préambule',
            type: 'string',
            depth: 3,
            frequency: 1,
            suggested: false,
            is_metadata: false,
            is_unique: false,
          },
          'sections._general.surface': {
            path: 'sections._general.surface',
            label: 'Sections > [Surface]',
            type: 'string',
            depth: 3,
            frequency: 1,
            suggested: false,
            is_metadata: false,
            is_unique: false,
          },
        },
      },
      uniqueFieldsByItem: {},
      fieldConfigs: { location: [] },
      suggestions: { location: [] },
      toggleField: mockToggleField,
      detectFields: mockDetectFields,
      isLoading: false,
      error: null,
    } as ReturnType<typeof useContextConfigStore>)

    render(<ContextFieldSelector elementType="location" showOnlyEssential={false} />)

    expect(screen.queryByText(/^Sections$/)).not.toBeInTheDocument()
    expect(screen.queryByText(/^General$/)).not.toBeInTheDocument()
    expect(screen.getByText(/préambule/i)).toBeInTheDocument()
    expect(screen.getByText(/\[Surface\]/)).toBeInTheDocument()
  })

  it('affiche tous les champs cochés par défaut dans Contexte et Métadonnées', () => {
    mockUseContextConfigStore.mockReturnValue({
      availableFields: {
        character: {
          Nom: {
            path: 'Nom',
            label: 'Nom',
            type: 'string',
            depth: 0,
            frequency: 1,
            suggested: false,
            is_metadata: 'true',
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
          Motivation: {
            path: 'Motivation',
            label: 'Motivation',
            type: 'string',
            depth: 0,
            frequency: 1,
            suggested: false,
            is_metadata: false,
          },
        },
      },
      uniqueFieldsByItem: {},
      fieldConfigs: { character: ['Nom', 'sections._general', 'Motivation'] },
      suggestions: { character: [] },
      toggleField: mockToggleField,
      detectFields: mockDetectFields,
      isLoading: false,
      error: null,
    } as ReturnType<typeof useContextConfigStore>)

    const { rerender } = render(<ContextFieldSelector elementType="character" showOnlyEssential={false} />)

    expect(screen.getAllByRole('checkbox')).toHaveLength(2)
    expect(screen.getAllByRole('checkbox').every((checkbox) => (checkbox as HTMLInputElement).checked)).toBe(true)

    rerender(<ContextFieldSelector elementType="character" showOnlyEssential={true} />)

    expect(screen.getAllByRole('checkbox')).toHaveLength(1)
    expect(screen.getByRole('checkbox')).toBeChecked()
  })
})

