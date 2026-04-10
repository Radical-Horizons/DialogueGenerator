import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act, waitFor } from '@testing-library/react'
import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { GraphState } from '../store/graphStore'
import { useGraphStore } from '../store/graphStore'
import { GraphEditor } from '../components/graph/GraphEditor'

const toastMock = vi.fn()

function makeQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } })
}

vi.mock('../components/graph/GraphCanvas', () => ({
  GraphCanvas: () => React.createElement('div', { 'data-testid': 'graph-canvas' }),
}))

vi.mock('../components/graph/AIGenerationPanel', () => ({
  AIGenerationPanel: () => null,
}))

vi.mock('../components/graph/DeleteNodeConfirmModal', () => ({
  DeleteNodeConfirmModal: () => null,
}))

vi.mock('../components/graph/JumpToNodeModal', () => ({
  JumpToNodeModal: () => null,
}))

vi.mock('../components/graph/GraphFiltersPanel', () => ({
  GraphFiltersPanel: () => null,
}))

vi.mock('../components/usage/DialogueCostBreakdown', () => ({
  DialogueCostBreakdown: () => null,
}))

vi.mock('../utils/graphExport', () => ({
  exportGraphToPNG: vi.fn(),
  exportGraphToSVG: vi.fn(),
}))

vi.mock('../hooks/useKeyboardShortcuts', () => ({
  useKeyboardShortcuts: () => undefined,
}))

vi.mock('../components/unityDialogues/UnityDialogueList', () => ({
  UnityDialogueList: React.forwardRef(function UnityDialogueListMock() {
    return React.createElement('div', { 'data-testid': 'unity-dialogue-list' })
  }),
}))

vi.mock('../components/shared', () => ({
  useToast: () => toastMock,
  SaveStatusIndicator: () => null,
  ConfirmDialog: ({
    isOpen,
    title,
    message,
    confirmLabel = 'Confirmer',
    cancelLabel = 'Annuler',
    onConfirm,
    onCancel,
  }: {
    isOpen: boolean
    title: string
    message: string
    confirmLabel?: string
    cancelLabel?: string
    onConfirm: () => void
    onCancel: () => void
  }) =>
    isOpen
      ? React.createElement(
          'div',
          { role: 'dialog', 'aria-label': title },
          React.createElement('div', null, message),
          React.createElement('button', { onClick: onCancel }, cancelLabel),
          React.createElement('button', { onClick: onConfirm }, confirmLabel)
        )
      : null,
}))

function renderGraphEditor() {
  const queryClient = makeQueryClient()
  return render(
    React.createElement(
      QueryClientProvider,
      { client: queryClient },
      React.createElement(GraphEditor)
    )
  )
}

describe('GraphEditor multi-selection toolbar (Story 2.10)', () => {
  beforeEach(() => {
    toastMock.mockReset()
    useGraphStore.getState().resetGraph()
    useGraphStore.setState({
      nodes: [
        {
          id: 'n1',
          type: 'dialogueNode',
          position: { x: 0, y: 0 },
          data: { id: 'n1', line: 'Hello' },
        },
        {
          id: 'n2',
          type: 'dialogueNode',
          position: { x: 100, y: 0 },
          data: { id: 'n2', line: 'World' },
        },
      ],
      edges: [],
      selectedNodeId: 'n1',
      selectedNodeIds: ['n1', 'n2'],
      isLoading: false,
      isSaving: false,
      isGenerating: false,
      hasUnsavedChanges: false,
      validationErrors: [],
    } satisfies Partial<GraphState>)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('shows the multi-selection badge and batch operation buttons', () => {
    renderGraphEditor()

    expect(screen.getByText('2 nœuds sélectionnés')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Tagger sélection' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Valider sélection' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Supprimer sélection' })).toBeInTheDocument()
  })

  it('tags all selected nodes and shows the confirmation toast', async () => {
    renderGraphEditor()

    await act(async () => {
      screen.getByRole('button', { name: 'Tagger sélection' }).click()
    })
    await act(async () => {
      screen.getByRole('option', { name: 'À réviser' }).click()
    })

    expect((useGraphStore.getState().nodes.find((node) => node.id === 'n1')?.data as Record<string, unknown>).tag).toBe('À réviser')
    expect((useGraphStore.getState().nodes.find((node) => node.id === 'n2')?.data as Record<string, unknown>).tag).toBe('À réviser')
    expect(toastMock).toHaveBeenCalledWith('Opération appliquée à 2 nœuds', 'success', 3000)
  })

  it('validates the selected nodes and reports selected issues in the toast', async () => {
    const validateGraphMock: GraphState['validateGraph'] = vi.fn().mockImplementation(async () => {
      useGraphStore.setState({
        validationErrors: [
          {
            node_id: 'n1',
            severity: 'warning',
            message: 'Warn',
            type: 'missing_dialogue_text',
          },
        ] as GraphState['validationErrors'],
      })
    })

    useGraphStore.setState({ validateGraph: validateGraphMock } satisfies Partial<GraphState>)

    renderGraphEditor()

    await act(async () => {
      screen.getByRole('button', { name: 'Valider sélection' }).click()
    })

    await waitFor(() => {
      expect(validateGraphMock).toHaveBeenCalled()
      expect(toastMock).toHaveBeenCalledWith(
        'Opération appliquée à 2 nœuds (1 signalement)',
        'warning',
        3000
      )
    })
  })

  it('confirms batch delete, deletes all selected nodes and clears the selection', async () => {
    renderGraphEditor()

    await act(async () => {
      screen.getByRole('button', { name: 'Supprimer sélection' }).click()
    })

    expect(screen.getByRole('dialog', { name: 'Supprimer les nœuds sélectionnés' })).toBeInTheDocument()
    expect(screen.getByText('Supprimer 2 nœuds ?')).toBeInTheDocument()

    await act(async () => {
      screen.getByRole('button', { name: 'Supprimer' }).click()
    })

    expect(useGraphStore.getState().nodes).toHaveLength(0)
    expect(useGraphStore.getState().selectedNodeIds).toEqual([])
    expect(useGraphStore.getState().selectedNodeId).toBeNull()
    expect(toastMock).toHaveBeenCalledWith('2 nœuds supprimés', 'success', 3000)
  })
})
