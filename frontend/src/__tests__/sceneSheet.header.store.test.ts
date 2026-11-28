/**
 * Droits du dialogue ouvert et titre écrit depuis la fiche (story 20.4 lot C).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useGraphStore } from '../store/graphStore'
import { useAuthStore } from '../store/authStore'
import * as documentsAPI from '../api/documents'
import * as graphAPI from '../api/graph'

vi.mock('../api/documents', () => ({
  getDocument: vi.fn(),
  getLayout: vi.fn(),
  putDocument: vi.fn(),
  putLayout: vi.fn(),
  putDocumentKeepalive: vi.fn(),
  putLayoutKeepalive: vi.fn(),
}))
vi.mock('../api/graph', () => ({
  validateGraph: vi.fn(),
  loadGraph: vi.fn(),
}))
vi.mock('../utils/graphJournal', () => ({
  setPending: vi.fn().mockResolvedValue(undefined),
  acknowledgeSnapshot: vi.fn().mockResolvedValue(undefined),
}))

const INITIAL_AUTH = useAuthStore.getState()

const DOCUMENT = {
  schemaVersion: '1.2.0',
  title: 'Ancien titre',
  nodes: [{ id: 'START', speaker: 'Korga', line: '« Entre. »' }],
}

async function open(capabilities?: {
  can_edit: boolean
  can_delete: boolean
  is_owner: boolean
}) {
  vi.mocked(documentsAPI.getDocument).mockResolvedValueOnce({
    document: DOCUMENT,
    schemaVersion: '1.2.0',
    revision: 3,
    ...(capabilities ? { capabilities: { can_read: true, ...capabilities } } : {}),
  })
  await useGraphStore.getState().loadDialogueByDocumentId('a')
}

const conflict = () => ({
  response: { status: 409, data: { revision: 9, document: { ...DOCUMENT, title: 'Serveur' } } },
})

const sentTitle = (call: number) =>
  vi.mocked(documentsAPI.putDocument).mock.calls[call][1].document.title

const state = () => useGraphStore.getState()

beforeEach(() => {
  vi.clearAllMocks()
  state().resetGraph()
  useAuthStore.setState(INITIAL_AUTH, true)
  vi.mocked(documentsAPI.getLayout).mockResolvedValue({
    layout: { nodes: { START: { x: 0, y: 0 } } },
    revision: 1,
  })
  vi.mocked(documentsAPI.putDocument).mockResolvedValue({ revision: 4 })
  vi.mocked(documentsAPI.putLayout).mockResolvedValue({ revision: 2 })
  vi.mocked(graphAPI.validateGraph).mockResolvedValue({ errors: [], warnings: [] } as never)
})

describe('droits du dialogue ouvert', () => {
  it('suppression et propriété suivent ce que le serveur annonce', async () => {
    await open({ can_edit: true, can_delete: true, is_owner: true })

    expect(state()).toMatchObject({ canDeleteDocument: true, isDocumentOwner: true })

    await open({ can_edit: true, can_delete: false, is_owner: false })

    expect(state()).toMatchObject({ canDeleteDocument: false, isDocumentOwner: false })
  })

  it('refusées tant que le serveur ne dit rien, et après fermeture', async () => {
    await open()
    expect(state()).toMatchObject({ canDeleteDocument: false, isDocumentOwner: false })

    await open({ can_edit: true, can_delete: true, is_owner: true })
    state().resetGraph()

    expect(state()).toMatchObject({ canDeleteDocument: false, isDocumentOwner: false })
  })
})

describe('titre écrit ici', () => {
  it('part avec le document et n’est plus en attente ensuite', async () => {
    await open()
    state().setDocumentTitle('Nouveau')

    const response = await state().saveDialogue()

    expect(sentTitle(0)).toBe('Nouveau')
    expect(response.titleChanged).toBe(true)
    expect(state().titleDirty).toBe(false)
  })

  it('409 : il prime sur celui du serveur', async () => {
    await open()
    state().setDocumentTitle('Nouveau')
    vi.mocked(documentsAPI.putDocument).mockRejectedValueOnce(conflict())

    await state().saveDialogue()

    expect(sentTitle(1)).toBe('Nouveau')
    expect(state().document?.title).toBe('Nouveau')
  })

  it('409 sans titre touché : celui du serveur est gardé', async () => {
    await open()
    state().markDirty()
    vi.mocked(documentsAPI.putDocument).mockRejectedValueOnce(conflict())

    await state().saveDialogue()

    expect(sentTitle(1)).toBe('Serveur')
    expect(state().document?.title).toBe('Serveur')
  })

  it('retapé pendant l’envoi : la suite n’est pas écrasée et reste à enregistrer', async () => {
    await open()
    state().setDocumentTitle('Nou')
    vi.mocked(documentsAPI.putDocument).mockImplementationOnce(async () => {
      state().setDocumentTitle('Nouveau')
      return { revision: 4 }
    })

    await state().saveDialogue()

    expect(state().document?.title).toBe('Nouveau')
    expect(state()).toMatchObject({ titleDirty: true, hasUnsavedChanges: true })
  })

  it('annuler un geste du graphe ne revient pas sur le renommage', async () => {
    await open()
    state().addNode({
      id: 'n2',
      type: 'dialogueNode',
      position: { x: 0, y: 0 },
      data: { id: 'n2', speaker: 'Korga', line: '', choices: [] },
    })
    state().setDocumentTitle('Nouveau')

    state().undo()
    expect(state().document?.title).toBe('Nouveau')
    state().redo()
    expect(state().document?.title).toBe('Nouveau')
  })

  it('sans effet pour un invité', async () => {
    await open()
    useAuthStore.setState({ user: { id: 'g', username: 'g', role: 'guest' } as never })

    state().setDocumentTitle('Nouveau')

    expect(state().document?.title).toBe('Ancien titre')
    expect(state().hasUnsavedChanges).toBe(false)
  })
})
