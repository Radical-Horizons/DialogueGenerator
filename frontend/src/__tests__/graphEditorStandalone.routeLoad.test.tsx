import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { GraphEditor } from '../components/graph/GraphEditor'
import { useGraphStore } from '../store/graphStore'

const { toastMock } = vi.hoisted(() => ({ toastMock: vi.fn() }))

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

vi.mock('../components/shared', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>
  return {
    ...actual,
    useToast: () => toastMock,
    SaveStatusIndicator: () =>
      React.createElement('div', { 'data-testid': 'save-status-indicator' }),
    ConfirmDialog: () => null,
  }
})

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

const { getUnityDialogueMock } = vi.hoisted(() => ({
  getUnityDialogueMock: vi.fn(),
}))

vi.mock('../api/unityDialogues', () => ({
  listUnityDialogues: vi.fn().mockResolvedValue({ dialogues: [], total: 0 }),
  getUnityDialogue: (...args: unknown[]) => getUnityDialogueMock(...args),
  deleteUnityDialogue: vi.fn().mockResolvedValue(undefined),
  previewUnityDialogue: vi.fn().mockResolvedValue({ preview_text: '', node_count: 0 }),
}))

vi.mock('../api/documents', () => ({
  getDocument: vi.fn().mockRejectedValue(new Error('no document')),
  getLayout: vi.fn().mockRejectedValue(new Error('no layout')),
  putDocument: vi.fn().mockResolvedValue({ revision: 2 }),
  putLayout: vi.fn().mockResolvedValue({ revision: 2 }),
}))

const { validateSchemaMock, saveGraphAndWriteMock } = vi.hoisted(() => ({
  validateSchemaMock: vi.fn(),
  saveGraphAndWriteMock: vi.fn(),
}))

vi.mock('../api/graph', () => ({
  loadGraph: vi.fn(),
  saveGraph: vi.fn(),
  saveGraphAndWrite: (...args: unknown[]) => saveGraphAndWriteMock(...args),
  validateSchema: (...args: unknown[]) => validateSchemaMock(...args),
  generateNode: vi.fn(),
  validateGraph: vi.fn(),
  calculateLayout: vi.fn(),
}))

function makeQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } })
}

function renderGraphEditor(props?: Partial<React.ComponentProps<typeof GraphEditor>>) {
  const queryClient = makeQueryClient()
  return render(
    React.createElement(
      QueryClientProvider,
      { client: queryClient },
      React.createElement(GraphEditor, props ?? {})
    )
  )
}

describe('GraphEditor standalone mode', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    toastMock.mockReset()
    validateSchemaMock.mockReset()
    saveGraphAndWriteMock.mockReset()
    useGraphStore.getState().resetGraph()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("charge un dialogue depuis l'URL standalone", async () => {
    const loadDialogueByDocumentIdMock = vi.fn().mockRejectedValue({
      response: { status: 404 },
    })
    const validateGraphMock = vi.fn().mockResolvedValue(undefined)

    getUnityDialogueMock.mockResolvedValue({
      json_content: '[{"id":"START","speaker":"PNJ","line":"Bonjour","choices":[]}]',
    })

    useGraphStore.setState(
      {
        ...useGraphStore.getState(),
        nodes: [],
        edges: [],
        dialogueMetadata: {
          title: 'Nouveau Dialogue',
          node_count: 0,
          edge_count: 0,
        },
        loadDialogueByDocumentId: loadDialogueByDocumentIdMock,
        validateGraph: validateGraphMock,
      },
      true
    )

    renderGraphEditor({
      mode: 'standalone',
      routeDialogueId: 'route%20dialogue.json',
    })

    await waitFor(() => {
      expect(getUnityDialogueMock).toHaveBeenCalledWith('route dialogue.json')
    })
    expect(loadDialogueByDocumentIdMock).toHaveBeenCalled()
    await waitFor(() => {
      expect(useGraphStore.getState().nodes.some((n) => n.id === 'START')).toBe(true)
    })
    expect(useGraphStore.getState().dialogueMetadata.filename).toBe('route dialogue')
    expect(validateGraphMock).toHaveBeenCalled()
  })

  it("fallback vers un dialogue Unity legacy quand l'URL standalone est sans extension", async () => {
    const loadDialogueByDocumentIdMock = vi.fn().mockRejectedValue({
      response: { status: 404 },
    })
    const validateGraphMock = vi.fn().mockResolvedValue(undefined)

    getUnityDialogueMock.mockResolvedValue({
      json_content: '[{"id":"START","speaker":"Guide","line":"Fallback","choices":[]}]',
    })

    useGraphStore.setState(
      {
        ...useGraphStore.getState(),
        nodes: [],
        edges: [],
        dialogueMetadata: {
          title: 'Nouveau Dialogue',
          node_count: 0,
          edge_count: 0,
        },
        loadDialogueByDocumentId: loadDialogueByDocumentIdMock,
        validateGraph: validateGraphMock,
      },
      true
    )

    renderGraphEditor({
      mode: 'standalone',
      routeDialogueId: 'route-dialogue',
    })

    await waitFor(() => {
      expect(loadDialogueByDocumentIdMock).toHaveBeenCalledWith('route-dialogue')
    })
    expect(getUnityDialogueMock).toHaveBeenCalledWith('route-dialogue.json')
    await waitFor(() => {
      expect(useGraphStore.getState().nodes.some((n) => n.id === 'START')).toBe(true)
    })
    expect(useGraphStore.getState().dialogueMetadata.filename).toBe('route-dialogue')
    expect(validateGraphMock).toHaveBeenCalled()
  })

  it('exporte le JSON Unity courant via bannière Télécharger (Story 5.4)', async () => {
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

    validateSchemaMock.mockResolvedValue({ is_valid: true, errors: [], error_count: 0 })
    saveGraphAndWriteMock.mockResolvedValue({
      success: true,
      filename: 'quest_arc.json',
      json_content: '{"schemaVersion":"1.1.0","nodes":[{"id":"START"}]}',
    })

    useGraphStore.setState(
      {
        ...useGraphStore.getState(),
        nodes: [
          {
            id: 'START',
            type: 'dialogueNode',
            position: { x: 0, y: 0 },
            data: {
              stableId: 'node-a1b2c3d4e5f6789012345678abcdef01',
              displayName: 'Ouverture',
              line: 'Bonjour',
              speaker: 'PNJ',
              choices: [{ choiceId: 'choice_reply', text: 'Répondre' }],
            },
          },
          {
            id: 'END',
            type: 'endNode',
            position: { x: 0, y: 200 },
            data: { line: '' },
          },
        ],
        dialogueMetadata: {
          title: 'Quest Arc',
          filename: 'quest_arc',
          node_count: 1,
          edge_count: 0,
        },
      },
      true
    )

    renderGraphEditor()

    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: /actions/i }))
    await user.click(screen.getByRole('menuitem', { name: /export unity/i }))

    const downloadBanner = await screen.findByTestId('export-download-banner')
    expect(downloadBanner).toBeTruthy()
    expect(screen.getByTestId('export-download-filename')).toHaveTextContent('quest_arc.json')

    await user.click(screen.getByTestId('export-download-button'))

    expect(createObjectURLMock).toHaveBeenCalledOnce()
    expect(anchor.download).toBe('quest_arc.json')
    expect(anchorClickSpy).toHaveBeenCalledOnce()

    createElementSpy.mockRestore()
    vi.unstubAllGlobals()
  })
})
