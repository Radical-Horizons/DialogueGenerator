/**
 * Fiche de scène dans le store : lecture, enregistrement, conflit, générations (story 20.4).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useGraphStore } from '../store/graphStore'
import { useAuthStore } from '../store/authStore'
import { useContextStore } from '../store/contextStore'
import { useGenerationStore } from '../store/generationStore'
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
  generateNode: vi.fn(),
  regenerateNode: vi.fn(),
  detectContextDropping: vi.fn(),
  validateGraph: vi.fn(),
  loadGraph: vi.fn(),
  saveGraphAndWrite: vi.fn(),
  calculateLayout: vi.fn(),
}))
vi.mock('../utils/graphJournal', () => ({
  setPending: vi.fn().mockResolvedValue(undefined),
  acknowledgeSnapshot: vi.fn().mockResolvedValue(undefined),
}))

const INITIAL_AUTH = useAuthStore.getState()

const STRAIGHT = "Grish T'vok"
const CURLY = 'Grish T’vok'

function sheetOf(npc: string, place: string, brief = '') {
  return {
    npcs: [{ name: npc, entryId: null }],
    pc: { name: 'Vethraak', entryId: null },
    place: { name: place, entryId: null },
    brief,
    linkedEntries: [],
    tones: ['conservé'],
  }
}

function documentOf(speakers: string[], scene?: Record<string, unknown>) {
  return {
    schemaVersion: '1.2.0',
    title: 'Dialogue',
    nodes: speakers.map((speaker, index) => ({
      id: index === 0 ? 'START' : `node-${index}`,
      speaker,
      line: '*Il regarde Uresaïr.*',
    })),
    ...(scene ? { scene } : {}),
  }
}

async function open(
  documentId: string,
  document: Record<string, unknown>,
  capabilities?: { can_edit: boolean },
) {
  vi.mocked(documentsAPI.getDocument).mockResolvedValueOnce({
    document,
    schemaVersion: '1.2.0',
    revision: 3,
    ...(capabilities
      ? { capabilities: { can_read: true, can_delete: false, is_owner: false, ...capabilities } }
      : {}),
  })
  await useGraphStore.getState().loadDialogueByDocumentId(documentId)
}

function putBody(call = 0): { document: Record<string, unknown> } {
  return vi.mocked(documentsAPI.putDocument).mock.calls[call][1]
}

beforeEach(() => {
  vi.clearAllMocks()
  useGraphStore.getState().resetGraph()
  useAuthStore.setState(INITIAL_AUTH, true)
  useGenerationStore.getState().setContextDroppingRulesOverlay(null)
  vi.mocked(documentsAPI.getLayout).mockResolvedValue({
    layout: { nodes: { START: { x: 0, y: 0 } } },
    revision: 1,
  })
  vi.mocked(documentsAPI.putDocument).mockResolvedValue({ revision: 4 })
  vi.mocked(documentsAPI.putLayout).mockResolvedValue({ revision: 2 })
  vi.mocked(graphAPI.validateGraph).mockResolvedValue({ errors: [], warnings: [] } as never)
  vi.mocked(graphAPI.generateNode).mockResolvedValue({
    node: { id: 'node-gen', speaker: STRAIGHT, line: '« Bien. »' },
    suggested_connections: [],
    parent_node_id: 'START',
  })
})

describe('lecture et enregistrement de la fiche', () => {
  it('la fiche lue sort du document et le PUT ne la porte pas si elle n’a pas changé', async () => {
    await open('a', documentOf([STRAIGHT], sheetOf(STRAIGHT, 'Forge')))

    expect(useGraphStore.getState().scene?.place?.name).toBe('Forge')
    expect(useGraphStore.getState().document).not.toHaveProperty('scene')
    expect(JSON.parse(useGraphStore.getState().exportToUnity())).not.toHaveProperty('scene')

    useGraphStore.getState().markDirty()
    await useGraphStore.getState().saveDialogue()

    expect(putBody().document).not.toHaveProperty('scene')
  })

  it('un dialogue sans fiche reste sans fiche à l’ouverture : rien à écrire', async () => {
    await open('a', documentOf([STRAIGHT]))

    expect(useGraphStore.getState().scene).toBeNull()
    expect(useGraphStore.getState().hasUnsavedChanges).toBe(false)
    expect(documentsAPI.putDocument).not.toHaveBeenCalled()
  })

  it('un geste enregistre la fiche déduite et corrigée, puis ne la renvoie plus', async () => {
    await open('a', documentOf([STRAIGHT]))

    useGraphStore.getState().updateScene((sheet) => ({ ...sheet, brief: 'Un marché.' }))
    await useGraphStore.getState().saveDialogue()

    expect(putBody().document.scene).toMatchObject({
      npcs: [{ name: STRAIGHT, entryId: null }],
      brief: 'Un marché.',
    })
    expect(useGraphStore.getState().sceneDirty).toBe(false)

    useGraphStore.getState().markDirty()
    await useGraphStore.getState().saveDialogue()
    expect(putBody(1).document).not.toHaveProperty('scene')
  })

  it('409, fiche non touchée : celle du serveur est gardée et adoptée', async () => {
    await open('a', documentOf([STRAIGHT], sheetOf(STRAIGHT, 'Ancien lieu')))
    vi.mocked(documentsAPI.putDocument).mockRejectedValueOnce({
      response: {
        status: 409,
        data: { revision: 9, document: documentOf([STRAIGHT], sheetOf(STRAIGHT, 'Lieu serveur')) },
      },
    })

    useGraphStore.getState().markDirty()
    await useGraphStore.getState().saveDialogue()

    expect(putBody(1).document).not.toHaveProperty('scene')
    expect(useGraphStore.getState().scene?.place?.name).toBe('Lieu serveur')
  })

  it('409, fiche changée ici : la nôtre est renvoyée', async () => {
    await open('a', documentOf([STRAIGHT], sheetOf(STRAIGHT, 'Ancien lieu')))
    vi.mocked(documentsAPI.putDocument).mockRejectedValueOnce({
      response: {
        status: 409,
        data: { revision: 9, document: documentOf([STRAIGHT], sheetOf(STRAIGHT, 'Lieu serveur')) },
      },
    })

    useGraphStore.getState().updateScene((sheet) => ({ ...sheet, brief: 'Ici' }))
    await useGraphStore.getState().saveDialogue()

    expect(putBody(1).document.scene).toMatchObject({ brief: 'Ici', tones: ['conservé'] })
    expect(useGraphStore.getState().scene?.place?.name).toBe('Ancien lieu')
  })

  it('sans droit d’écriture ou en invité, la fiche ne change pas', async () => {
    await open('a', documentOf([STRAIGHT]), { can_edit: false })
    useGraphStore.getState().updateScene((sheet) => ({ ...sheet, brief: 'Non' }))
    expect(useGraphStore.getState().scene).toBeNull()
    expect(useGraphStore.getState().hasUnsavedChanges).toBe(false)

    useGraphStore.getState().resetGraph()
    await open('a', documentOf([STRAIGHT]))
    useAuthStore.setState({ user: { role: 'guest' } } as never)
    useGraphStore.getState().ensureSceneStored()
    expect(useGraphStore.getState().scene).toBeNull()
  })

  it('un dialogue ouvert après un autre ne garde pas sa fiche', async () => {
    await open('a', documentOf([STRAIGHT], sheetOf(STRAIGHT, 'Forge')))
    await open('b', documentOf(['Autre']))

    expect(useGraphStore.getState().scene).toBeNull()
    expect(useGraphStore.getState().sceneDirty).toBe(false)
  })
})

describe('écritures concurrentes', () => {
  /** PUT retenu : le test choisit quand il aboutit ou échoue. */
  function heldPut() {
    let release!: (value: { revision: number }) => void
    let fail!: (reason: unknown) => void
    vi.mocked(documentsAPI.putDocument).mockImplementationOnce(
      () =>
        new Promise((resolve, reject) => {
          release = resolve
          fail = reject
        }),
    )
    return {
      release: () => release({ revision: 4 }),
      conflict: (document: Record<string, unknown>) =>
        fail({ response: { status: 409, data: { revision: 9, document } } }),
    }
  }

  const brief = (value: string) =>
    useGraphStore.getState().updateScene((sheet) => ({ ...sheet, brief: value }))

  it('fiche modifiée pendant un PUT : elle reste à envoyer, et le PUT suivant porte la nouvelle', async () => {
    await open('a', documentOf([STRAIGHT], sheetOf(STRAIGHT, 'Forge')))
    brief('Première')
    const put = heldPut()

    const saving = useGraphStore.getState().saveDialogue()
    await vi.waitFor(() => expect(documentsAPI.putDocument).toHaveBeenCalledTimes(1))
    brief('Seconde')
    put.release()
    await saving

    expect(putBody(0).document.scene).toMatchObject({ brief: 'Première' })
    expect(useGraphStore.getState().sceneDirty).toBe(true)

    await useGraphStore.getState().saveDialogue()
    expect(putBody(1).document.scene).toMatchObject({ brief: 'Seconde' })
    expect(useGraphStore.getState().sceneDirty).toBe(false)
  })

  it('409 après une retouche faite pendant le PUT : la fiche locale est gardée', async () => {
    await open('a', documentOf([STRAIGHT], sheetOf(STRAIGHT, 'Ancien lieu')))
    useGraphStore.getState().markDirty()
    const put = heldPut()

    const saving = useGraphStore.getState().saveDialogue()
    await vi.waitFor(() => expect(documentsAPI.putDocument).toHaveBeenCalledTimes(1))
    brief('Écrit pendant le PUT')
    put.conflict(documentOf([STRAIGHT], sheetOf(STRAIGHT, 'Lieu serveur')))
    await saving

    expect(useGraphStore.getState().scene).toMatchObject({
      brief: 'Écrit pendant le PUT',
      place: { name: 'Ancien lieu' },
    })
    expect(useGraphStore.getState().sceneDirty).toBe(true)
  })

  it('409 d’un dialogue quitté : sa fiche serveur ne se pose pas sur le nouveau', async () => {
    await open('a', documentOf([STRAIGHT], sheetOf(STRAIGHT, 'Lieu de A')))
    useGraphStore.getState().markDirty()
    const put = heldPut()

    const saving = useGraphStore.getState().saveDialogue()
    await vi.waitFor(() => expect(documentsAPI.putDocument).toHaveBeenCalledTimes(1))
    useGraphStore.getState().incrementLoadSeq()
    await open('b', documentOf(['PNJ de B'], sheetOf('PNJ de B', 'Lieu de B')))
    put.conflict(documentOf([STRAIGHT], sheetOf(STRAIGHT, 'Lieu serveur de A')))
    await saving

    expect(useGraphStore.getState().scene?.place?.name).toBe('Lieu de B')
  })
})

