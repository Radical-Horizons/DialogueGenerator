/**
 * Stabilité de l'autosave du graphe : sauvegarde keepalive pendant une sauvegarde en vol,
 * ordre de réservation du quota keepalive, dialogue supprimé, diagnostics FR94 du brouillon.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useGraphStore } from '../store/graphStore'
import { useGraphViewStore } from '../store/graphViewStore'
import * as documentsAPI from '../api/documents'
import { DELETED_DIALOGUE_MESSAGE } from '../store/slices/persistenceSlice'

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
  schemaVersion: '1.2.0',
  nodes: [
    { id: 'START', speaker: 'NPC', line: 'Hello', nextNode: 'END' },
    { id: 'END', speaker: 'NPC', line: 'Bye' },
  ],
}

async function loadDirtyDialogue() {
  vi.mocked(documentsAPI.getDocument).mockResolvedValue({
    document: sampleDocument,
    schemaVersion: '1.2.0',
    revision: 3,
  })
  vi.mocked(documentsAPI.getLayout).mockResolvedValue({
    layout: { nodes: { START: { x: 0, y: 0 }, END: { x: 0, y: 100 } } },
    revision: 2,
  })
  await useGraphStore.getState().loadDialogueByDocumentId('doc')
  useGraphStore.getState().updateNode('START', { data: { line: 'Modifié', speaker: 'NPC' } })
}

describe('saveDialogue — stabilité', () => {
  beforeEach(() => {
    for (const fn of [
      documentsAPI.getDocument,
      documentsAPI.getLayout,
      documentsAPI.putDocument,
      documentsAPI.putLayout,
    ]) {
      vi.mocked(fn).mockReset()
    }
    vi.mocked(documentsAPI.putDocumentKeepalive).mockReset().mockResolvedValue(null)
    vi.mocked(documentsAPI.putLayoutKeepalive).mockReset().mockResolvedValue(null)
    useGraphStore.getState().resetGraph()
  })

  it('fermeture pendant une sauvegarde en vol : le keepalive part tout de suite, sur la révision qu’elle produira', async () => {
    await loadDirtyDialogue()
    let resolveInFlight: (value: { revision: number }) => void = () => {}
    vi.mocked(documentsAPI.putDocument).mockReturnValueOnce(
      new Promise((resolve) => {
        resolveInFlight = resolve
      }),
    )
    vi.mocked(documentsAPI.putDocumentKeepalive).mockResolvedValue({ revision: 5 })
    vi.mocked(documentsAPI.putLayoutKeepalive).mockResolvedValue({ revision: 3 })
    const inFlight = useGraphStore.getState().saveDialogue()
    await Promise.resolve()
    useGraphStore.getState().updateNode('START', { data: { line: 'Dernière frappe', speaker: 'NPC' } })

    const closing = useGraphStore.getState().saveDialogue({ keepalive: true })

    try {
      expect(documentsAPI.putDocumentKeepalive).toHaveBeenCalledTimes(1)
      const [, body] = vi.mocked(documentsAPI.putDocumentKeepalive).mock.calls[0]
      expect(body.revision).toBe(4)
      expect((body.document.nodes as Array<{ line?: string }>)[0].line).toBe('Dernière frappe')
      expect(vi.mocked(documentsAPI.putLayoutKeepalive).mock.calls[0][1].revision).toBe(2)
    } finally {
      vi.mocked(documentsAPI.putLayout).mockResolvedValue({ revision: 3 })
      resolveInFlight({ revision: 4 })
      await Promise.allSettled([inFlight, closing])
    }
    expect(documentsAPI.putLayout).not.toHaveBeenCalled()
    expect(useGraphStore.getState().documentRevision).toBe(5)
    expect(useGraphStore.getState().layoutRevision).toBe(3)
  })

  it('en quittant la page, le document réserve le quota keepalive avant le layout', async () => {
    await loadDirtyDialogue()
    vi.mocked(documentsAPI.putDocumentKeepalive).mockResolvedValue({ revision: 4 })
    vi.mocked(documentsAPI.putLayoutKeepalive).mockResolvedValue({ revision: 3 })

    await useGraphStore.getState().saveDialogue({ keepalive: true })

    const documentOrder = vi.mocked(documentsAPI.putDocumentKeepalive).mock.invocationCallOrder[0]
    const layoutOrder = vi.mocked(documentsAPI.putLayoutKeepalive).mock.invocationCallOrder[0]
    expect(documentOrder).toBeLessThan(layoutOrder)
  })

  it('dialogue supprimé (404) : aucun renvoi qui le recréerait, message explicite', async () => {
    await loadDirtyDialogue()
    vi.mocked(documentsAPI.putDocument).mockRejectedValue({
      response: { status: 404, data: { error: { message: 'Document introuvable' } } },
      message: 'HTTP 404',
    })

    await expect(useGraphStore.getState().saveDialogue()).rejects.toBeDefined()

    expect(documentsAPI.putDocument).toHaveBeenCalledTimes(1)
    expect(useGraphStore.getState().lastSaveError).toBe(DELETED_DIALOGUE_MESSAGE)
  })

  it('brouillon : les diagnostics FR94 non bloquants ne deviennent pas des erreurs de champ', async () => {
    await loadDirtyDialogue()
    vi.mocked(documentsAPI.putDocument).mockResolvedValue({
      revision: 4,
      validationReport: [
        {
          code: 'social_system_confusion',
          message: "Influence appartient au système Influence/Respect, pas à la Réputation.",
          path: 'nodes.0.speaker',
        },
        { code: 'validation_error', message: 'Ligne vide', path: 'nodes.0.line' },
      ],
    })
    vi.mocked(documentsAPI.putLayout).mockResolvedValue({ revision: 3 })

    await useGraphStore.getState().saveDialogue()

    const errors = useGraphStore.getState().documentFieldErrors
    expect(errors.map((e) => e.code)).not.toContain('social_system_confusion')
    expect(errors.map((e) => e.field)).toContain('line')
  })

  it('annonce chaque enregistrement à la section Éditer', async () => {
    await loadDirtyDialogue()
    vi.mocked(documentsAPI.putDocument).mockResolvedValue({ revision: 4 })
    vi.mocked(documentsAPI.putLayout).mockResolvedValue({ revision: 3 })

    await useGraphStore.getState().saveDialogue()

    expect(useGraphViewStore.getState().documentSaved).toEqual({
      documentId: 'doc',
      revision: 4,
      source: 'graph',
    })
  })
})
