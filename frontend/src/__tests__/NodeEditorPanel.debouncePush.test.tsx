/**
 * Tests ADR-006 : panneau Détails pousse les champs éditables vers le store à la saisie (debounce ≤ 100 ms).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NodeEditorPanel } from '../components/graph/NodeEditorPanel'
import { useGraphStore } from '../store/graphStore'
import { useContextStore } from '../store/contextStore'
import { ReactFlowProvider } from 'reactflow'

vi.mock('../store/graphStore', () => ({
  useGraphStore: vi.fn(),
}))

vi.mock('../store/contextStore', () => ({
  useContextStore: vi.fn(),
}))

vi.mock('../api/config', () => ({
  listLLMModels: vi.fn().mockResolvedValue({ models: [] }),
}))

vi.mock('../components/shared', () => ({
  useToast: () => ({ show: vi.fn() }),
}))

describe('NodeEditorPanel - ADR-006 debounce push to store', () => {
  const mockDialogueNode = {
    id: 'START',
    type: 'dialogueNode' as const,
    data: {
      id: 'START',
      speaker: 'NPC',
      line: 'Hello',
      choices: [] as { text: string; targetNode?: string }[],
      nextNode: '',
    },
  }

  let updateNodeMock: ReturnType<typeof vi.fn>
  let mockState: ReturnType<typeof useGraphStore>

  beforeEach(() => {
    updateNodeMock = vi.fn()
    mockState = {
      selectedNodeId: 'START',
      nodes: [mockDialogueNode],
      edges: [],
      updateNode: updateNodeMock,
      deleteNode: vi.fn(),
      generateFromNode: vi.fn(),
      isGenerating: false,
      setSelectedNode: vi.fn(),
      setShowDeleteNodeConfirm: vi.fn(),
      createEmptyNode: vi.fn(),
      addNode: vi.fn(),
      connectNodes: vi.fn(),
      disconnectNodes: vi.fn(),
    } as ReturnType<typeof useGraphStore>
    vi.mocked(useGraphStore).mockImplementation((selector?: (s: typeof mockState) => unknown) => {
      if (typeof selector === 'function') return selector(mockState)
      return mockState
    })
    ;(useGraphStore as { getState: () => typeof mockState }).getState = vi.fn(() => mockState)

    vi.mocked(useContextStore).mockReturnValue({
      selections: {},
    } as ReturnType<typeof useContextStore>)
  })

  it('should push speaker input to store after debounce (≤ 100 ms)', async () => {
    render(
      <ReactFlowProvider>
        <NodeEditorPanel />
      </ReactFlowProvider>
    )

    const speakerInput = screen.getByPlaceholderText('Nom du personnage')
    await userEvent.type(speakerInput, 'X')

    await waitFor(
      () => {
        expect(updateNodeMock).toHaveBeenCalledWith(
          'START',
          expect.objectContaining({
            data: expect.objectContaining({
              speaker: 'NPCX',
            }),
          })
        )
      },
      { timeout: 300 }
    )
  })

  it('should push line (dialogue) input to store after debounce (≤ 100 ms)', async () => {
    render(
      <ReactFlowProvider>
        <NodeEditorPanel />
      </ReactFlowProvider>
    )

    const lineInput = screen.getByPlaceholderText('Texte du dialogue...')
    await userEvent.type(lineInput, '!')

    await waitFor(
      () => {
        expect(updateNodeMock).toHaveBeenCalledWith(
          'START',
          expect.objectContaining({
            data: expect.objectContaining({
              line: 'Hello!',
            }),
          })
        )
      },
      { timeout: 300 }
    )
  })
})
