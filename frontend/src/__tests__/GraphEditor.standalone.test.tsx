import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { GraphEditor } from '../components/graph/GraphEditor'
import { useGraphStore } from '../store/graphStore'

vi.mock('../components/graph/GraphCanvas', () => ({
  GraphCanvas: () => React.createElement('div', { 'data-testid': 'graph-canvas' }),
}))

vi.mock('../components/graph/AIGenerationPanel', () => ({
  AIGenerationPanel: () => null,
}))

vi.mock('../components/graph/DeleteNodeConfirmModal', () => ({
  DeleteNodeConfirmModal: () => null,
}))

vi.mock('../components/usage/DialogueCostBreakdown', () => ({
  DialogueCostBreakdown: () => null,
}))

vi.mock('../components/shared', () => ({
  useToast: () => vi.fn(),
  SaveStatusIndicator: () => React.createElement('div', { 'data-testid': 'save-status-indicator' }),
  ConfirmDialog: () => null,
}))

vi.mock('../utils/graphExport', () => ({
  exportGraphToPNG: vi.fn(),
  exportGraphToSVG: vi.fn(),
}))

vi.mock('../hooks/useKeyboardShortcuts', () => ({
  useKeyboardShortcuts: () => undefined,
}))

vi.mock('../components/unityDialogues/UnityDialogueList', () => ({
  UnityDialogueList: React.forwardRef(function UnityDialogueListMock(_props, ref) {
    React.useImperativeHandle(ref, () => ({ refresh: () => undefined }))
    return React.createElement('div', { 'data-testid': 'unity-dialogue-list' })
  }),
}))

const getUnityDialogueMock = vi.fn()
vi.mock('../api/unityDialogues', () => ({
  getUnityDialogue: (...args: unknown[]) => getUnityDialogueMock(...args),
}))

function makeQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } })
}

const baseGraphStoreState = useGraphStore.getState()

function renderGraphEditor(props?: Partial<React.ComponentProps<typeof GraphEditor>>) {
  const queryClient = makeQueryClient()
  return render(
    React.createElement(
      QueryClientProvider,
      { client: queryClient },
      React.createElement(GraphEditor, props)
    )
  )
}

describe('GraphEditor standalone mode', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useGraphStore.setState({ ...baseGraphStoreState }, true)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("charge un dialogue depuis l'URL standalone", async () => {
    const loadDialogueMock = vi.fn().mockResolvedValue(undefined)
    const loadDialogueByDocumentIdMock = vi.fn().mockResolvedValue(undefined)
    const validateGraphMock = vi.fn().mockResolvedValue(undefined)

    getUnityDialogueMock.mockResolvedValue({
      json_content: '[{"id":"START","speaker":"PNJ","line":"Bonjour","choices":[]}]',
    })

    useGraphStore.setState({
      ...useGraphStore.getState(),
      nodes: [],
      edges: [],
      dialogueMetadata: {
        title: 'Nouveau Dialogue',
        node_count: 0,
        edge_count: 0,
      },
      loadDialogue: loadDialogueMock,
      loadDialogueByDocumentId: loadDialogueByDocumentIdMock,
      validateGraph: validateGraphMock,
    }, true)

    renderGraphEditor({
      mode: 'standalone',
      routeDialogueId: 'route%20dialogue.json',
    })

    await waitFor(() => {
      expect(getUnityDialogueMock).toHaveBeenCalledWith('route dialogue.json')
    })
    expect(loadDialogueMock).toHaveBeenCalledWith(
      '[{"id":"START","speaker":"PNJ","line":"Bonjour","choices":[]}]',
      undefined,
      'route dialogue.json'
    )
    expect(loadDialogueByDocumentIdMock).not.toHaveBeenCalled()
    expect(validateGraphMock).toHaveBeenCalled()
  })

  it("fallback vers un dialogue Unity legacy quand l'URL standalone est sans extension", async () => {
    const loadDialogueMock = vi.fn().mockResolvedValue(undefined)
    const loadDialogueByDocumentIdMock = vi.fn().mockRejectedValue({
      response: { status: 404 },
    })
    const validateGraphMock = vi.fn().mockResolvedValue(undefined)

    getUnityDialogueMock.mockResolvedValue({
      json_content: '[{"id":"START","speaker":"Guide","line":"Fallback","choices":[]}]',
    })

    useGraphStore.setState({
      ...useGraphStore.getState(),
      nodes: [],
      edges: [],
      dialogueMetadata: {
        title: 'Nouveau Dialogue',
        node_count: 0,
        edge_count: 0,
      },
      loadDialogue: loadDialogueMock,
      loadDialogueByDocumentId: loadDialogueByDocumentIdMock,
      validateGraph: validateGraphMock,
    }, true)

    renderGraphEditor({
      mode: 'standalone',
      routeDialogueId: 'route-dialogue',
    })

    await waitFor(() => {
      expect(loadDialogueByDocumentIdMock).toHaveBeenCalledWith('route-dialogue')
    })
    expect(getUnityDialogueMock).toHaveBeenCalledWith('route-dialogue.json')
    expect(loadDialogueMock).toHaveBeenCalledWith(
      '[{"id":"START","speaker":"Guide","line":"Fallback","choices":[]}]',
      undefined,
      'route-dialogue.json'
    )
    expect(validateGraphMock).toHaveBeenCalled()
  })

  it('exporte le JSON Unity courant', async () => {
    const exportToUnityMock = vi.fn().mockReturnValue('{"ok":true}')
    const createObjectURLMock = vi.fn().mockReturnValue('blob:test-export')
    const revokeObjectURLMock = vi.fn()

    const originalCreateElement = document.createElement.bind(document)
    const anchor = originalCreateElement('a')
    const anchorClickSpy = vi.spyOn(anchor, 'click').mockImplementation(() => {})
    const createElementSpy = vi
      .spyOn(document, 'createElement')
      .mockImplementation(((tagName: string, options?: ElementCreationOptions) => {
        if (tagName.toLowerCase() === 'a') {
          return anchor
        }
        return originalCreateElement(tagName, options)
      }) as typeof document.createElement)

    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL: createObjectURLMock,
      revokeObjectURL: revokeObjectURLMock,
    })

    useGraphStore.setState({
      ...useGraphStore.getState(),
      nodes: [
        {
          id: 'START',
          type: 'dialogueNode',
          position: { x: 0, y: 0 },
          data: { id: 'START', speaker: 'PNJ', line: 'Bonjour', choices: [] },
        },
      ],
      dialogueMetadata: {
        title: 'Quest Arc',
        filename: 'quest_arc',
        node_count: 1,
        edge_count: 0,
      },
      exportToUnity: exportToUnityMock,
    }, true)

    renderGraphEditor()

    await userEvent.setup().click(screen.getByRole('button', { name: /export unity/i }))

    expect(exportToUnityMock).toHaveBeenCalled()
    expect(createObjectURLMock).toHaveBeenCalledOnce()
    expect(anchor.download).toBe('quest_arc.json')
    expect(anchor.href).toBe('blob:test-export')
    expect(anchorClickSpy).toHaveBeenCalledOnce()

    createElementSpy.mockRestore()
    vi.unstubAllGlobals()
  })
})
