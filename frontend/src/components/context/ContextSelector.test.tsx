import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ContextSelector } from './ContextSelector'
import * as contextAPI from '../../api/context'
import { useContextStore } from '../../store/contextStore'
import type { CharacterResponse, CharacterListResponse, LocationResponse, LocationListResponse, ItemResponse, ItemListResponse, CommunityListResponse } from '../../types/api'

// Mock des modules
vi.mock('../../api/context')
vi.mock('../../store/contextStore')
vi.mock('./ContextSuggestionsPanel', () => ({
  ContextSuggestionsPanel: () => null,
}))

const mockUseContextStore = vi.mocked(useContextStore)

describe('ContextSelector', () => {
  const mockToggleCharacter = vi.fn()
  const mockToggleLocation = vi.fn()
  const mockToggleItem = vi.fn()
  const mockToggleSpecies = vi.fn()
  const mockToggleCommunity = vi.fn()
  const mockClearSelections = vi.fn()
  const mockSetElementLists = vi.fn()
  const mockGetElementMode = vi.fn(() => null)
  const mockSetElementMode = vi.fn()
  const mockSetSuggestions = vi.fn()
  const mockRefreshSuggestionsForTrigger = vi.fn()
  const mockIsElementSelected = vi.fn(() => false)

  const mockSelections = {
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
  }

  const mockCharacter: CharacterResponse = {
    name: 'Test Character',
    data: { Résumé: 'Un héros du récit.', description: 'A test character' },
  }

  const mockLocation: LocationResponse = {
    name: 'Test Location',
    data: { description: 'A test location' },
  }

  const mockItem: ItemResponse = {
    name: 'Test Item',
    data: { description: 'A test item' },
  }

  beforeEach(() => {
    vi.clearAllMocks()
    
    mockUseContextStore.mockReturnValue({
      selections: mockSelections,
      toggleCharacter: mockToggleCharacter,
      toggleLocation: mockToggleLocation,
      toggleItem: mockToggleItem,
      toggleSpecies: mockToggleSpecies,
      toggleCommunity: mockToggleCommunity,
      clearSelections: mockClearSelections,
      setElementLists: mockSetElementLists,
      getElementMode: mockGetElementMode,
      setElementMode: mockSetElementMode,
      setSuggestions: mockSetSuggestions,
      refreshSuggestionsForTrigger: mockRefreshSuggestionsForTrigger,
      isElementSelected: mockIsElementSelected,
      suggestions: [],
      gddDataRevision: 0,
    } as ReturnType<typeof useContextStore>)

    // Mock des appels API par défaut (page, page_size, total_pages pour pagination)
    vi.mocked(contextAPI.listCharacters).mockResolvedValue({
      characters: [mockCharacter],
      total: 1,
      page: 1,
      page_size: 50,
      total_pages: 1,
    })
    vi.mocked(contextAPI.listLocations).mockResolvedValue({
      locations: [mockLocation],
      total: 1,
      page: 1,
      page_size: 50,
      total_pages: 1,
    })
    vi.mocked(contextAPI.listItems).mockResolvedValue({
      items: [mockItem],
      total: 1,
      page: 1,
      page_size: 50,
      total_pages: 1,
    })
    vi.mocked(contextAPI.listSpecies).mockResolvedValue({
      species: [],
      total: 0,
    })
    vi.mocked(contextAPI.listCommunities).mockResolvedValue({
      communities: [],
      total: 0,
      page: 1,
      page_size: 50,
      total_pages: 1,
    })
    vi.mocked(contextAPI.listRegions).mockResolvedValue({
      regions: [],
      total: 0,
    })
  })

  // --- Tests d'intégration Story 3.3 : suggestions automatiques ---

  it('coche un personnage → appelle refreshSuggestionsForTrigger (character)', async () => {
    const user = userEvent.setup()

    render(<ContextSelector />)
    await waitFor(() => expect(screen.getByText('Test Character')).toBeInTheDocument())

    const checkbox = screen.getByRole('checkbox')
    await user.click(checkbox)
    await waitFor(() =>
      expect(mockRefreshSuggestionsForTrigger).toHaveBeenCalledWith('character', 'Test Character', 'salutation')
    )
  })

  it('coche un personnage → le store rafraîchit les suggestions (mock délègue à setSuggestions)', async () => {
    const user = userEvent.setup()
    mockRefreshSuggestionsForTrigger.mockImplementationOnce(() => {
      mockSetSuggestions([{ type: 'location', name: 'Nef Centrale' }])
    })

    render(<ContextSelector />)
    await waitFor(() => expect(screen.getByText('Test Character')).toBeInTheDocument())

    const checkbox = screen.getByRole('checkbox')
    await user.click(checkbox)
    await waitFor(() =>
      expect(mockSetSuggestions).toHaveBeenCalledWith([
        { type: 'location', name: 'Nef Centrale' },
      ])
    )
  })

  it('désélectionner un personnage vide les suggestions', async () => {
    const user = userEvent.setup()
    // La sélection initiale contient déjà le personnage
    mockUseContextStore.mockReturnValue({
      selections: { ...mockSelections, characters_full: ['Test Character'] },
      toggleCharacter: mockToggleCharacter,
      toggleLocation: mockToggleLocation,
      toggleItem: mockToggleItem,
      toggleSpecies: mockToggleSpecies,
      toggleCommunity: mockToggleCommunity,
      clearSelections: mockClearSelections,
      setElementLists: mockSetElementLists,
      getElementMode: mockGetElementMode,
      setElementMode: mockSetElementMode,
      setSuggestions: mockSetSuggestions,
      isElementSelected: vi.fn((type) => type === 'characters'),
      suggestions: [],
      gddDataRevision: 0,
    } as ReturnType<typeof useContextStore>)

    render(<ContextSelector />)
    await waitFor(() => expect(screen.getByText('Test Character')).toBeInTheDocument())

    const checkbox = screen.getByRole('checkbox')
    await user.click(checkbox)
    await waitFor(() => expect(mockSetSuggestions).toHaveBeenCalledWith([]))
  })

  it('affiche les onglets Contexte GDD : Personnages, Lieux (contexte), Lieux, Objets, Espèces, Communautés', async () => {
    render(<ContextSelector />)

    await waitFor(() => {
      expect(screen.getByText(/personnages/i)).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Lieux (contexte)' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Lieux' })).toBeInTheDocument()
      expect(screen.getByText(/objets/i)).toBeInTheDocument()
      expect(screen.getByText(/espèces/i)).toBeInTheDocument()
      expect(screen.getByText(/communautés/i)).toBeInTheDocument()
    })
  })

  it('charge les données au montage (première page paginée)', async () => {
    render(<ContextSelector />)

    await waitFor(() => {
      expect(contextAPI.listCharacters).toHaveBeenCalledWith({ page: 1, page_size: 50 })
      expect(contextAPI.listLocations).toHaveBeenCalledWith({ page: 1, page_size: 50 })
      expect(contextAPI.listRegions).toHaveBeenCalled()
      expect(contextAPI.listItems).toHaveBeenCalledWith({ page: 1, page_size: 50 })
      expect(contextAPI.listSpecies).toHaveBeenCalled()
      expect(contextAPI.listCommunities).toHaveBeenCalledWith({ page: 1, page_size: 50 })
    })
  })

  it('affiche le champ de recherche', async () => {
    render(<ContextSelector />)

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/rechercher/i)).toBeInTheDocument()
    })
  })

  it('permet de changer d\'onglet', async () => {
    const user = userEvent.setup()
    render(<ContextSelector />)

    await waitFor(() => {
      expect(screen.getByText(/personnages/i)).toBeInTheDocument()
    })

    const locationsTab = screen.getByRole('button', { name: 'Lieux (contexte)' })
    await user.click(locationsTab)

    // L'onglet Lieux devrait être actif
    expect(locationsTab).toBeInTheDocument()
  })

  it('appelle onItemSelected quand un élément est cliqué', async () => {
    const user = userEvent.setup()
    const mockOnItemSelected = vi.fn()
    
    vi.mocked(contextAPI.getCharacter).mockResolvedValue(mockCharacter)

    render(<ContextSelector onItemSelected={mockOnItemSelected} />)

    await waitFor(() => {
      expect(screen.getByText('Test Character')).toBeInTheDocument()
    })

    const characterItem = screen.getByText('Test Character')
    await user.click(characterItem)

    await waitFor(() => {
      expect(contextAPI.getCharacter).toHaveBeenCalledWith('Test Character')
      expect(mockOnItemSelected).toHaveBeenCalledWith(mockCharacter, 'personnages')
    })
  })

  it('appelle toggleCharacter quand on coche un personnage', async () => {
    const user = userEvent.setup()
    render(<ContextSelector />)

    await waitFor(() => {
      expect(screen.getByText('Test Character')).toBeInTheDocument()
    })

    const characterItem = screen.getByText('Test Character').closest('div')
    if (characterItem) {
      const checkbox = characterItem.querySelector('input[type="checkbox"]')
      if (checkbox) {
        await user.click(checkbox)
        expect(mockToggleCharacter).toHaveBeenCalledWith('Test Character')
      }
    }
  })

  it('affiche un indicateur de chargement pendant le chargement initial', async () => {
    const resolvers: Array<(v: unknown) => void> = []
    const createDeferred = () =>
      new Promise<unknown>((resolve) => { resolvers.push(resolve) })
    vi.mocked(contextAPI.listCharacters).mockReturnValue(createDeferred() as Promise<CharacterListResponse>)
    vi.mocked(contextAPI.listLocations).mockReturnValue(createDeferred() as Promise<LocationListResponse>)
    vi.mocked(contextAPI.listRegions).mockResolvedValue({ regions: [], total: 0 })
    vi.mocked(contextAPI.listItems).mockReturnValue(createDeferred() as Promise<ItemListResponse>)
    vi.mocked(contextAPI.listSpecies).mockResolvedValue({ species: [], total: 0 })
    vi.mocked(contextAPI.listCommunities).mockReturnValue(createDeferred() as Promise<CommunityListResponse>)

    render(<ContextSelector />)

    expect(screen.getByText(/chargement/i)).toBeInTheDocument()

    if (resolvers[0]) resolvers[0]({ characters: [], total: 0, total_pages: 1 } as CharacterListResponse)
    if (resolvers[1]) resolvers[1]({ locations: [], total: 0, total_pages: 1 } as LocationListResponse)
    if (resolvers[2]) resolvers[2]({ items: [], total: 0, total_pages: 1 } as ItemListResponse)
    if (resolvers[3]) resolvers[3]({ communities: [], total: 0, total_pages: 1 } as CommunityListResponse)
    await waitFor(() => {
      expect(screen.queryByText(/chargement/i)).not.toBeInTheDocument()
    })
  })

  it('affiche une erreur si le chargement échoue', async () => {
    const errorMessage = 'Erreur de chargement'
    vi.mocked(contextAPI.listCharacters).mockRejectedValue(new Error(errorMessage))

    render(<ContextSelector />)

    await waitFor(() => {
      expect(screen.getByText(errorMessage)).toBeInTheDocument()
    })
  })

  it('affiche le résumé des sélections', async () => {
    mockUseContextStore.mockReturnValue({
      selections: {
        characters_full: ['Test Character'],
        characters_excerpt: [],
        locations_full: ['Test Location'],
        locations_excerpt: [],
        items_full: [],
        items_excerpt: [],
        species_full: [],
        species_excerpt: [],
        communities_full: [],
        communities_excerpt: [],
        dialogues_examples: [],
      },
      toggleCharacter: mockToggleCharacter,
      toggleLocation: mockToggleLocation,
      toggleItem: mockToggleItem,
      toggleSpecies: mockToggleSpecies,
      toggleCommunity: mockToggleCommunity,
      clearSelections: mockClearSelections,
      setElementLists: mockSetElementLists,
      getElementMode: mockGetElementMode,
      setElementMode: mockSetElementMode,
      setSuggestions: mockSetSuggestions,
      refreshSuggestionsForTrigger: mockRefreshSuggestionsForTrigger,
      isElementSelected: mockIsElementSelected,
      suggestions: [],
      gddDataRevision: 0,
    } as ReturnType<typeof useContextStore>)

    render(<ContextSelector />)

    await waitFor(() => {
      // Le résumé doit afficher le personnage sélectionné
      expect(screen.getByText(/test character/i)).toBeInTheDocument()
    })
  })

  it('handleRemoveEntity : clic sur X dans le résumé appelle toggleCharacter avec le bon nom', async () => {
    const user = userEvent.setup()
    mockUseContextStore.mockReturnValue({
      selections: {
        characters_full: ['Test Character'],
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
      },
      toggleCharacter: mockToggleCharacter,
      toggleLocation: mockToggleLocation,
      toggleItem: mockToggleItem,
      toggleSpecies: mockToggleSpecies,
      toggleCommunity: mockToggleCommunity,
      clearSelections: mockClearSelections,
      setElementLists: mockSetElementLists,
      getElementMode: mockGetElementMode,
      setElementMode: mockSetElementMode,
      setSuggestions: mockSetSuggestions,
      isElementSelected: mockIsElementSelected,
      suggestions: [],
      gddDataRevision: 0,
    } as ReturnType<typeof useContextStore>)

    render(<ContextSelector />)

    await user.click(await screen.findByTestId('selected-context-summary-toggle'))
    await user.click(await screen.findByRole('button', { name: /retirer test character/i }))

    expect(mockToggleCharacter).toHaveBeenCalledWith('Test Character')
  })

  it('handleSelectionPanelModeChange : clic sur le badge mode appelle setElementMode avec le bon entityType', async () => {
    const user = userEvent.setup()
    mockUseContextStore.mockReturnValue({
      selections: {
        characters_full: ['Test Character'],
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
      },
      toggleCharacter: mockToggleCharacter,
      toggleLocation: mockToggleLocation,
      toggleItem: mockToggleItem,
      toggleSpecies: mockToggleSpecies,
      toggleCommunity: mockToggleCommunity,
      clearSelections: mockClearSelections,
      setElementLists: mockSetElementLists,
      getElementMode: mockGetElementMode,
      setElementMode: mockSetElementMode,
      setSuggestions: mockSetSuggestions,
      refreshSuggestionsForTrigger: mockRefreshSuggestionsForTrigger,
      isElementSelected: mockIsElementSelected,
      suggestions: [],
      gddDataRevision: 0,
    } as ReturnType<typeof useContextStore>)

    render(<ContextSelector />)

    await user.click(await screen.findByTestId('selected-context-summary-toggle'))
    await user.click(await screen.findByTestId('mode-toggle-characters-Test Character'))

    expect(mockSetElementMode).toHaveBeenCalledWith('characters', 'Test Character', 'excerpt')
  })

  it('affiche nom, aperçu (résumé) et badge type d\'entité', async () => {
    render(<ContextSelector />)

    await waitFor(() => {
      expect(screen.getByText('Test Character')).toBeInTheDocument()
    })
    expect(screen.getByText(/Un héros du récit\./)).toBeInTheDocument()
    expect(screen.getByText('Personnage')).toBeInTheDocument()
  })

  it('réinitialise la sélection quand on change d\'onglet', async () => {
    const user = userEvent.setup()
    const mockOnItemSelected = vi.fn()
    
    vi.mocked(contextAPI.getCharacter).mockResolvedValue(mockCharacter)

    render(<ContextSelector onItemSelected={mockOnItemSelected} />)

    await waitFor(() => {
      expect(screen.getByText('Test Character')).toBeInTheDocument()
    })

    // Sélectionner un personnage
    const characterItem = screen.getByText('Test Character')
    await user.click(characterItem)

    await waitFor(() => {
      expect(mockOnItemSelected).toHaveBeenCalledWith(mockCharacter, 'personnages')
    })

    // Changer d'onglet
    const locationsTab = screen.getByRole('button', { name: 'Lieux (contexte)' })
    await user.click(locationsTab)

    // La sélection devrait être réinitialisée
    await waitFor(() => {
      expect(mockOnItemSelected).toHaveBeenLastCalledWith(null, null)
    })
  })
})

