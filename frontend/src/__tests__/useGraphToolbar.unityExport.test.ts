/**
 * Story 5.1 FR49 — export Unity bloquant sur validation schéma + écriture serveur.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import type { Node } from 'reactflow'
import { useGraphToolbar } from '../hooks/useGraphToolbar'
import { useGraphStore } from '../store/graphStore'
import * as graphAPI from '../api/graph'
import { EXPORT_VALIDATION_BLOCKED_MESSAGE } from '../utils/graphApiErrors'
import { useGraphViewStore } from '../store/graphViewStore'

vi.mock('../api/graph', () => ({
  loadGraph: vi.fn(),
  saveGraph: vi.fn(),
  saveGraphAndWrite: vi.fn(),
  validateSchema: vi.fn(),
  generateNode: vi.fn(),
  validateGraph: vi.fn(),
  calculateLayout: vi.fn(),
}))

const toastMock = vi.fn()
const handleSaveMock = vi.fn().mockResolvedValue(undefined)

const VALID_NODE_ID = 'node-a1b2c3d4e5f6789012345678abcdef01'

function seedValidGraph(): void {
  const node: Node = {
    id: VALID_NODE_ID,
    type: 'dialogueNode',
    position: { x: 0, y: 0 },
    data: {
      stableId: VALID_NODE_ID,
      displayName: 'Ouverture',
      line: 'Bonjour',
      speaker: 'PNJ',
      choices: [{ choiceId: 'choice_reply', text: 'Répondre' }],
    },
  }
  const endNode: Node = {
    id: 'END',
    type: 'endNode',
    position: { x: 0, y: 200 },
    data: { line: '' },
  }
  useGraphStore.getState().resetGraph()
  useGraphStore.getState().addNode(node)
  useGraphStore.getState().addNode(endNode)
  useGraphStore.setState({
    dialogueMetadata: {
      title: 'Test Export',
      filename: 'test_export.json',
      node_count: 2,
      edge_count: 1,
    },
  })
}

describe('useGraphToolbar handleExportUnity (Story 5.1)', () => {
  beforeEach(() => {
    useGraphStore.getState().resetGraph()
    useGraphViewStore.getState().registerReactFlowInstance(null)
    toastMock.mockClear()
    handleSaveMock.mockClear()
    vi.mocked(graphAPI.validateSchema).mockReset()
    vi.mocked(graphAPI.saveGraphAndWrite).mockReset()
  })

  it('blocks export when schema invalid — toast, panel, no saveGraphAndWrite', async () => {
    seedValidGraph()
    vi.mocked(graphAPI.validateSchema).mockResolvedValue({
      is_valid: false,
      errors: ['[nodes.0.choices.0] choiceId is required'],
      error_count: 1,
    })

    const { result } = renderHook(() =>
      useGraphToolbar(toastMock, 'test_export.json', handleSaveMock, false)
    )

    await act(async () => {
      await result.current.handleExportUnity()
    })

    expect(graphAPI.saveGraphAndWrite).not.toHaveBeenCalled()
    expect(toastMock).toHaveBeenCalledWith(EXPORT_VALIDATION_BLOCKED_MESSAGE, 'error')
    expect(result.current.showSchemaValidationPanel).toBe(true)
    expect(result.current.schemaValidationIsValid).toBe(false)
    expect(result.current.schemaValidationErrors.length).toBeGreaterThan(0)
  })

  it('focuses node when schema error clicked ([nodes.N...])', async () => {
    seedValidGraph()
    const focusSpy = vi.spyOn(useGraphViewStore.getState(), 'focusNode')

    const { result } = renderHook(() =>
      useGraphToolbar(toastMock, 'test_export.json', handleSaveMock, false)
    )

    act(() => {
      result.current.handleSchemaIssueClick({
        code: 'missing_choice_id',
        message: '[nodes.0.choices.0] choiceId is required',
        path: 'nodes.0.choices.0',
      })
    })

    expect(focusSpy).toHaveBeenCalledWith(VALID_NODE_ID)
    focusSpy.mockRestore()
  })

  it('successful export calls saveGraphAndWrite and shows success toast', async () => {
    seedValidGraph()
    vi.mocked(graphAPI.validateSchema).mockResolvedValue({
      is_valid: true,
      errors: [],
      error_count: 0,
    })
    vi.mocked(graphAPI.saveGraphAndWrite).mockResolvedValue({
      success: true,
      filename: 'Test_Export.json',
      json_content: '{"schemaVersion":"1.1.0","nodes":[]}',
    })

    const { result } = renderHook(() =>
      useGraphToolbar(toastMock, 'test_export.json', handleSaveMock, false)
    )

    await act(async () => {
      await result.current.handleExportUnity()
    })

    expect(graphAPI.saveGraphAndWrite).toHaveBeenCalledTimes(1)
    expect(toastMock).toHaveBeenCalledWith('Dialogue exporté : Test_Export.json', 'success', 3000)
  })

  it('repeated export always calls saveGraphAndWrite (no seq skip)', async () => {
    seedValidGraph()
    vi.mocked(graphAPI.validateSchema).mockResolvedValue({
      is_valid: true,
      errors: [],
      error_count: 0,
    })
    vi.mocked(graphAPI.saveGraphAndWrite).mockResolvedValue({
      success: true,
      filename: 'Test_Export.json',
      json_content: '{"schemaVersion":"1.1.0","nodes":[]}',
    })

    const { result } = renderHook(() =>
      useGraphToolbar(toastMock, 'test_export.json', handleSaveMock, false)
    )

    await act(async () => {
      await result.current.handleExportUnity()
      await result.current.handleExportUnity()
    })

    expect(graphAPI.saveGraphAndWrite).toHaveBeenCalledTimes(2)
    const firstCall = vi.mocked(graphAPI.saveGraphAndWrite).mock.calls[0][0]
    const secondCall = vi.mocked(graphAPI.saveGraphAndWrite).mock.calls[1][0]
    expect(firstCall).not.toHaveProperty('seq')
    expect(secondCall).not.toHaveProperty('seq')
  })

  it('unity path missing shows explicit error and skips write', async () => {
    seedValidGraph()
    vi.mocked(graphAPI.validateSchema).mockResolvedValue({
      is_valid: true,
      errors: [],
      error_count: 0,
    })
    vi.mocked(graphAPI.saveGraphAndWrite).mockRejectedValue({
      response: {
        data: {
          error: {
            message: 'Le chemin Unity dialogues n\'est pas configuré.',
            details: { field: 'unity_dialogues_path' },
          },
        },
      },
    })

    const { result } = renderHook(() =>
      useGraphToolbar(toastMock, 'test_export.json', handleSaveMock, false)
    )

    await act(async () => {
      await result.current.handleExportUnity()
    })

    expect(toastMock).toHaveBeenCalledWith(
      expect.stringContaining('chemin Unity'),
      'error'
    )
  })
})
