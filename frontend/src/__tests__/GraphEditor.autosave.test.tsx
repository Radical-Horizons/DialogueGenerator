import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, act } from '@testing-library/react'
import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { Node, Edge } from 'reactflow'
import { GraphEditor } from '../components/graph/GraphEditor'
import { useGraphStore, type GraphState } from '../store/graphStore'
import type { SaveGraphResponse } from '../types/graph'

function makeQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } })
}

// Mock composants lourds / non pertinents pour l'autosave
vi.mock('../components/graph/GraphCanvas', () => ({
  GraphCanvas: () => React.createElement('div', { 'data-testid': 'graph-canvas' }),
}))

vi.mock('../components/graph/AIGenerationPanel', () => ({
  AIGenerationPanel: () => null,
}))

vi.mock('../components/graph/DeleteNodeConfirmModal', () => ({
  DeleteNodeConfirmModal: () => null,
}))

vi.mock('../utils/graphExport', () => ({
  exportGraphToPNG: vi.fn(),
  exportGraphToSVG: vi.fn(),
}))

vi.mock('../hooks/useKeyboardShortcuts', () => ({
  useKeyboardShortcuts: () => undefined,
}))

// Mock UnityDialogueList: sélectionne automatiquement un dialogue au montage
vi.mock('../components/unityDialogues/UnityDialogueList', () => {
  type UnityDialogueListRef = { refresh: () => void }
  type UnityDialogueListItem = {
    filename: string
    title: string
    modified_time: string
    size_bytes: number
  }
  type UnityDialogueListProps = {
    onSelectDialogue: (item: UnityDialogueListItem) => void
  }
  return {
    UnityDialogueList: React.forwardRef(function UnityDialogueListMock(
      props: UnityDialogueListProps,
      ref: React.ForwardedRef<UnityDialogueListRef>
    ) {
      const { onSelectDialogue } = props

      React.useImperativeHandle(ref, () => ({ refresh: () => undefined }))
      const didSelectRef = React.useRef(false)
      React.useEffect(() => {
        if (didSelectRef.current) return
        didSelectRef.current = true
        onSelectDialogue({
          filename: 'Dialogue_Unity.json',
          title: 'Dialogue Unity',
          modified_time: new Date().toISOString(),
          size_bytes: 123,
        })
      }, [onSelectDialogue])
      return React.createElement('div', { 'data-testid': 'unity-dialogue-list' })
    }),
  }
})

// Mock API unityDialogues: évite réseau
vi.mock('../api/unityDialogues', () => ({
  getUnityDialogue: vi.fn().mockResolvedValue({
    json_content: [
      { id: 'START', speaker: 'PNJ', line: 'Hello', choices: [] },
      { id: 'END', line: '' },
    ],
  }),
}))

describe('GraphEditor autosave (ADR-006)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    // Reset store à un état minimal et contrôlé.
    useGraphStore.setState({
      nodes: [
        { id: 'START', type: 'dialogueNode', position: { x: 0, y: 0 }, data: { id: 'START', speaker: 'PNJ', line: 'Hello', choices: [] } },
        { id: 'END', type: 'endNode', position: { x: 0, y: 150 }, data: { id: 'END', line: '' } },
      ] satisfies Node[],
      edges: [] satisfies Edge[],
      isLoading: false,
      isSaving: false,
      isGenerating: false,
      hasUnsavedChanges: true,
      lastSaveError: null,
    } satisfies Partial<GraphState>)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('déclenche saveDialogue automatiquement quand hasUnsavedChanges=true et dialogue sélectionné', async () => {
    const saveDialogueMock: GraphState['saveDialogue'] = vi
      .fn()
      .mockResolvedValue({ success: true, filename: 'doc' } as SaveGraphResponse)
    const loadDialogueMock: GraphState['loadDialogue'] = vi.fn().mockResolvedValue(undefined)
    const validateGraphMock: GraphState['validateGraph'] = vi.fn().mockResolvedValue(undefined)

    useGraphStore.setState({
      saveDialogue: saveDialogueMock,
      loadDialogue: loadDialogueMock,
      validateGraph: validateGraphMock,
      // Empêcher l'effet autosave de sortir prématurément
      isLoading: false,
      isSaving: false,
      isGenerating: false,
      hasUnsavedChanges: true,
    } satisfies Partial<GraphState>)

    const queryClient = makeQueryClient()
    render(
      React.createElement(QueryClientProvider, { client: queryClient },
        React.createElement(GraphEditor)
      )
    )

    // L'effet autosave est bloqué pendant le chargement du dialogue (isLoadingDialogue interne).
    // On laisse d'abord la chaîne de promesses (getUnityDialogue -> loadDialogue -> validateGraph) se résoudre.
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    // Puis, l'effet autosave dans GraphEditor est un setTimeout(100ms).
    await act(async () => {
      await vi.advanceTimersByTimeAsync(250)
    })

    expect(saveDialogueMock).toHaveBeenCalled()
  })
})

