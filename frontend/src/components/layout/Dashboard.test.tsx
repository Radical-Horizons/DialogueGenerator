import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BrowserRouter } from 'react-router-dom'
import { useGenerationStore } from '../../store/generationStore'
import { useGenerationActionsStore } from '../../store/generationActionsStore'
import { useContextStore } from '../../store/contextStore'

// Mock des stores
vi.mock('../../store/generationStore')
vi.mock('../../store/generationActionsStore')
vi.mock('../../store/contextStore')
vi.mock('../../store/contextConfigStore', () => ({
  useContextConfigStore: vi.fn(() => ({
    loadDefaultConfig: vi.fn().mockResolvedValue(undefined),
  })),
}))
vi.mock('../../store/graphStore', () => ({
  useGraphStore: vi.fn(() => ({
    selectedNodeId: null,
    nodes: [],
    isGenerating: false,
  })),
}))

// Mock des composants complexes
vi.mock('../generation/GenerationPanel', () => ({
  GenerationPanel: () => <div data-testid="generation-panel">Generation Panel</div>,
}))

vi.mock('../context/ContextSelector', () => ({
  ContextSelector: () => <div data-testid="context-selector">Context Selector</div>,
}))

const mockUseGenerationStore = vi.mocked(useGenerationStore)
const mockUseGenerationActionsStore = vi.mocked(useGenerationActionsStore)
const mockUseContextStore = vi.mocked(useContextStore)

