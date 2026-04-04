import { describe, it, expect, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactElement } from 'react'
import { GenerationOptionsModal } from './GenerationOptionsModal'
import { useContextConfigStore } from '../../store/contextConfigStore'
import * as configAPI from '../../api/config'
import { getGddFullSyncCheckpoint } from '../../api/gddNotionSync'

// Mock des dépendances
vi.mock('../../store/contextConfigStore')
vi.mock('../../api/config')

vi.mock('../../api/gddNotionSync', () => ({
  GDD_FULL_SYNC_CHECKPOINT_QUERY_KEY: ['gdd-full-sync-checkpoint'],
  getGddFullSyncCheckpoint: vi.fn(),
}))

const mockGetGddCheckpoint = vi.mocked(getGddFullSyncCheckpoint)

const defaultCheckpointResponse = {
  resumable: false,
  checkpoint_status: 'none',
  checkpoint_file_present: false,
  orphan_staging_runs: 0,
  message: '',
  staging_run_name: '',
  archive_rel: '',
  sources_total: 0,
  sources_completed: 0,
  completed_category_files: [] as string[],
  eligible_category_files: [] as string[],
}

function renderWithQueryClient(ui: ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>)
}
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
    mockGetGddCheckpoint.mockResolvedValue(defaultCheckpointResponse)

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
    renderWithQueryClient(
      <GenerationOptionsModal
        isOpen={false}
        onClose={mockOnClose}
        onApply={mockOnApply}
      />
    )
    
    expect(screen.queryByRole('heading', { level: 2, name: 'Options' })).not.toBeInTheDocument()
  })

  it('devrait s\'afficher quand isOpen est true', () => {
    renderWithQueryClient(
      <GenerationOptionsModal
        isOpen={true}
        onClose={mockOnClose}
        onApply={mockOnApply}
      />
    )
    
    expect(screen.getByRole('heading', { level: 2, name: 'Options' })).toBeInTheDocument()
  })

  it('devrait afficher les onglets', () => {
    renderWithQueryClient(
      <GenerationOptionsModal
        isOpen={true}
        onClose={mockOnClose}
        onApply={mockOnApply}
      />
    )
    
    expect(screen.getByRole('button', { name: 'Contexte' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Général' })).toBeInTheDocument()
    expect(screen.getByText(/vocabulaire/i)).toBeInTheDocument()
  })

  it('devrait permettre de changer d\'onglet', async () => {
    const user = userEvent.setup()
    renderWithQueryClient(
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
    renderWithQueryClient(
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
    renderWithQueryClient(
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
    renderWithQueryClient(
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
    renderWithQueryClient(
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

  it('affiche le bandeau reprise Notion et renomme l’onglet quand checkpoint resumable', async () => {
    const user = userEvent.setup()
    mockGetGddCheckpoint.mockResolvedValue({
      ...defaultCheckpointResponse,
      resumable: true,
      checkpoint_status: 'resumable',
      checkpoint_file_present: true,
      message: 'Reprise possible.',
      sources_total: 3,
      sources_completed: 1,
    })
    renderWithQueryClient(
      <GenerationOptionsModal
        isOpen={true}
        onClose={mockOnClose}
        onApply={mockOnApply}
      />
    )
    expect(await screen.findByRole('button', { name: /Notion · reprise/i })).toBeInTheDocument()
    expect(
      screen.getByText(/Synchronisation Notion complète en pause sur le serveur/i),
    ).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Aller à Notion/i }))
    await waitFor(() => {
      expect(
        screen.queryByText(/Synchronisation Notion complète en pause sur le serveur/i),
      ).not.toBeInTheDocument()
    })
    expect(screen.getByText(/Synchronisation GDD \(Notion\)/i)).toBeInTheDocument()
  })
})

