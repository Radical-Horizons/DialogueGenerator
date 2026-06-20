/**
 * Story 5.5 FR53 — preview export graphe bloqué si schéma invalide.
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
  previewGraphExport: vi.fn(),
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
      title: 'Test Preview',
      filename: 'test_preview.json',
      node_count: 2,
      edge_count: 1,
    },
  })
}

describe('useGraphToolbar handlePreviewExport (Story 5.5)', () => {
  beforeEach(() => {
    useGraphStore.getState().resetGraph()
    useGraphViewStore.getState().registerReactFlowInstance(null)
    toastMock.mockClear()
    vi.mocked(graphAPI.validateSchema).mockReset()
    vi.mocked(graphAPI.previewGraphExport).mockReset()
    vi.mocked(graphAPI.saveGraphAndWrite).mockReset()
  })

  it('validation échouée — pas de modal preview, panneau schéma affiché', async () => {
    seedValidGraph()
    vi.mocked(graphAPI.validateSchema).mockResolvedValue({
      is_valid: false,
      errors: ['[nodes.0.choices.0] choiceId is required'],
      error_count: 1,
    })

    const { result } = renderHook(() =>
      useGraphToolbar(toastMock, 'test_preview.json', handleSaveMock, false),
    )

    await act(async () => {
      await result.current.handlePreviewExport()
    })

    expect(graphAPI.previewGraphExport).not.toHaveBeenCalled()
    expect(result.current.previewOpen).toBe(false)
    expect(toastMock).toHaveBeenCalledWith(EXPORT_VALIDATION_BLOCKED_MESSAGE, 'error')
    expect(result.current.showSchemaValidationPanel).toBe(true)
  })

  it('graphe valide — ouvre modal avec métadonnées preview', async () => {
    seedValidGraph()
    vi.mocked(graphAPI.validateSchema).mockResolvedValue({
      is_valid: true,
      errors: [],
      error_count: 0,
    })
    vi.mocked(graphAPI.previewGraphExport).mockResolvedValue({
      json_content: '{"schemaVersion":"1.1.0","nodes":[{"id":"START","line":"Hi","choices":[]}]}',
      size_bytes: 46080,
      node_count: 2,
      filename: 'Test_Preview.json',
      schema_valid: true,
      errors: [],
    })

    const { result } = renderHook(() =>
      useGraphToolbar(toastMock, 'test_preview.json', handleSaveMock, false),
    )

    await act(async () => {
      await result.current.handlePreviewExport()
    })

    expect(graphAPI.previewGraphExport).toHaveBeenCalledTimes(1)
    expect(result.current.previewOpen).toBe(true)
    expect(result.current.singlePreview?.node_count).toBe(2)
    expect(result.current.singlePreview?.json_content).toContain('"nodes"')
  })

  it('export depuis preview appelle save-and-write puis ferme modal', async () => {
    seedValidGraph()
    vi.mocked(graphAPI.validateSchema).mockResolvedValue({
      is_valid: true,
      errors: [],
      error_count: 0,
    })
    vi.mocked(graphAPI.previewGraphExport).mockResolvedValue({
      json_content: '{"schemaVersion":"1.1.0","nodes":[]}',
      size_bytes: 100,
      node_count: 2,
      filename: 'Test_Preview.json',
      schema_valid: true,
      errors: [],
    })
    vi.mocked(graphAPI.saveGraphAndWrite).mockResolvedValue({
      success: true,
      filename: 'Test_Preview.json',
      json_content: '{"schemaVersion":"1.1.0","nodes":[]}',
    })

    const { result } = renderHook(() =>
      useGraphToolbar(toastMock, 'test_preview.json', handleSaveMock, false),
    )

    await act(async () => {
      await result.current.handlePreviewExport()
    })

    await act(async () => {
      await result.current.handleExportFromPreview()
    })

    expect(graphAPI.saveGraphAndWrite).toHaveBeenCalledTimes(1)
    expect(result.current.previewOpen).toBe(false)
    expect(result.current.lastExportDownload).toEqual({
      jsonContent: '{"schemaVersion":"1.1.0","nodes":[]}',
      filename: 'Test_Preview.json',
    })
  })
})