describe('graphies des locuteurs', () => {
  it('aucun speaker ne change à l’ouverture ; le clic les réécrit en un seul CTRL+Z', async () => {
    await open('a', documentOf([STRAIGHT, STRAIGHT, CURLY, CURLY]))
    const speakers = () =>
      useGraphStore
        .getState()
        .nodes.filter((node) => node.type === 'dialogueNode')
        .map((node) => node.data.speaker)

    expect(speakers()).toEqual([STRAIGHT, STRAIGHT, CURLY, CURLY])

    useGraphStore.getState().rewriteSpeakers(['node-2', 'node-3'], STRAIGHT)
    expect(speakers()).toEqual([STRAIGHT, STRAIGHT, STRAIGHT, STRAIGHT])
    expect(useGraphStore.getState().scene?.npcs).toEqual([{ name: STRAIGHT, entryId: null }])

    useGraphStore.getState().undo()
    expect(speakers()).toEqual([STRAIGHT, STRAIGHT, CURLY, CURLY])
    expect(useGraphStore.getState().canUndo()).toBe(false)
  })
})

describe('générations du dialogue ouvert', () => {
  /** Dialogue à deux répliques reliées, pour régénérer la seconde. */
  async function openRegenerable(scene?: Record<string, unknown>, data: object = {}) {
    await open('a', documentOf([STRAIGHT, STRAIGHT], scene))
    useGraphStore.setState((state) => ({
      nodes: state.nodes.map((node) =>
        node.id === 'node-1' ? { ...node, data: { ...node.data, ...data } } : node,
      ),
      edges: [{ id: 'e', source: 'START', target: 'node-1' }],
    }))
    vi.mocked(graphAPI.regenerateNode).mockResolvedValue({
      node: { id: 'node-1', speaker: STRAIGHT, line: '« Autre. »' },
      suggested_connections: [],
    })
  }

  const regenerated = () =>
    useGraphStore.getState().nodes.find((node) => node.id === 'node-1')?.data

  it('régénération : le nœud garde le contexte envoyé et aucune ancienne empreinte', async () => {
    await openRegenerable(sheetOf(STRAIGHT, 'Forge'), {
      contextGddContentFingerprint: 'ancienne-empreinte',
      gddContextSelectionsSnapshot: { characters_full: ['Ancien PNJ'] },
    })

    await useGraphStore.getState().regenerateNode('node-1', 'Plus court')

    const sent = vi.mocked(graphAPI.regenerateNode).mock.calls[0][1].context_selections
    expect(regenerated()?.gddContextSelectionsSnapshot).toEqual(sent)
    expect(regenerated()).not.toHaveProperty('contextGddContentFingerprint')
  })

  it('régénération d’un dialogue sans fiche : la fiche est enregistrée', async () => {
    await openRegenerable()

    await useGraphStore.getState().regenerateNode('node-1', 'Plus court')

    expect(useGraphStore.getState().scene?.npcs).toEqual([{ name: STRAIGHT, entryId: null }])
    expect(useGraphStore.getState().sceneDirty).toBe(true)
  })

  it('une déduction sans PNJ ni PJ n’est pas enregistrée : elle sera refaite', async () => {
    await open('a', {
      schemaVersion: '1.2.0',
      nodes: [{ id: 'START', speaker: '', line: '…' }],
    })

    await useGraphStore.getState().generateFromNode('START', 'Suite', {})

    expect(graphAPI.generateNode).toHaveBeenCalled()
    expect(useGraphStore.getState().scene).toBeNull()
    expect(useGraphStore.getState().sceneDirty).toBe(false)
  })

  it('scène A après B : colonne remplie par B, la suite dans A ne part qu’avec A', async () => {
    await open('b', documentOf(['PNJ de B'], sheetOf('PNJ de B', 'Lieu de B', 'Brief de B')))
    useContextStore.setState((state) => ({
      selections: {
        ...state.selections,
        characters_full: ['PNJ de B', 'Fiche de B'],
        locations_full: ['Lieu de B'],
        scene_protagonists: { personnage_a: 'Uresaïr', personnage_b: 'PNJ de B' },
        scene_location: { lieu: 'Lieu de B' },
      },
    }))
    await open('a', documentOf(['PNJ de A'], sheetOf('PNJ de A', 'Lieu de A', 'Brief de A')))

    await useGraphStore.getState().generateFromNode('START', 'Plus sec', {
      context_selections: useContextStore.getState().selections,
      npc_speaker_id: 'PNJ de B',
      player_character_id: 'Uresaïr',
    })

    const request = vi.mocked(graphAPI.generateNode).mock.calls[0][0]
    expect(request.npc_speaker_id).toBe('PNJ de A')
    expect(request.player_character_id).toBe('Vethraak')
    expect(request.context_selections).toMatchObject({
      scene_location: { lieu: 'Lieu de A' },
      characters_full: ['PNJ de A'],
    })
    expect(JSON.stringify(request.context_selections)).not.toContain('de B')
    expect(request.user_instructions).toBe('Brief de la scène : Brief de A\n\nPlus sec')

    const generated = useGraphStore.getState().nodes.find((node) => node.id === 'node-gen')
    expect(generated?.data.lastGenerationInstructions).toBe('Plus sec')
  })

  it('la première génération enregistre la fiche déduite', async () => {
    await open('a', documentOf([STRAIGHT]))

    await useGraphStore.getState().generateFromNode('START', 'Suite', {})

    expect(useGraphStore.getState().scene?.npcs).toEqual([{ name: STRAIGHT, entryId: null }])
    expect(useGraphStore.getState().sceneDirty).toBe(true)
  })

  it('régénération : fiche et brief, pas l’instantané du nœud ; consigne mémorisée sans brief', async () => {
    await open('a', documentOf([STRAIGHT, STRAIGHT], sheetOf(STRAIGHT, 'Forge', 'Un marché.')))
    useGraphStore.setState((state) => ({
      nodes: state.nodes.map((node) =>
        node.id === 'node-1'
          ? {
              ...node,
              data: {
                ...node.data,
                gddContextSelectionsSnapshot: { characters_full: ['Ancien PNJ'] },
              },
            }
          : node,
      ),
      edges: [{ id: 'e', source: 'START', target: 'node-1' }],
    }))
    vi.mocked(graphAPI.regenerateNode).mockResolvedValue({
      node: { id: 'node-1', speaker: STRAIGHT, line: '« Autre. »' },
      suggested_connections: [],
    })

    await useGraphStore.getState().regenerateNode('node-1', 'Plus court')

    const request = vi.mocked(graphAPI.regenerateNode).mock.calls[0][1]
    expect(request.new_instructions).toBe('Brief de la scène : Un marché.\n\nPlus court')
    expect(request.context_selections).toMatchObject({
      scene_protagonists: { personnage_a: 'Vethraak', personnage_b: STRAIGHT },
      scene_location: { lieu: 'Forge' },
    })
    expect(JSON.stringify(request.context_selections)).not.toContain('Ancien PNJ')
    const node = useGraphStore.getState().nodes.find((n) => n.id === 'node-1')
    expect(node?.data.lastGenerationInstructions).toBe('Plus court')
  })
})
