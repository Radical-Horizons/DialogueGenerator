/**
 * « Exporter » depuis l'aperçu : un dialogue enregistré suit le chemin d'« Export Unity »
 * (PUT par révision puis rendu serveur). save-and-write répondait 409
 * `canonical_revision_required` (constaté dans l'app le 2026-11-26).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import type { Node } from 'reactflow'

vi.mock('../api/graph', () => ({
  validateSchema: vi.fn(),
  previewGraphExport: vi.fn(),
  saveGraphAndWrite: vi.fn(),
}))
vi.mock('../api/dialogues', () => ({
  previewUnityDialogueExport: vi.fn(),
  batchPreviewUnityDialogues: vi.fn(),
}))
vi.mock('../utils/buildGraphApiPayload', () => ({
  buildGraphSchemaApiPayload: vi.fn(() => ({ nodes: [], edges: [] })),
}))

import * as graphAPI from '../api/graph'
import { previewUnityDialogueExport } from '../api/dialogues'
import { useGraphStore } from '../store/graphStore'
import type { UnityExportSchemaState } from './useUnityExport'
import { useUnityExportPreview } from './useUnityExportPreview'

const schemaState: UnityExportSchemaState = {
  setShowSchemaValidationPanel: vi.fn(),
  setSchemaValidationLoading: vi.fn(),
  setSchemaValidationIsValid: vi.fn(),
  setSchemaValidationErrors: vi.fn(),
  setSchemaValidationErrorCount: vi.fn(),
  setSchemaValidationWarnings: vi.fn(),
  setSchemaValidationStructuredErrors: vi.fn(),
}

const toast = vi.fn()
const registerSuccessfulExport = vi.fn()
const saveDialogue = vi.fn()
const SERVER_RENDERED = '{"schemaVersion":"1.1.0","nodes":[{"id":"START","line":"rendu serveur"}]}'

function setGraph(documentId: string | null) {
  useGraphStore.setState({
    nodes: [{ id: 'START', type: 'dialogueNode', position: { x: 0, y: 0 }, data: {} } as Node],
    edges: [],
    documentId,
    dialogueMetadata: { ...useGraphStore.getState().dialogueMetadata, filename: documentId ?? '' },
    saveDialogue,
  } as never)
}

async function previewThenExport() {
  const { result } = renderHook(() =>
    useUnityExportPreview(toast, schemaState, { registerSuccessfulExport }),
  )
  await act(() => result.current.handlePreviewExport())
  await act(() => result.current.handleExportFromPreview())
}

describe('useUnityExportPreview — Exporter depuis l’aperçu', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(graphAPI.validateSchema).mockResolvedValue({
      is_valid: true,
      errors: [],
      error_count: 0,
      warnings: [],
      structured_errors: [],
    } as never)
    vi.mocked(graphAPI.previewGraphExport).mockResolvedValue({
      json_content: '{}',
      schema_valid: true,
      errors: [],
    } as never)
    vi.mocked(previewUnityDialogueExport).mockResolvedValue({ json_content: SERVER_RENDERED } as never)
    saveDialogue.mockResolvedValue({ success: true, filename: 'scene_a' })
  })

  it('dialogue enregistré : sauvegarde par révision et rendu serveur, jamais save-and-write', async () => {
    setGraph('scene_a')

    await previewThenExport()

    expect(graphAPI.saveGraphAndWrite).not.toHaveBeenCalled()
    expect(saveDialogue).toHaveBeenCalledTimes(1)
    expect(previewUnityDialogueExport).toHaveBeenCalledWith('scene_a')
    expect(registerSuccessfulExport).toHaveBeenCalledWith(SERVER_RENDERED, 'scene_a')
    expect(toast).toHaveBeenCalledWith('Dialogue exporté : scene_a', 'success', 3000)
  })

  it('graphe neuf : save-and-write crée le document', async () => {
    vi.mocked(graphAPI.saveGraphAndWrite).mockResolvedValue({
      success: true,
      filename: 'nouveau.json',
      json_content: '{"nodes":[]}',
    } as never)
    setGraph(null)

    await previewThenExport()

    expect(saveDialogue).not.toHaveBeenCalled()
    expect(graphAPI.saveGraphAndWrite).toHaveBeenCalledTimes(1)
    expect(registerSuccessfulExport).toHaveBeenCalledWith('{"nodes":[]}', 'nouveau.json')
  })
})
