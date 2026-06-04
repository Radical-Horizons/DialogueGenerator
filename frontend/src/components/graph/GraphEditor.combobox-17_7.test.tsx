/**
 * Tests Story 17.7 — onglet Éditeur de Graphe : suppression de la colonne liste
 * en mode narrow et présence du combobox dans le header de toolbar.
 *
 * On mocke `useNarrowInlineSize` (Cf. dette technique 17.8) pour rendre le
 * test déterministe et rapide ; le calcul réel est couvert ailleurs.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import {
  PANEL_COMFORT_MIN_WIDTH_PX,
  GRAPH_TOOLBAR_COMFORT_MIN_WIDTH_PX,
} from '../../theme/responsiveChrome'

let mockGraphEditorNarrow = false

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
  nodes: [],
  edges: [],
  selectedNodeId: null,
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

vi.mock('../../store/graphViewStore', () => ({
  useGraphViewStore: vi.fn(() => ({
    showFiltersPanel: false,
    setShowFiltersPanel: vi.fn(),
  })),
}))

vi.mock('../../hooks/useDialogueLoader', () => ({
  useDialogueLoader: vi.fn(() => ({
    selectedDialogue: null,
    setSelectedDialogue: vi.fn(),
    isLoadingDialogue: false,
    activeDialogueFilename: null,
    activeDialogueTitle: undefined,
    hasActiveDialogue: false,
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
