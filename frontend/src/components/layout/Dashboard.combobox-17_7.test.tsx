import type { ReactNode } from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BrowserRouter } from 'react-router-dom'
import { useGenerationStore } from '../../store/generationStore'
import { useGenerationActionsStore } from '../../store/generationActionsStore'
import { useContextStore } from '../../store/contextStore'

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

vi.mock('../generation/GenerationPanel', () => ({
  GenerationPanel: () => <div data-testid="generation-panel">Generation Panel</div>,
}))
vi.mock('../graph/GraphEditor', () => ({
  GraphEditor: () => <div data-testid="graph-editor">Graph Editor</div>,
}))
vi.mock('../context/ContextSelector', () => ({
  ContextSelector: () => <div data-testid="context-selector">Context Selector</div>,
}))
vi.mock('../../api/unityDialogues', () => ({
  listUnityDialogues: vi.fn().mockResolvedValue({ dialogues: [], total: 0 }),
  getUnityDialogue: vi.fn(),
  deleteUnityDialogue: vi.fn(),
  previewUnityDialogue: vi.fn(),
}))

const mockUseGenerationStore = vi.mocked(useGenerationStore)
const mockUseGenerationActionsStore = vi.mocked(useGenerationActionsStore)
const mockUseContextStore = vi.mocked(useContextStore)

function Wrapper({ children }: { children: ReactNode }) {
  return <BrowserRouter>{children}</BrowserRouter>
}

describe('Dashboard — 17.7 sélecteur de dialogue dans toolbar', () => {
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

  it('narrow: onglet Édition de Dialogues — colonne liste absente, combobox présent', async () => {
    const user = userEvent.setup()

    render(
      <Wrapper>
        <div style={{ width: 480, height: 900, overflow: 'hidden' }}>
          <Dashboard />
        </div>
      </Wrapper>
    )

    const editionTab = await screen.findByRole('button', { name: /^Éditer$/i })
    await user.click(editionTab)

    await waitFor(() => {
      expect(screen.getByTestId('dialogue-combobox-trigger')).toBeInTheDocument()
    })
    expect(screen.queryByTestId('unity-dialogue-list')).not.toBeInTheDocument()
  })

  it('desktop: onglet Édition de Dialogues — colonne liste présente, combobox absent', async () => {
    const user = userEvent.setup()

    render(
      <Wrapper>
        <div style={{ width: 1440, height: 900, overflow: 'hidden' }}>
          <Dashboard />
        </div>
      </Wrapper>
    )

    const editionTab = await screen.findByRole('button', { name: /^Éditer$/i })
    await user.click(editionTab)

    await waitFor(() => {
      expect(screen.getByTestId('unity-dialogue-list')).toBeInTheDocument()
    })
    expect(screen.queryByTestId('dialogue-combobox-trigger')).not.toBeInTheDocument()
  })
})
