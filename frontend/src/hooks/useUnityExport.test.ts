/**
 * Export Unity depuis le graphe : un document déjà sur disque se sauvegarde par
 * révision (PUT /documents/{id}) — `save-and-write` ne crée que des documents neufs
 * et répond 409 `canonical_revision_required` sur un fichier existant.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import type { Node } from 'reactflow'

vi.mock('../api/graph', () => ({
  validateSchema: vi.fn(),
  saveGraphAndWrite: vi.fn(),
}))
vi.mock('../utils/buildGraphApiPayload', () => ({
  buildGraphSchemaApiPayload: vi.fn(() => ({ nodes: [], edges: [] })),
}))
vi.mock('../components/graph/graphEditorStandalone', () => ({
  downloadUnityExport: vi.fn(),
}))

import * as graphAPI from '../api/graph'
import { useGraphStore } from '../store/graphStore'
import { useUnityExport, type UnityExportSchemaState } from './useUnityExport'

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
const EXPORTED = '{"schemaVersion":"1.1.0","nodes":[]}'

function setGraph(documentId: string | null) {
  useGraphStore.setState({
    nodes: [{ id: 'START', type: 'dialogueNode', position: { x: 0, y: 0 }, data: {} } as Node],
    edges: [],
    documentId,
    document: documentId ? { schemaVersion: '1.1.0', nodes: [] } : null,
    dialogueMetadata: { ...useGraphStore.getState().dialogueMetadata, filename: documentId ?? '' },
    saveDialogue,
    exportToUnity: () => EXPORTED,
  } as never)
}

function renderExport() {
  return renderHook(() => useUnityExport(toast, schemaState, { registerSuccessfulExport })).result
}

describe('useUnityExport', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(graphAPI.validateSchema).mockResolvedValue({
      is_valid: true,
      errors: [],
      error_count: 0,
      warnings: [],
      structured_errors: [],
    } as never)
  })

  it('document existant : sauvegarde par révision, sans save-and-write (régression 409 canonical_revision_required)', async () => {
    saveDialogue.mockResolvedValue({ success: true, filename: 'scene_a' })
    setGraph('scene_a')

    const result = renderExport()
    await act(() => result.current.handleExportUnity())

    expect(saveDialogue).toHaveBeenCalledTimes(1)
    expect(graphAPI.saveGraphAndWrite).not.toHaveBeenCalled()
    expect(registerSuccessfulExport).toHaveBeenCalledWith(EXPORTED, 'scene_a')
    expect(toast).toHaveBeenCalledWith('Dialogue exporté : scene_a', 'success', 3000)
  })

  it('graphe neuf : save-and-write crée le document', async () => {
    vi.mocked(graphAPI.saveGraphAndWrite).mockResolvedValue({
      success: true,
      filename: 'nouveau.json',
      json_content: EXPORTED,
    } as never)
    setGraph(null)

    const result = renderExport()
    await act(() => result.current.handleExportUnity())

    expect(saveDialogue).not.toHaveBeenCalled()
    expect(graphAPI.saveGraphAndWrite).toHaveBeenCalledTimes(1)
    expect(registerSuccessfulExport).toHaveBeenCalledWith(EXPORTED, 'nouveau.json')
  })

  it('sauvegarde refusée : aucun export annoncé', async () => {
    saveDialogue.mockRejectedValue(new Error('Révision périmée'))
    setGraph('scene_a')

    const result = renderExport()
    await act(() => result.current.handleExportUnity())

    expect(registerSuccessfulExport).not.toHaveBeenCalled()
    expect(toast).toHaveBeenCalledWith(expect.any(String), 'error')
    expect(toast).not.toHaveBeenCalledWith(expect.stringContaining('exporté'), 'success', 3000)
  })
})
