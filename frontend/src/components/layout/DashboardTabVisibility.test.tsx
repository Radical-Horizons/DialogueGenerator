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
  useGraphStore: vi.fn((selector?: (state: {
    selectedNodeId: string | null
    nodes: unknown[]
    isGenerating: boolean
    dialogueMetadata: { title: string; filename?: string; node_count: number; edge_count: number }
  }) => unknown) => {
    const state = {
      selectedNodeId: null,
      nodes: [],
      isGenerating: false,
      dialogueMetadata: {
        title: 'Nouveau Dialogue',
        filename: 'nouveau_dialogue.json',
        node_count: 0,
        edge_count: 0,
      },
    }
    return typeof selector === 'function' ? selector(state) : state
  }),
}))
vi.mock('../../api/config', () => ({
  listLLMModels: vi.fn().mockResolvedValue({ models: [] }),
}))
vi.mock('../../api/unityDialogues', () => ({
  listUnityDialogues: vi.fn().mockResolvedValue({ dialogues: [], total: 0 }),
  getUnityDialogue: vi.fn(),
  deleteUnityDialogue: vi.fn(),
  previewUnityDialogue: vi.fn(),
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

const mockUseGenerationStore = vi.mocked(useGenerationStore)
const mockUseGenerationActionsStore = vi.mocked(useGenerationActionsStore)
const mockUseContextStore = vi.mocked(useContextStore)

describe('Dashboard tab visibility', () => {
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

  it('hides the node editing tab in dialogue edition view', async () => {
    const user = userEvent.setup()
    render(
      <BrowserRouter>
        <Dashboard />
      </BrowserRouter>
    )

    await user.click(screen.getByRole('button', { name: /éditeur de graphe/i }))
    expect(await screen.findByRole('button', { name: /édition de nœud/i })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /édition de dialogues/i }))

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /édition de nœud/i })).not.toBeInTheDocument()
    })
  })
})
