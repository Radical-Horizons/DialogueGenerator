/**
 * Tests Story 17.7 — onglet Éditeur de Graphe : suppression de la colonne liste
 * en mode narrow et présence du combobox dans le header de toolbar.
 *
 * On mocke `useNarrowInlineSize` (Cf. dette technique 17.8) pour rendre le
 * test déterministe et rapide ; le calcul réel est couvert ailleurs.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import {
  PANEL_COMFORT_MIN_WIDTH_PX,
  GRAPH_TOOLBAR_COMFORT_MIN_WIDTH_PX,
} from '../../theme/responsiveChrome'

let mockGraphEditorNarrow = false
let mockHasActiveDialogue = false

vi.mock('../../hooks/useNarrowInlineSize', () => ({
  useNarrowInlineSize: vi.fn((threshold: number) => {
    const ref: { current: HTMLDivElement | null } = { current: null }
    if (threshold === PANEL_COMFORT_MIN_WIDTH_PX) {
      return { ref, isNarrow: mockGraphEditorNarrow }
    }
    if (threshold === GRAPH_TOOLBAR_COMFORT_MIN_WIDTH_PX) {
      return { ref, isNarrow: false }
    }
    return { ref, isNarrow: false }
  }),
}))

vi.mock('../../api/unityDialogues', () => ({
  listUnityDialogues: vi.fn().mockResolvedValue({ dialogues: [], total: 0 }),
  getUnityDialogue: vi.fn(),
  deleteUnityDialogue: vi.fn(),
  previewUnityDialogue: vi.fn(),
}))

vi.mock('./GraphCanvas', () => ({
  GraphCanvas: () => <div data-testid="graph-canvas-mock" />,
}))

vi.mock('./GraphFiltersPanel', () => ({
  GraphFiltersPanel: () => null,
}))

vi.mock('./GraphSearchBar', () => ({
  GraphSearchBar: () => null,
}))

vi.mock('./AIGenerationPanel', () => ({
  AIGenerationPanel: () => null,
}))

vi.mock('./DeleteNodeConfirmModal', () => ({
  DeleteNodeConfirmModal: () => null,
}))

vi.mock('./BatchValidationReportModal', () => ({
  BatchValidationReportModal: () => null,
}))

vi.mock('./DialogueCostModal', () => ({
  DialogueCostModal: () => null,
}))

vi.mock('./GraphExportFormatDialog', () => ({
  GraphExportFormatDialog: () => null,
}))

vi.mock('./JumpToNodeModal', () => ({
  JumpToNodeModal: () => null,
}))

vi.mock('./GraphValidationPanel', () => ({
  GraphValidationPanel: () => null,
}))

const graphStoreState = {
  nodes: [] as Array<{ id: string; type: string; position: { x: number; y: number }; data: Record<string, unknown> }>,
  edges: [],
  selectedNodeId: null as string | null,
  selectedNodeIds: [],
  validationErrors: [],
  intentionalCycles: [],
  isLoading: false,
  isSaving: false,
  hasUnsavedChanges: false,
  lastSaveError: null,
  lastSavedAt: null,
  syncStatus: 'idle',
  lastAckSeq: 0,
  dialogueMetadata: { filename: '', title: '' },
  undoStack: [],
  redoStack: [],
  createEmptyNode: vi.fn(),
  addNode: vi.fn(),
  setSelectedNode: vi.fn(),
  setHighlightedNodes: vi.fn(),
  exportToUnity: vi.fn(() => '[]'),
}

vi.mock('../../store/graphStore', () => ({
  useGraphStore: Object.assign(
    vi.fn((selector?: (s: typeof graphStoreState) => unknown) =>
      selector ? selector(graphStoreState) : graphStoreState,
    ),
    {
      getState: vi.fn(() => graphStoreState),
      setState: vi.fn(),
    },
  ),
}))

/** Demande d'édition directe posée par la création manuelle d'un nœud. */
const mockGraphView = { nodeEditRequest: null as string | null, clearNodeEditRequest: vi.fn() }
vi.mock('../../store/graphViewStore', () => ({
  useGraphViewStore: Object.assign(
    vi.fn(() => ({
      showFiltersPanel: false,
      setShowFiltersPanel: vi.fn(),
    })),
    { getState: () => mockGraphView },
  ),
}))

vi.mock('./NodeEditorPanel', () => ({
  NodeEditorPanel: () => <div data-testid="node-editor-panel-mock" />,
}))

vi.mock('./GraphInspectorNodeSummary', () => ({
  GraphInspectorNodeSummary: () => <div data-testid="node-summary-mock" />,
}))

vi.mock('../../hooks/useDialogueLoader', () => ({
  useDialogueLoader: vi.fn(() => ({
    selectedDialogue: null,
    setSelectedDialogue: vi.fn(),
    isLoadingDialogue: false,
    activeDialogueFilename: mockHasActiveDialogue ? 'scene.json' : null,
    activeDialogueTitle: undefined,
    hasActiveDialogue: mockHasActiveDialogue,
    handleSave: vi.fn().mockResolvedValue(undefined),
    dialogueListRef: { current: null },
  })),
}))

