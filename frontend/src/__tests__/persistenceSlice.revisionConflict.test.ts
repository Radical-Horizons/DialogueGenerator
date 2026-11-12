/**
 * Autosave fiable : un 409 de révision ne doit pas bloquer les sauvegardes suivantes.
 * Le graphe ouvert l'emporte (auteur unique) : on reprend la révision serveur et on relance une fois.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useGraphStore } from '../store/graphStore'
import * as documentsAPI from '../api/documents'

vi.mock('../api/documents', () => ({
  getDocument: vi.fn(),
  getLayout: vi.fn(),
  putDocument: vi.fn(),
  putLayout: vi.fn(),
  putDocumentKeepalive: vi.fn(),
  putLayoutKeepalive: vi.fn(),
}))

vi.mock('../utils/graphJournal', () => ({
  setPending: vi.fn().mockResolvedValue(undefined),
  acknowledgeSnapshot: vi.fn().mockResolvedValue(undefined),
}))

const sampleDocument = {
  schemaVersion: '1.1.0',
  nodes: [
    { id: 'START', speaker: 'NPC', line: 'Hello', nextNode: 'END' },
    { id: 'END', line: '' },
  ],
}

function revisionConflict(revision: number) {
  return { response: { status: 409, data: { revision } }, message: 'HTTP 409' }
}

async function loadDirtyDialogue() {
  vi.mocked(documentsAPI.getDocument).mockResolvedValue({
    document: sampleDocument,
    schemaVersion: '1.1.0',
    revision: 3,
  })
  vi.mocked(documentsAPI.getLayout).mockResolvedValue({
    layout: { nodes: { START: { x: 0, y: 0 }, END: { x: 0, y: 100 } } },
    revision: 2,
  })
  await useGraphStore.getState().loadDialogueByDocumentId('doc')
  useGraphStore.getState().updateNode('START', { data: { line: 'Modifié', speaker: 'NPC' } })
}

describe('saveDialogue — conflit de révision', () => {
  beforeEach(() => {
    vi.mocked(documentsAPI.getDocument).mockReset()
    vi.mocked(documentsAPI.getLayout).mockReset()
    vi.mocked(documentsAPI.putDocument).mockReset()
    vi.mocked(documentsAPI.putLayout).mockReset()
    vi.mocked(documentsAPI.putDocumentKeepalive).mockReset().mockResolvedValue(null)
    vi.mocked(documentsAPI.putLayoutKeepalive).mockReset().mockResolvedValue(null)
    useGraphStore.getState().resetGraph()
  })

  it('409 sur le document : reprend la révision document du serveur et relance une fois', async () => {
    await loadDirtyDialogue()
    vi.mocked(documentsAPI.putDocument)
      .mockRejectedValueOnce(revisionConflict(9))
      .mockResolvedValueOnce({ revision: 10 })
    vi.mocked(documentsAPI.putLayout).mockResolvedValue({ revision: 3 })

    const response = await useGraphStore.getState().saveDialogue()

    const docCalls = vi.mocked(documentsAPI.putDocument).mock.calls
    expect(docCalls).toHaveLength(2)
    expect(docCalls[1][1].revision).toBe(9)
    expect(vi.mocked(documentsAPI.putLayout).mock.calls[0][1].revision).toBe(2)
    const state = useGraphStore.getState()
    expect(state.documentRevision).toBe(10)
    expect(state.layoutRevision).toBe(3)
    expect(state.hasUnsavedChanges).toBe(false)
    expect(state.syncStatus).toBe('synced')
    expect(response.replacedNewerVersion).toBe(true)
  })

  it("409 document : le renvoi garde le titre du serveur (renommé dans Édition), pas le titre périmé du graphe", async () => {
    vi.mocked(documentsAPI.getDocument).mockResolvedValue({
      document: { ...sampleDocument, title: 'Ancien titre' },
      schemaVersion: '1.1.0',
      revision: 3,
    })
    vi.mocked(documentsAPI.getLayout).mockResolvedValue({ layout: { nodes: {} }, revision: 2 })
    await useGraphStore.getState().loadDialogueByDocumentId('doc')
    useGraphStore.getState().updateNode('START', { data: { line: 'Modifié', speaker: 'NPC' } })
    vi.mocked(documentsAPI.putDocument)
      .mockRejectedValueOnce({
        response: {
          status: 409,
          data: { revision: 9, document: { ...sampleDocument, title: 'Titre renommé dans Édition' } },
        },
        message: 'HTTP 409',
      })
      .mockResolvedValueOnce({ revision: 10 })
    vi.mocked(documentsAPI.putLayout).mockResolvedValue({ revision: 3 })

    await useGraphStore.getState().saveDialogue()

    const resent = vi.mocked(documentsAPI.putDocument).mock.calls[1][1]
    expect(resent.document.title).toBe('Titre renommé dans Édition')
    expect((resent.document.nodes as Array<{ line?: string }>)[0].line).toBe('Modifié')
    expect((useGraphStore.getState().document as Record<string, unknown>).title).toBe(
      'Titre renommé dans Édition',
    )
  })

  it('409 sur le layout : reprend la révision layout du serveur et relance une fois', async () => {
    await loadDirtyDialogue()
    vi.mocked(documentsAPI.putDocument).mockResolvedValue({ revision: 4 })
    vi.mocked(documentsAPI.putLayout)
      .mockRejectedValueOnce(revisionConflict(7))
      .mockResolvedValueOnce({ revision: 8 })

    await useGraphStore.getState().saveDialogue()

    const layoutCalls = vi.mocked(documentsAPI.putLayout).mock.calls
    expect(layoutCalls).toHaveLength(2)
    expect(layoutCalls[1][1].revision).toBe(7)
    const state = useGraphStore.getState()
    expect(state.documentRevision).toBe(4)
    expect(state.layoutRevision).toBe(8)
    expect(state.hasUnsavedChanges).toBe(false)
  })

  it('409 document répété : range la révision dans documentRevision, pas dans layoutRevision', async () => {
    await loadDirtyDialogue()
    vi.mocked(documentsAPI.putDocument).mockRejectedValue(revisionConflict(12))

    await expect(useGraphStore.getState().saveDialogue()).rejects.toBeDefined()

    const state = useGraphStore.getState()
    expect(state.documentRevision).toBe(12)
    expect(state.layoutRevision).toBe(2)
    expect(documentsAPI.putDocument).toHaveBeenCalledTimes(2)
  })

  it("l'autosave enregistre en mode brouillon : une saisie incomplète ne bloque pas toute la persistance", async () => {
    await loadDirtyDialogue()
    vi.mocked(documentsAPI.putDocument).mockResolvedValue({ revision: 4 })
    vi.mocked(documentsAPI.putLayout).mockResolvedValue({ revision: 3 })

    await useGraphStore.getState().saveDialogue()

    expect(vi.mocked(documentsAPI.putDocument).mock.calls[0][1].validationMode).toBe('draft')
  })

  it('en quittant la page, le layout part aussi en keepalive, sans attendre la réponse du document', async () => {
    await loadDirtyDialogue()
    let resolveDocument: (value: { revision: number }) => void = () => {}
    vi.mocked(documentsAPI.putDocumentKeepalive).mockReturnValue(
      new Promise((resolve) => {
        resolveDocument = resolve
      }),
    )
    vi.mocked(documentsAPI.putLayoutKeepalive).mockResolvedValue({ revision: 3 })

    const saving = useGraphStore.getState().saveDialogue({ keepalive: true })

    expect(documentsAPI.putLayoutKeepalive).toHaveBeenCalledTimes(1)
    resolveDocument({ revision: 4 })
    await saving
    expect(documentsAPI.putLayout).not.toHaveBeenCalled()
    expect(useGraphStore.getState().layoutRevision).toBe(3)
  })
})
