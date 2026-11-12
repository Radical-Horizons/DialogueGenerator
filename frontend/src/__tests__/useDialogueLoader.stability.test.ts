/**
 * Stabilité du chargeur : relances d'autosave bornées, dialogue supprimé, URL qui reste sur
 * le dialogue affiché, rechargement quand Éditer enregistre le dialogue ouvert.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useDialogueLoader } from '../hooks/useDialogueLoader'
import { useGraphStore } from '../store/graphStore'
import { useGraphViewStore } from '../store/graphViewStore'
import { useGenerationStore } from '../store/generationStore'
import { DELETED_DIALOGUE_MESSAGE } from '../store/slices/persistenceSlice'

vi.mock('../api/unityDialogues', () => ({
  getUnityDialogue: vi.fn(),
}))

const toastMock = vi.fn()

type SaveDialogue = ReturnType<typeof useGraphStore.getState>['saveDialogue']

function dirtyDialogueState(saveDialogue: unknown) {
  useGraphStore.setState({
    saveDialogue: saveDialogue as SaveDialogue,
    hasUnsavedChanges: true,
    nodes: [{ id: 'n1', type: 'dialogueNode', position: { x: 0, y: 0 }, data: {} }],
    edges: [],
    dialogueMetadata: { filename: 'dial.json', title: 'D', node_count: 1, edge_count: 0 },
    isLoading: false,
    isSaving: false,
    isGenerating: false,
  })
}

function httpError(status: number) {
  return Object.assign(new Error(`HTTP ${status}`), { response: { status } })
}

async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
}

describe('useDialogueLoader — stabilité', () => {
  beforeEach(() => {
    toastMock.mockReset()
    useGraphStore.getState().resetGraph()
    useGenerationStore.getState().clearTemplateSession()
    useGraphViewStore.setState({ documentSaved: null, routeDialogueRevert: null })
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it.each([
    ['400 de validation', httpError(400)],
    ['403 lecture seule', httpError(403)],
    ['erreur locale sans statut', new Error('Aucun document canonique chargé')],
  ])('%s : pas de relance temporisée, relance à la prochaine modification', async (_label, error) => {
    vi.useFakeTimers()
    const saveDialogueMock = vi
      .fn()
      .mockRejectedValueOnce(error)
      .mockResolvedValue({ success: true, filename: 'dial' })
    dirtyDialogueState(saveDialogueMock)
    renderHook(() => useDialogueLoader(toastMock, null))

    await advance(100)
    expect(saveDialogueMock).toHaveBeenCalledTimes(1)
    await advance(60_000)
    expect(saveDialogueMock).toHaveBeenCalledTimes(1)

    act(() => {
      useGraphStore.setState((s) => ({ clientSeq: s.clientSeq + 1 }))
    })
    await advance(100)
    expect(saveDialogueMock).toHaveBeenCalledTimes(2)
  })

  it.each([
    ['503', httpError(503)],
    ['409', httpError(409)],
    ['réseau', Object.assign(new Error('Network Error'), { code: 'ERR_NETWORK' })],
  ])('erreur passagère %s : relance temporisée sans nouvelle modification', async (_label, error) => {
    vi.useFakeTimers()
    const saveDialogueMock = vi
      .fn()
      .mockRejectedValueOnce(error)
      .mockResolvedValue({ success: true, filename: 'dial' })
    dirtyDialogueState(saveDialogueMock)
    renderHook(() => useDialogueLoader(toastMock, null))

    await advance(100)
    await advance(3_500)
    await advance(100)
    expect(saveDialogueMock).toHaveBeenCalledTimes(2)
  })

  it('dialogue supprimé (404) : message explicite, pas de relance', async () => {
    vi.useFakeTimers()
    const saveDialogueMock = vi.fn().mockRejectedValue(httpError(404))
    dirtyDialogueState(saveDialogueMock)
    renderHook(() => useDialogueLoader(toastMock, null))

    await advance(100)
    await advance(30_000)

    expect(saveDialogueMock).toHaveBeenCalledTimes(1)
    expect(toastMock).toHaveBeenCalledWith(DELETED_DIALOGUE_MESSAGE, 'error')
  })

  it('suppression du dialogue ouvert (chargé sans sélection de liste) : le graphe est vidé', async () => {
    dirtyDialogueState(vi.fn().mockResolvedValue({ success: true, filename: 'dial' }))
    useGraphStore.setState({ hasUnsavedChanges: false })
    renderHook(() => useDialogueLoader(toastMock, null))

    act(() => {
      useGraphViewStore.getState().notifyDialogueDeleted('dial.json')
    })

    await waitFor(() => expect(useGraphStore.getState().dialogueMetadata.filename).toBeFalsy())
  })

  it("changement par l'URL refusé faute de sauvegarde : l'URL revient sur le dialogue affiché", async () => {
    const saveDialogueMock = vi.fn().mockRejectedValue(httpError(500))
    const loadMock = vi.fn()
    dirtyDialogueState(saveDialogueMock)
    useGraphStore.setState({ loadDialogueByDocumentId: loadMock })

    const routeTarget = { normalizedDialogueId: 'autre', decodedDialogueId: 'autre' }
    renderHook(() => useDialogueLoader(toastMock, routeTarget))

    await waitFor(() =>
      expect(useGraphViewStore.getState().routeDialogueRevert).toBe('dial.json'),
    )
    expect(loadMock).not.toHaveBeenCalled()
    expect(toastMock).toHaveBeenCalledWith(
      expect.stringContaining('Impossible de sauvegarder avant changement'),
      'error',
    )
  })

  it('changement par la liste refusé faute de sauvegarde : la sélection revient sur le dialogue affiché', async () => {
    const saveDialogueMock = vi.fn().mockRejectedValue(httpError(500))
    const loadMock = vi.fn()
    dirtyDialogueState(saveDialogueMock)
    useGraphStore.setState({ loadDialogueByDocumentId: loadMock })
    const { result } = renderHook(() => useDialogueLoader(toastMock, null))

    act(() => {
      result.current.setSelectedDialogue({
        filename: 'autre.json',
        file_path: '',
        size_bytes: 0,
        modified_time: '2020-01-01T00:00:00Z',
      })
    })

    await waitFor(() => expect(result.current.selectedDialogue).toBeNull())
    expect(loadMock).not.toHaveBeenCalled()
    expect(result.current.activeDialogueFilename).toBe('dial.json')
  })

  it("Éditer enregistre le dialogue ouvert : le graphe sans saisie en cours le recharge (contenu + révision)", async () => {
    const loadMock = vi.fn().mockResolvedValue(undefined)
    useGraphStore.setState({
      documentId: 'dial',
      documentRevision: 3,
      hasUnsavedChanges: false,
      dialogueMetadata: { filename: 'dial', title: 'D', node_count: 0, edge_count: 0 },
      loadDialogueByDocumentId: loadMock,
      validateGraph: vi.fn().mockResolvedValue(undefined),
    })
    renderHook(() => useDialogueLoader(toastMock, null))

    act(() => {
      useGraphViewStore
        .getState()
        .notifyDocumentSaved({ documentId: 'dial', revision: 4, source: 'edition' })
    })

    await waitFor(() => expect(loadMock).toHaveBeenCalledWith('dial'))
  })

  it('Éditer enregistre le dialogue ouvert pendant une saisie dans le graphe : avertissement, pas de rechargement', async () => {
    const loadMock = vi.fn().mockResolvedValue(undefined)
    dirtyDialogueState(vi.fn(() => new Promise(() => undefined)))
    useGraphStore.setState({
      documentId: 'dial',
      documentRevision: 3,
      loadDialogueByDocumentId: loadMock,
    })
    renderHook(() => useDialogueLoader(toastMock, null))

    act(() => {
      useGraphViewStore
        .getState()
        .notifyDocumentSaved({ documentId: 'dial', revision: 4, source: 'edition' })
    })

    await waitFor(() =>
      expect(toastMock).toHaveBeenCalledWith(expect.stringContaining('onglet Édition'), 'warning', 8000),
    )
    expect(loadMock).not.toHaveBeenCalled()
  })

  it('ignore ses propres enregistrements et les révisions déjà connues', async () => {
    const loadMock = vi.fn().mockResolvedValue(undefined)
    useGraphStore.setState({
      documentId: 'dial',
      documentRevision: 4,
      dialogueMetadata: { filename: 'dial', title: 'D', node_count: 0, edge_count: 0 },
      loadDialogueByDocumentId: loadMock,
    })
    renderHook(() => useDialogueLoader(toastMock, null))

    act(() => {
      useGraphViewStore
        .getState()
        .notifyDocumentSaved({ documentId: 'dial', revision: 5, source: 'graph' })
    })
    act(() => {
      useGraphViewStore
        .getState()
        .notifyDocumentSaved({ documentId: 'dial', revision: 4, source: 'edition' })
    })

    expect(loadMock).not.toHaveBeenCalled()
  })
})