vi.mock('../../hooks/useGraphToolbar', () => ({
  useGraphToolbar: vi.fn(() => ({
    showAutoLayoutDropdown: false,
    setShowAutoLayoutDropdown: vi.fn(),
    showActionsDropdown: false,
    setShowActionsDropdown: vi.fn(),
    showAIGenerationPanel: false,
    setShowAIGenerationPanel: vi.fn(),
    showExportFormatDialog: false,
    setShowExportFormatDialog: vi.fn(),
    showValidationPanel: false,
    setShowValidationPanel: vi.fn(),
    showCostBreakdown: false,
    setShowCostBreakdown: vi.fn(),
    showShortcutsTooltip: false,
    setShowShortcutsTooltip: vi.fn(),
    showSearchBar: false,
    setShowSearchBar: vi.fn(),
    showJumpToNodeModal: false,
    setShowJumpToNodeModal: vi.fn(),
    showFiltersPanel: false,
    setShowFiltersPanel: vi.fn(),
    layoutDirection: 'TB',
    layoutSpacingMode: 'comfortable',
    setLayoutSpacingMode: vi.fn(),
    autoLayoutDropdownRef: { current: null },
    actionsDropdownRef: { current: null },
    actionsDropdownBtnRef: { current: null },
    canvasWrapperRef: { current: null },
    reactFlowInstance: null,
    handleAutoLayout: vi.fn().mockResolvedValue(undefined),
    handleOpenExportDialog: vi.fn(),
    handleExportPNG: vi.fn().mockResolvedValue(undefined),
    handleExportSVG: vi.fn().mockResolvedValue(undefined),
    undo: vi.fn(),
    redo: vi.fn(),
    canUndoNow: false,
    canRedoNow: false,
  })),
}))

vi.mock('../../hooks/useBatchOperations', () => ({
  useBatchOperations: vi.fn(() => ({
    selectedNodeIdsToDelete: null,
    handleBatchDeleteSelection: vi.fn(),
    handleConfirmBatchDelete: vi.fn(),
    handleCancelBatchDelete: vi.fn(),
    handleBatchTagSelection: vi.fn(),
    handleBatchValidateSelection: vi.fn(),
    showValidationReportForSelection: false,
    setShowValidationReportForSelection: vi.fn(),
  })),
}))

vi.mock('../shared', async (importActual) => {
  const actual = await importActual<typeof import('../shared')>()
  return {
    ...actual,
    useToast: vi.fn(() => vi.fn()),
    ConfirmDialog: () => null,
  }
})

vi.mock('@tanstack/react-query', async (importActual) => {
  const actual = await importActual<typeof import('@tanstack/react-query')>()
  return {
    ...actual,
    useQueryClient: vi.fn(() => ({
      invalidateQueries: vi.fn(),
    })),
  }
})

vi.mock('reactflow', () => ({
  ReactFlowProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

import { GraphEditor } from './GraphEditor'
import { useUiLayoutStore } from '../../store/uiLayoutStore'

describe('GraphEditor — 17.7 sélecteur de dialogue dans toolbar narrow', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGraphEditorNarrow = false
  })

  it('narrow: colonne liste absente, combobox présent dans le header', async () => {
    mockGraphEditorNarrow = true
    render(<GraphEditor />)

    expect(await screen.findByTestId('graph-editor-header-selector')).toBeInTheDocument()
    expect(screen.getByTestId('dialogue-combobox-trigger')).toBeInTheDocument()
    expect(screen.queryByTestId('unity-dialogue-list')).not.toBeInTheDocument()
  })

  it('desktop: colonne liste présente, combobox absent (non-régression)', async () => {
    mockGraphEditorNarrow = false
    render(<GraphEditor />)

    expect(await screen.findByTestId('unity-dialogue-list')).toBeInTheDocument()
    expect(screen.queryByTestId('graph-editor-header-selector')).not.toBeInTheDocument()
    expect(screen.queryByTestId('dialogue-combobox-trigger')).not.toBeInTheDocument()
  })
})

describe('GraphEditor — panneau vide sans dialogue (design system)', () => {
  it('étiquette mono « Graphe » puis une phrase, sans emoji ni icône', async () => {
    render(<GraphEditor />)

    const empty = await screen.findByTestId('graph-empty-state')
    expect(empty).toHaveTextContent(/^Graphe/)
    expect(empty).toHaveTextContent(/Sélectionnez un dialogue Unity dans la liste à gauche/)
    expect(empty.textContent ?? '').not.toMatch(/\p{Extended_Pictographic}/u)
    expect(empty.querySelector('svg, img')).toBeNull()
  })
})

describe('GraphEditor — inspecteur du nœud sélectionné (2e)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockHasActiveDialogue = true
    useUiLayoutStore.setState({ inspectorTab: 'node' })
    graphStoreState.nodes = [{ id: 'n1', type: 'dialogueNode', position: { x: 0, y: 0 }, data: { line: '' } }]
    graphStoreState.selectedNodeId = 'n1'
  })

  afterEach(() => {
    mockHasActiveDialogue = false
    mockGraphView.nodeEditRequest = null
    graphStoreState.nodes = []
    graphStoreState.selectedNodeId = null
  })

  it('un nœud existant s’ouvre en lecture', async () => {
    render(<GraphEditor />)

    expect(await screen.findByTestId('node-summary-mock')).toBeInTheDocument()
    expect(screen.queryByTestId('node-editor-panel-mock')).not.toBeInTheDocument()
  })

  it('un nœud créé à la main s’ouvre directement en édition (régression Story 1.6 AC#2)', async () => {
    mockGraphView.nodeEditRequest = 'n1'
    render(<GraphEditor />)

    expect(await screen.findByTestId('node-editor-panel-mock')).toBeInTheDocument()
    expect(screen.queryByTestId('node-summary-mock')).not.toBeInTheDocument()
    expect(mockGraphView.clearNodeEditRequest).toHaveBeenCalled()
  })

  it('une demande pour un autre nœud laisse la lecture', async () => {
    mockGraphView.nodeEditRequest = 'autre'
    render(<GraphEditor />)

    expect(await screen.findByTestId('node-summary-mock')).toBeInTheDocument()
  })
})