describe('Dashboard', () => {
  let Dashboard: typeof import('./Dashboard').Dashboard

  beforeEach(async () => {
    vi.clearAllMocks()
    Dashboard = (await import('./Dashboard')).Dashboard
    
    mockUseGenerationStore.mockReturnValue({
      rawPrompt: '',
      tokenCount: 0,
      promptHash: null,
      isEstimating: false,
      unityDialogueResponse: null,
      sceneSelection: {
        characterA: null,
        characterB: null,
        sceneRegion: null,
        subLocation: null,
      },
      dialogueStructure: ['', '', '', '', '', ''] as [string, string, string, string, string, string],
      systemPromptOverride: null,
      setDialogueStructure: vi.fn(),
      setSystemPromptOverride: vi.fn(),
      setRawPrompt: vi.fn(),
      setSceneSelection: vi.fn(),
      setUnityDialogueResponse: vi.fn(),
      tokensUsed: null,
      setTokensUsed: vi.fn(),
      clearGenerationResults: vi.fn(),
    } as ReturnType<typeof useGenerationStore>)

    
    mockUseContextStore.mockReturnValue({
      selections: {
        characters: [],
        locations: [],
        items: [],
        species: [],
        communities: [],
        dialogues_examples: [],
      },
      toggleCharacter: vi.fn(),
      toggleLocation: vi.fn(),
      toggleItem: vi.fn(),
      toggleSpecies: vi.fn(),
      toggleCommunity: vi.fn(),
      clearSelections: vi.fn(),
    } as ReturnType<typeof useContextStore>)

    mockUseGenerationActionsStore.mockReturnValue({
      actions: {
        handleGenerate: undefined,
        handlePreview: undefined,
        handleExportUnity: undefined,
        handleReset: undefined,
        isLoading: false,
        isDirty: false,
      },
    } as ReturnType<typeof useGenerationActionsStore>)
  })

  it('affiche les trois panneaux', async () => {
    render(
      <BrowserRouter>
        <Dashboard />
      </BrowserRouter>
    )

    // Le composant ResizablePanels devrait être présent
    expect(screen.getByTestId('context-selector')).toBeInTheDocument()
    expect(screen.getByTestId('generation-panel')).toBeInTheDocument()
    // Les onglets du panneau droit (Prompt, Dialogue généré, Détails)
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /prompt/i })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /dialogue généré/i })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /détails/i })).toBeInTheDocument()
    })
  })

  it('affiche le panneau de sélection de contexte à gauche', () => {
    render(
      <BrowserRouter>
        <Dashboard />
      </BrowserRouter>
    )

    // Le ContextSelector devrait être présent
    expect(screen.getByTestId('context-selector')).toBeInTheDocument()
  })

  it('affiche le panneau de génération au centre', () => {
    render(
      <BrowserRouter>
        <Dashboard />
      </BrowserRouter>
    )

    // Le GenerationPanel devrait être présent
    expect(screen.getByTestId('generation-panel')).toBeInTheDocument()
  })

  it('affiche les onglets dans le panneau de droite', async () => {
    render(
      <BrowserRouter>
        <Dashboard />
      </BrowserRouter>
    )

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /prompt/i })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /dialogue généré/i })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /détails/i })).toBeInTheDocument()
    })
  })

  it('affiche le message par défaut dans l\'onglet Détails', async () => {
    const user = userEvent.setup()
    render(
      <BrowserRouter>
        <Dashboard />
      </BrowserRouter>
    )

    const detailsTab = await screen.findByRole('button', { name: /détails/i })
    await user.click(detailsTab)

    await waitFor(() => {
      expect(screen.getByText(/sélectionnez un élément de contexte pour voir ses détails/i)).toBeInTheDocument()
    })
  })

  it('permet de changer d\'onglet dans le panneau de droite', async () => {
    const user = userEvent.setup()
    render(
      <BrowserRouter>
        <Dashboard />
      </BrowserRouter>
    )

    const detailsTab = await screen.findByRole('button', { name: /détails/i })
    await user.click(detailsTab)

    expect(detailsTab).toBeInTheDocument()
  })

  it('affiche les boutons d\'action quand handleGenerate est disponible', async () => {
    mockUseGenerationActionsStore.mockReturnValue({
      actions: {
        handleGenerate: vi.fn(),
        handlePreview: vi.fn(),
        handleExportUnity: vi.fn(),
        handleReset: vi.fn(),
        isLoading: false,
        isDirty: false,
      },
    } as ReturnType<typeof useGenerationActionsStore>)

    render(
      <BrowserRouter>
        <Dashboard />
      </BrowserRouter>
    )

    // Le Dashboard affiche le bouton Générer dans le panneau droit (pas Exporter/Reset qui sont dans le Header)
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /générer/i })).toBeInTheDocument()
    })
  })

  it('affiche l\'indicateur de brouillon non sauvegardé', async () => {
    mockUseGenerationActionsStore.mockReturnValue({
      actions: {
        handleGenerate: vi.fn(),
        handlePreview: vi.fn(),
        handleExportUnity: vi.fn(),
        handleReset: vi.fn(),
        isLoading: false,
        isDirty: true,
      },
    } as ReturnType<typeof useGenerationActionsStore>)

    render(
      <BrowserRouter>
        <Dashboard />
      </BrowserRouter>
    )

    await waitFor(() => {
      expect(screen.getByText(/brouillon non sauvegardé/i)).toBeInTheDocument()
    })
  })

  it('affiche le prompt estimé dans l\'onglet Prompt', async () => {
    const testPrompt = 'Test prompt content'
    mockUseGenerationStore.mockReturnValue({
      rawPrompt: testPrompt,
      tokenCount: 100,
      promptHash: 'hash123',
      isEstimating: false,
      unityDialogueResponse: null,
      sceneSelection: {
        characterA: null,
        characterB: null,
        sceneRegion: null,
        subLocation: null,
      },
      dialogueStructure: ['', '', '', '', '', ''] as [string, string, string, string, string, string],
      systemPromptOverride: null,
      setDialogueStructure: vi.fn(),
      setSystemPromptOverride: vi.fn(),
      setRawPrompt: vi.fn(),
      setSceneSelection: vi.fn(),
      setUnityDialogueResponse: vi.fn(),
      tokensUsed: null,
      setTokensUsed: vi.fn(),
      clearGenerationResults: vi.fn(),
    } as ReturnType<typeof useGenerationStore>)


    render(
      <BrowserRouter>
        <Dashboard />
      </BrowserRouter>
    )

    // Aller explicitement sur l'onglet "Prompt" (pas forcément actif par défaut)
    const promptTab = screen.getByText(/^prompt$/i)
    await userEvent.setup().click(promptTab)

    // Basculer en vue brute pour afficher le texte tel quel
    const viewToggle = screen.getByRole('checkbox')
    if (viewToggle instanceof HTMLInputElement && viewToggle.checked) {
      await userEvent.setup().click(viewToggle)
    }

    // Le EstimatedPromptPanel devrait afficher le prompt (vue brute)
    await waitFor(() => {
      expect(screen.getByText(testPrompt)).toBeInTheDocument()
    })
  })

  it('affiche UnityDialogueViewer quand unityDialogueResponse est présent', () => {
    const mockUnityResponse = {
      json_content: JSON.stringify([{ id: 'START', speaker: 'NPC', line: 'Hello' }]),
      title: 'Test Dialogue',
      estimated_tokens: 100,
    }

    mockUseGenerationStore.mockReturnValue({
      rawPrompt: '',
      tokenCount: 0,
      promptHash: null,
      isEstimating: false,
      unityDialogueResponse: mockUnityResponse,
      sceneSelection: {
        characterA: null,
        characterB: null,
        sceneRegion: null,
        subLocation: null,
      },
      dialogueStructure: ['', '', '', '', '', ''] as [string, string, string, string, string, string],
      systemPromptOverride: null,
      setDialogueStructure: vi.fn(),
      setSystemPromptOverride: vi.fn(),
      setRawPrompt: vi.fn(),
      setSceneSelection: vi.fn(),
      setUnityDialogueResponse: vi.fn(),
      tokensUsed: null,
      setTokensUsed: vi.fn(),
      clearGenerationResults: vi.fn(),
    } as ReturnType<typeof useGenerationStore>)


    render(
      <BrowserRouter>
        <Dashboard />
      </BrowserRouter>
    )

    expect(screen.getByText('Test Dialogue')).toBeInTheDocument()
  })

  it('affiche un message quand aucun dialogue Unity n\'est généré', async () => {
    const user = userEvent.setup()
    render(
      <BrowserRouter>
        <Dashboard />
      </BrowserRouter>
    )

    // Cliquer sur l'onglet "Dialogue généré"
    const dialogueTab = screen.getByText(/dialogue généré/i)
    await user.click(dialogueTab)

    await waitFor(() => {
      expect(screen.getByText(/aucun dialogue unity généré/i)).toBeInTheDocument()
    })
  })
})

