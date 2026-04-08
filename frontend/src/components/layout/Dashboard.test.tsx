import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BrowserRouter } from 'react-router-dom'
import { useGenerationStore } from '../../store/generationStore'
import { useGenerationActionsStore } from '../../store/generationActionsStore'
import { useContextStore } from '../../store/contextStore'
import { GDD_CONTEXT_PANEL_TITLE } from '../context/constants'
import { panelHeaderTitleTypography } from '../../theme/responsiveChrome'

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

vi.mock('../graph/GraphEditor', () => ({
  GraphEditor: () => <div data-testid="graph-editor">Graph Editor</div>,
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
        handleGenerate: null,
        handlePreview: null,
        handleExportUnity: null,
        handleReset: null,
        isLoading: false,
        isDirty: false,
        saveStatus: 'saved',
        draftLastSavedAt: null,
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
        saveStatus: 'saved',
        draftLastSavedAt: null,
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

  it('affiche le statut brouillon discret quand le brouillon n’est pas synchronisé', async () => {
    mockUseGenerationActionsStore.mockReturnValue({
      actions: {
        handleGenerate: vi.fn(),
        handlePreview: vi.fn(),
        handleExportUnity: vi.fn(),
        handleReset: vi.fn(),
        isLoading: false,
        isDirty: true,
        saveStatus: 'unsaved',
        draftLastSavedAt: null,
      },
    } as ReturnType<typeof useGenerationActionsStore>)

    render(
      <BrowserRouter>
        <Dashboard />
      </BrowserRouter>
    )

    await waitFor(() => {
      expect(screen.getByText(/modifications non enregistrées/i)).toBeInTheDocument()
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

  it('active un mode narrow à 320px: panneaux latéraux repliés mais ré-ouvrables', async () => {
    const user = userEvent.setup()
    Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: 320 })
    window.dispatchEvent(new Event('resize'))

    render(
      <BrowserRouter>
        <Dashboard />
      </BrowserRouter>
    )

    // En mode narrow, le contenu du panneau gauche ne doit pas forcer un 3-panneaux compressé
    await waitFor(() => {
      expect(screen.queryByTestId('context-selector')).not.toBeInTheDocument()
    })

    // Et des contrôles explicites permettent de ré-ouvrir les panneaux
    const expandLeft = screen.getByRole('button', { name: /déplier le panneau gauche/i })
    const expandRight = screen.getByRole('button', { name: /déplier le panneau droit/i })
    expect(expandLeft).toBeInTheDocument()
    expect(expandRight).toBeInTheDocument()

    await user.click(expandLeft)
    expect(screen.getByTestId('context-selector')).toBeInTheDocument()
  })

  it('active un mode tablette à 768px: drawers GDD + détails (FR120)', async () => {
    const user = userEvent.setup()
    Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: 768 })
    window.dispatchEvent(new Event('resize'))

    render(
      <BrowserRouter>
        <Dashboard />
      </BrowserRouter>
    )

    await waitFor(() => {
      expect(screen.queryByTestId('context-selector')).not.toBeInTheDocument()
    })

    expect(screen.getByRole('button', { name: /déplier le panneau gauche/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /déplier le panneau droit/i })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /déplier le panneau gauche/i }))
    await waitFor(() => {
      const dlg = screen.getByRole('dialog', { name: /contexte gdd/i })
      expect(dlg).toHaveAttribute('aria-modal', 'true')
      expect(screen.getByTestId('narrow-drawer-backdrop')).toBeInTheDocument()
    })
    expect(screen.getByRole('button', { name: /fermer le panneau contexte gdd/i })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /fermer le panneau contexte gdd/i }))
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: /contexte gdd/i })).not.toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: /déplier le panneau droit/i }))
    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: /^détails$/i })).toHaveAttribute('aria-modal', 'true')
      expect(screen.getByRole('button', { name: /prompt/i })).toBeInTheDocument()
    })
  })

  it('mobile 375px: même comportement narrow que 320px (panneaux latéraux repliés)', async () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: 375 })
    window.dispatchEvent(new Event('resize'))

    render(
      <BrowserRouter>
        <Dashboard />
      </BrowserRouter>
    )

    await waitFor(() => {
      expect(screen.queryByTestId('context-selector')).not.toBeInTheDocument()
    })
    expect(screen.getByRole('button', { name: /déplier le panneau gauche/i })).toBeInTheDocument()
  })

  it('desktop 1024px: panneaux latéraux visibles par défaut (non-régression layout 3 colonnes)', async () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: 1024 })
    window.dispatchEvent(new Event('resize'))

    render(
      <BrowserRouter>
        <Dashboard />
      </BrowserRouter>
    )

    await waitFor(() => {
      expect(screen.getByTestId('context-selector')).toBeInTheDocument()
    })
    expect(screen.queryByRole('button', { name: /déplier le panneau gauche/i })).not.toBeInTheDocument()
  })

  it('FR118 17.6: titre panneau GDD plus compact quand la colonne centrale est étroite (desktop)', async () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: 1024 })
    window.dispatchEvent(new Event('resize'))

    const { unmount } = render(
      <BrowserRouter>
        <div style={{ width: 1400, height: 700 }}>
          <Dashboard />
        </div>
      </BrowserRouter>
    )

    await waitFor(() => {
      expect(screen.getByTestId('context-selector')).toBeInTheDocument()
    })

    const titleComfortable = screen.getByText(GDD_CONTEXT_PANEL_TITLE)
    expect(titleComfortable).toHaveStyle({
      fontSize: `${panelHeaderTitleTypography.comfortableFontRem}rem`,
    })
    unmount()

    // Avec defaultSizes [20, 58, 22], conteneur plus étroit pour garder la colonne centrale sous 480px (seuil narrow).
    render(
      <BrowserRouter>
        <div style={{ width: 760, height: 700 }}>
          <Dashboard />
        </div>
      </BrowserRouter>
    )

    await waitFor(() => {
      const titleNarrow = screen.getByText(GDD_CONTEXT_PANEL_TITLE)
      expect(titleNarrow).toHaveStyle({
        fontSize: `${panelHeaderTitleTypography.narrowFontRem}rem`,
      })
    })
  })

  it('FR118 17.6 AC2: onglets segmentés centraux — title complet et pas de scroll horizontal document (Dashboard)', async () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: 1024 })
    window.dispatchEvent(new Event('resize'))

    render(
      <BrowserRouter>
        <div style={{ width: 720, height: 700 }}>
          <Dashboard />
        </div>
      </BrowserRouter>
    )

    await waitFor(() => {
      expect(screen.getByTestId('context-selector')).toBeInTheDocument()
    })

    const generationTab = screen.getByRole('button', { name: '💬 Génération de Dialogues' })
    expect(generationTab).toHaveAttribute('title', '💬 Génération de Dialogues')

    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(
      document.documentElement.clientWidth + 1
    )
  })

  it('mobile: accès à l’onglet Éditeur de Graphe (FR118 zones critiques)', async () => {
    const user = userEvent.setup()
    Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: 320 })
    window.dispatchEvent(new Event('resize'))

    render(
      <BrowserRouter>
        <Dashboard />
      </BrowserRouter>
    )

    await waitFor(() => {
      expect(screen.queryByTestId('context-selector')).not.toBeInTheDocument()
    })

    const graphTab = screen.getByRole('button', { name: /éditeur de graphe/i })
    await user.click(graphTab)
    expect(screen.getByTestId('graph-editor')).toBeInTheDocument()
  })

  it('narrow 375px: panneau contexte en overlay dialog + fermeture explicite (FR120)', async () => {
    const user = userEvent.setup()
    Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: 375 })
    window.dispatchEvent(new Event('resize'))

    render(
      <BrowserRouter>
        <Dashboard />
      </BrowserRouter>
    )

    await waitFor(() => {
      expect(screen.queryByTestId('context-selector')).not.toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: /déplier le panneau gauche/i }))
    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: /contexte gdd/i })).toHaveAttribute('aria-modal', 'true')
      expect(screen.getByTestId('narrow-drawer-backdrop')).toBeInTheDocument()
      expect(screen.getByTestId('context-selector')).toBeInTheDocument()
    })
  })

  it('narrow: Escape referme le drawer contexte (FR120 — équivalent clavier)', async () => {
    const user = userEvent.setup()
    Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: 375 })
    window.dispatchEvent(new Event('resize'))

    render(
      <BrowserRouter>
        <Dashboard />
      </BrowserRouter>
    )

    await waitFor(() => {
      expect(screen.queryByTestId('context-selector')).not.toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: /déplier le panneau gauche/i }))
    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: /contexte gdd/i })).toBeInTheDocument()
    })

    await user.keyboard('{Escape}')

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: /contexte gdd/i })).not.toBeInTheDocument()
      expect(screen.queryByTestId('narrow-drawer-backdrop')).not.toBeInTheDocument()
    })
  })

  it('narrow: fermeture drawer + onglets génération → graphe sans overlay persistant (FR120)', async () => {
    const user = userEvent.setup()
    Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: 375 })
    window.dispatchEvent(new Event('resize'))

    render(
      <BrowserRouter>
        <Dashboard />
      </BrowserRouter>
    )

    await waitFor(() => {
      expect(screen.queryByTestId('context-selector')).not.toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: /déplier le panneau gauche/i }))
    await waitFor(() => {
      expect(screen.getByTestId('narrow-drawer-backdrop')).toBeInTheDocument()
    })
    await user.click(screen.getByRole('button', { name: /fermer le panneau contexte gdd/i }))
    await waitFor(() => {
      expect(screen.queryByTestId('narrow-drawer-backdrop')).not.toBeInTheDocument()
    })

    const graphTab = screen.getByRole('button', { name: /éditeur de graphe/i })
    await user.click(graphTab)
    expect(screen.getByTestId('graph-editor')).toBeInTheDocument()
    expect(screen.queryByTestId('narrow-drawer-backdrop')).not.toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})

