/**
 * Story 17.2 FR119 — cibles tactiles ≥ 44px (chrome shell + toolbar graphe).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { TOUCH_TARGET_MIN_PX } from '../constants'
import { Header } from '../components/layout/Header'
import { Tabs } from '../components/shared/Tabs'
import { GraphEditorHeader } from '../components/graph/GraphEditorHeader'
import { graphToolbarChrome } from '../theme/responsiveChrome'
import { useGenerationStore } from '../store/generationStore'
import { useGenerationActionsStore } from '../store/generationActionsStore'
import { useContextStore } from '../store/contextStore'
import { useGraphStore } from '../store/graphStore'
import type { UseGraphToolbarReturn } from '../hooks/useGraphToolbar'

function expectInlineMinTouchPx(el: HTMLElement, label: string, px: number) {
  const h = el.style.minHeight
  const w = el.style.minWidth
  expect(h, `${label} minHeight`).toBe(`${px}px`)
  expect(w, `${label} minWidth`).toBe(`${px}px`)
}

function expectInlineMinTouch(el: HTMLElement, label: string) {
  expectInlineMinTouchPx(el, label, TOUCH_TARGET_MIN_PX)
}

vi.mock('../store/authStore', () => ({
  useAuthStore: vi.fn(() => ({
    user: { username: 'testuser' },
    isAuthenticated: true,
    logout: vi.fn(),
  })),
}))

vi.mock('../store/generationStore', () => ({
  useGenerationStore: vi.fn(),
}))
vi.mock('../store/generationActionsStore', () => ({
  useGenerationActionsStore: vi.fn(),
}))
vi.mock('../store/contextStore', () => ({
  useContextStore: vi.fn(),
}))
vi.mock('../store/contextConfigStore', () => ({
  useContextConfigStore: vi.fn(() => ({
    loadDefaultConfig: vi.fn().mockResolvedValue(undefined),
  })),
}))
vi.mock('../components/generation/GenerationPanel', () => ({
  GenerationPanel: () => <div data-testid="generation-panel">Generation Panel</div>,
}))
vi.mock('../components/graph/GraphEditor', () => ({
  GraphEditor: () => <div data-testid="graph-editor">Graph Editor</div>,
}))
vi.mock('../components/context/ContextSelector', () => ({
  ContextSelector: () => <div data-testid="context-selector">Context Selector</div>,
}))

const mockUseGenerationStore = vi.mocked(useGenerationStore)
const mockUseGenerationActionsStore = vi.mocked(useGenerationActionsStore)
const mockUseContextStore = vi.mocked(useContextStore)

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
})

function makeMockToolbar(overrides: Partial<UseGraphToolbarReturn> = {}): UseGraphToolbarReturn {
  return {
    showAutoLayoutDropdown: false,
    setShowAutoLayoutDropdown: () => {},
    showActionsDropdown: false,
    setShowActionsDropdown: () => {},
    showAIGenerationPanel: false,
    setShowAIGenerationPanel: () => {},
    showExportFormatDialog: false,
    setShowExportFormatDialog: () => {},
    showValidationPanel: false,
    setShowValidationPanel: () => {},
    showCostBreakdown: false,
    setShowCostBreakdown: () => {},
    showShortcutsTooltip: false,
    setShowShortcutsTooltip: () => {},
    showSearchBar: false,
    setShowSearchBar: () => {},
    showJumpToNodeModal: false,
    setShowJumpToNodeModal: () => {},
    showFiltersPanel: false,
    setShowFiltersPanel: () => {},
    layoutDirection: 'TB',
    layoutSpacingMode: 'normal',
    setLayoutSpacingMode: () => {},
    autoLayoutDropdownRef: { current: null },
    actionsDropdownRef: { current: null },
    actionsDropdownBtnRef: { current: null },
    canvasWrapperRef: { current: null },
    reactFlowInstance: null,
    handleAutoLayout: async () => {},
    handleOpenExportDialog: () => {},
    handleExportPNG: async () => {},
    handleExportSVG: async () => {},
    undo: () => {},
    redo: () => {},
    canUndoNow: false,
    canRedoNow: false,
    ...overrides,
  }
}

describe('FR119 touch targets — chrome', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useGraphStore.getState().resetGraph()
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
        handleGenerate: vi.fn(),
        handlePreview: null,
        handleExportUnity: vi.fn(),
        handleReset: vi.fn(),
        isLoading: false,
        isDirty: false,
        saveStatus: 'saved',
        draftLastSavedAt: null,
      },
    } as ReturnType<typeof useGenerationActionsStore>)
  })

  it('Header : Options, Actions et menu utilisateur ≥ 44px (styles inline)', () => {
    render(
      <QueryClientProvider client={queryClient}>
        <Header />
      </QueryClientProvider>
    )
    expectInlineMinTouch(screen.getByRole('button', { name: /^options$/i }) as HTMLElement, 'header Options')
    expectInlineMinTouch(screen.getByRole('button', { name: /^actions/i }) as HTMLElement, 'header Actions')
    const userBtn = screen.getByRole('button', { name: /menu utilisateur testuser/i }) as HTMLElement
    expect(userBtn.style.width).toBe(`${TOUCH_TARGET_MIN_PX}px`)
    expect(userBtn.style.height).toBe(`${TOUCH_TARGET_MIN_PX}px`)
  })

  it('Tabs segmentés : minHeight / minWidth 44px sur les boutons', () => {
    render(
      <Tabs
        variant="segmented"
        activeTabId="a"
        onTabChange={() => {}}
        tabs={[
          { id: 'a', label: 'Onglet A', content: <div /> },
          { id: 'b', label: 'Onglet B', content: <div /> },
        ]}
      />
    )
    expectInlineMinTouch(screen.getByRole('button', { name: 'Onglet A' }) as HTMLElement, 'tab A')
  })

  it('GraphEditorHeader : confortable (large) min 44px', () => {
    const toolbar = makeMockToolbar()
    render(
      <div style={{ width: '900px' }}>
        <GraphEditorHeader
          toolbar={toolbar}
          isLoadingDialogue={false}
          hasActiveDialogue={true}
          activeDialogueTitle="T"
          activeDialogueFilename="f.json"
          handleSave={async () => {}}
          onBatchTagApply={() => {}}
          handleBatchValidateSelection={() => {}}
          handleBatchDeleteSelection={() => {}}
          canEditGraph={true}
          isStandalone={false}
        />
      </div>
    )
    expectInlineMinTouch(screen.getByTestId('btn-undo'), 'graph toolbar Undo')
    expectInlineMinTouch(screen.getByTestId('btn-actions-dropdown'), 'graph toolbar Actions')
    expectInlineMinTouch(screen.getByTestId('btn-search-graph'), 'graph toolbar Rechercher')
    const costBtn = screen
      .getByTitle('Afficher le breakdown des coûts LLM pour ce dialogue')
      .closest('button') as HTMLElement
    expectInlineMinTouch(costBtn, 'graph toolbar Coûts')
    const shortcutsBtn = screen.getByTitle('Raccourcis du graphe').closest('button') as HTMLElement
    expect(shortcutsBtn.style.minHeight).toBe(`${TOUCH_TARGET_MIN_PX}px`)
    expect(shortcutsBtn.style.minWidth).toBe(`${TOUCH_TARGET_MIN_PX}px`)
  })

  it('GraphEditorHeader : narrow (écran réduit) cible tactile réduite', () => {
    const toolbar = makeMockToolbar()
    render(
      <div style={{ width: '320px' }}>
        <GraphEditorHeader
          toolbar={toolbar}
          isLoadingDialogue={false}
          hasActiveDialogue={true}
          activeDialogueTitle="T"
          activeDialogueFilename="f.json"
          handleSave={async () => {}}
          onBatchTagApply={() => {}}
          handleBatchValidateSelection={() => {}}
          handleBatchDeleteSelection={() => {}}
          canEditGraph={true}
          isStandalone={false}
        />
      </div>
    )
    const narrowMin = graphToolbarChrome.narrow.touchMinPx
    expectInlineMinTouchPx(screen.getByTestId('btn-undo'), 'graph toolbar Undo (narrow)', narrowMin)
    expectInlineMinTouchPx(
      screen.getByTestId('btn-actions-dropdown'),
      'graph toolbar Actions (narrow)',
      narrowMin
    )
    expectInlineMinTouchPx(
      screen.getByTestId('btn-search-graph'),
      'graph toolbar Rechercher (narrow)',
      narrowMin
    )
    const costBtn = screen
      .getByTitle('Afficher le breakdown des coûts LLM pour ce dialogue')
      .closest('button') as HTMLElement
    expectInlineMinTouchPx(costBtn, 'graph toolbar Coûts (narrow)', narrowMin)
    const shortcutsBtn = screen.getByTitle('Raccourcis du graphe').closest('button') as HTMLElement
    expect(shortcutsBtn.style.minHeight).toBe(`${narrowMin}px`)
    expect(shortcutsBtn.style.minWidth).toBe(`${narrowMin}px`)
  })

  it('Dashboard mobile : onglet Éditeur de graphe actif (chemin utilisateur FR119)', async () => {
    const user = userEvent.setup()
    const { Dashboard } = await import('../components/layout/Dashboard')
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
    await user.click(screen.getByRole('button', { name: /éditeur de graphe/i }))
    expect(screen.getByTestId('graph-editor')).toBeInTheDocument()
  })

  it('Dashboard mobile : boutons Déplier + onglet central min 44px (styles inline)', async () => {
    const { Dashboard } = await import('../components/layout/Dashboard')
    Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: 320 })
    window.dispatchEvent(new Event('resize'))

    render(
      <BrowserRouter>
        <Dashboard />
      </BrowserRouter>
    )

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /déplier le panneau gauche/i })).toBeInTheDocument()
    })
    expectInlineMinTouch(
      screen.getByRole('button', { name: /déplier le panneau gauche/i }) as HTMLElement,
      'expand left'
    )
    expectInlineMinTouch(
      screen.getByRole('button', { name: /déplier le panneau droit/i }) as HTMLElement,
      'expand right'
    )
    expectInlineMinTouch(
      screen.getByRole('button', { name: /génération de dialogues/i }) as HTMLElement,
      'center segmented tab'
    )
  })
})
