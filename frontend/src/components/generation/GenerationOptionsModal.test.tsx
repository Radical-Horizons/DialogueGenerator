import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { GenerationOptionsModal } from './GenerationOptionsModal'
import { useContextConfigStore } from '../../store/contextConfigStore'
import * as configAPI from '../../api/config'

// Mock des dépendances
vi.mock('../../store/contextConfigStore')
vi.mock('../../api/config')
vi.mock('./ContextFieldSelector', () => ({
  ContextFieldSelector: ({ elementType }: { elementType: string }) => (
    <div data-testid={`field-selector-${elementType}`}>Field Selector for {elementType}</div>
  ),
}))

const mockUseContextConfigStore = vi.mocked(useContextConfigStore)
const mockConfigAPI = vi.mocked(configAPI)

describe('GenerationOptionsModal', () => {
  const mockOnClose = vi.fn()
  const mockOnApply = vi.fn()
  const mockSetOrganization = vi.fn()
  const mockResetToDefault = vi.fn()
  const mockGetPreview = vi.fn()
  const mockDetectFields = vi.fn()
  const mockLoadSuggestions = vi.fn()
  const mockLoadDefaultConfig = vi.fn().mockResolvedValue(undefined)

  beforeEach(() => {
    vi.clearAllMocks()
    
    mockUseContextConfigStore.mockReturnValue({
      fieldConfigs: {
        character: [],
        location: [],
        item: [],
        species: [],
        community: [],
      },
      organization: 'default',
      setOrganization: mockSetOrganization,
      resetToDefault: mockResetToDefault,
      getPreview: mockGetPreview,
      detectFields: mockDetectFields,
      loadSuggestions: mockLoadSuggestions,
      loadDefaultConfig: mockLoadDefaultConfig,
      availableFields: {},
      suggestions: {},
      isLoading: false,
      error: null,
      toggleField: vi.fn(),
      clearError: vi.fn(),
    } as ReturnType<typeof useContextConfigStore>)

    mockConfigAPI.getUnityDialoguesPath.mockResolvedValue({ path: '/test/path' })
  })

  it('ne devrait pas s\'afficher quand isOpen est false', () => {
    render(
      <GenerationOptionsModal
        isOpen={false}
        onClose={mockOnClose}
        onApply={mockOnApply}
      />
    )
    
    expect(screen.queryByText(/options de génération/i)).not.toBeInTheDocument()
  })

  it('devrait s\'afficher quand isOpen est true', () => {
    render(
      <GenerationOptionsModal
        isOpen={true}
        onClose={mockOnClose}
        onApply={mockOnApply}
      />
    )
    
    expect(screen.getByText(/options de génération/i)).toBeInTheDocument()
  })

  it('devrait afficher les onglets', () => {
    render(
      <GenerationOptionsModal
        isOpen={true}
        onClose={mockOnClose}
        onApply={mockOnApply}
      />
    )
    
    expect(screen.getByText(/contexte/i)).toBeInTheDocument()
    expect(screen.getByText(/général/i)).toBeInTheDocument()
    expect(screen.getByText(/vocabulaire/i)).toBeInTheDocument()
  })

  it('devrait permettre de changer d\'onglet', async () => {
    const user = userEvent.setup()
    render(
      <GenerationOptionsModal
        isOpen={true}
        onClose={mockOnClose}
        onApply={mockOnApply}
      />
    )
    
    const generalTab = screen.getByText(/général/i)
    await user.click(generalTab)
    
    // L'onglet Général affiche Organisation du Prompt (pas "Configuration Unity" qui n'existe plus)
    expect(screen.getByText(/organisation du prompt/i)).toBeInTheDocument()
  })

  it('devrait fermer le modal quand on clique sur le bouton de fermeture', async () => {
    const user = userEvent.setup()
    render(
      <GenerationOptionsModal
        isOpen={true}
        onClose={mockOnClose}
        onApply={mockOnApply}
      />
    )
    
    const closeButton = screen.getByText('×')
    await user.click(closeButton)
    
    expect(mockOnClose).toHaveBeenCalled()
  })

  it('devrait appeler onApply quand on clique sur Appliquer', async () => {
    const user = userEvent.setup()
    render(
      <GenerationOptionsModal
        isOpen={true}
        onClose={mockOnClose}
        onApply={mockOnApply}
      />
    )
    
    const applyButton = screen.getByText(/appliquer/i)
    await user.click(applyButton)
    
    expect(mockOnApply).toHaveBeenCalled()
    expect(mockOnClose).toHaveBeenCalled()
  })

  it('devrait réinitialiser et fermer quand on clique sur Réinitialiser', async () => {
    const user = userEvent.setup()
    render(
      <GenerationOptionsModal
        isOpen={true}
        onClose={mockOnClose}
        onApply={mockOnApply}
      />
    )
    
    const resetButton = screen.getByText(/réinitialiser/i)
    await user.click(resetButton)
    
    expect(mockResetToDefault).toHaveBeenCalled()
    expect(mockOnClose).toHaveBeenCalled()
  })

  it('devrait charger la config par défaut à l\'ouverture', async () => {
    render(
      <GenerationOptionsModal
        isOpen={true}
        onClose={mockOnClose}
        onApply={mockOnApply}
      />
    )
    
    await waitFor(() => {
      expect(mockLoadDefaultConfig).toHaveBeenCalled()
    })
  })
})

