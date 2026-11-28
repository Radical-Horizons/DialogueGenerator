/**
 * « fiche de scène ▾ » (story 20.4 lot C) : droits, fenêtres, clavier, suppression,
 * template appliqué et titre, avec l'autosave réel du graphe.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { SceneSheetBar } from './SceneSheetBar'
import { useDialogueLoader } from '../../hooks/useDialogueLoader'
import { useGraphStore } from '../../store/graphStore'
import { useGraphViewStore } from '../../store/graphViewStore'
import { useAuthStore } from '../../store/authStore'
import { useContextStore } from '../../store/contextStore'
import { useSceneCatalogStore } from '../../store/sceneCatalogStore'
import { useTemplateStore } from '../../store/templateStore'
import * as documentsAPI from '../../api/documents'
import * as graphAPI from '../../api/graph'
import * as templatesAPI from '../../api/templates'
import * as contextAPI from '../../api/context'

const toast = vi.hoisted(() => vi.fn())

vi.mock('../shared', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useToast: () => toast,
}))
vi.mock('../../api/documents', () => ({
  getDocument: vi.fn(),
  getLayout: vi.fn(),
  putDocument: vi.fn(),
  putLayout: vi.fn(),
  putDocumentKeepalive: vi.fn(),
  putLayoutKeepalive: vi.fn(),
  deleteDocument: vi.fn(),
}))
vi.mock('../../api/graph', () => ({
  validateGraph: vi.fn(),
  loadGraph: vi.fn(),
  getContextDroppingRules: vi.fn(),
}))
vi.mock('../../utils/graphJournal', () => ({
  setPending: vi.fn().mockResolvedValue(undefined),
  acknowledgeSnapshot: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('../../api/authorProfiles', () => ({
  listAuthorProfilesApi: vi.fn().mockResolvedValue([]),
  listPrebuiltAuthorProfilesApi: vi.fn().mockResolvedValue([]),
}))
vi.mock('../../api/flags', () => ({
  listFlags: vi.fn().mockResolvedValue({
    flags: [
      {
        id: 'forge_ouverte',
        label: 'Forge ouverte',
        description: '',
        scope: 'world',
        tags: [],
        semanticType: 'bool',
        type: 'bool',
        defaultValueParsed: false,
      },
    ],
  }),
}))
vi.mock('../../api/dialogueMetadata', () => ({
  getDialogueMetadata: vi.fn().mockResolvedValue({
    document_id: 'forge',
    name: 'Rencontre',
    owner_username: 'marc',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    last_modified_by_username: 'marc',
    node_count: 1,
    total_cost_eur: 0,
    cost_per_node_eur: 0,
  }),
}))
vi.mock('../../api/dialogueShares', () => ({
  listDialogueShares: vi.fn().mockResolvedValue([]),
  createDialogueShare: vi.fn(),
  deleteDialogueShare: vi.fn(),
}))
vi.mock('../../api/dialoguePermissions', () => ({
  getDialoguePermissions: vi.fn().mockResolvedValue({
    owner: { user_id: '1', username: 'marc' },
    co_editors: [],
    can_manage: false,
  }),
}))
vi.mock('../../api/context', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  listSceneRegions: vi.fn(),
  getSceneSubLocations: vi.fn(),
}))
vi.mock('../../api/templates', () => ({
  listTemplatesApi: vi.fn(),
  listPrebuiltTemplatesApi: vi.fn(),
  getTemplateApi: vi.fn(),
  validateTemplateApi: vi.fn(),
  createTemplateApi: vi.fn(),
  updateTemplateApi: vi.fn(),
  deleteTemplateApi: vi.fn(),
}))

const INITIAL_AUTH = useAuthStore.getState()

type Capabilities = { can_edit: boolean; can_delete: boolean; is_owner: boolean }

const OWNER: Capabilities = { can_edit: true, can_delete: true, is_owner: true }

const TEMPLATE = {
  id: '11111111-1111-1111-1111-111111111111',
  name: 'Confrontation',
  description: '',
  category: 'Général',
  icon: '📋',
  metadata: { created: '', modified: '' },
  configuration: {
    characters: ['Vethraak', 'Korga'],
    locations: ['La Forge'],
    region: 'La Forge',
    sceneType: 'Generic',
    instructions: 'Il exige son dû.',
    llmModel: 'gpt-6-luna',
  },
}

function Harness() {
  useDialogueLoader(toast, null)
  return <SceneSheetBar />
}

function signIn(role: 'writer' | 'guest' | 'admin') {
  useAuthStore.setState({
    user: { id: '1', username: role, role } as never,
    isAuthenticated: true,
  })
}

async function open(
  capabilities: Capabilities = OWNER,
  options: { documentId?: string; nodes?: unknown[] } = {},
) {
  const documentId = options.documentId ?? 'forge'
  vi.mocked(documentsAPI.getDocument).mockResolvedValueOnce({
    document: {
      schemaVersion: '1.2.0',
      title: 'Rencontre',
      nodes: options.nodes ?? [{ id: 'START', speaker: "Grish T'vok", line: '« Entre. »' }],
    },
    schemaVersion: '1.2.0',
    revision: 3,
    capabilities: { can_read: true, ...capabilities },
  })
  await act(async () => {
    await useGraphStore.getState().loadDialogueByDocumentId(documentId)
  })
}

const trigger = () => screen.getByRole('button', { name: 'fiche de scène ▾' })

function openMenu() {
  fireEvent.click(trigger())
  return screen.getByRole('menu', { name: 'Fiche de scène' })
}

function choose(label: string) {
  openMenu()
  fireEvent.click(screen.getByRole('menuitem', { name: label }))
}

const entryLabels = () =>
  within(openMenu())
    .getAllByRole('menuitem')
    .map((item) => item.textContent)

function press(key: string, init: Record<string, unknown> = {}) {
  fireEvent.keyDown(document.activeElement ?? document.body, { key, ...init })
}

function pause(ms: number) {
  return act(() => new Promise<void>((resolve) => setTimeout(resolve, ms)))
}

beforeEach(() => {
  vi.clearAllMocks()
  useGraphStore.getState().resetGraph()
  useGraphViewStore.getState().clearDialogueDeleted()
  useAuthStore.setState(INITIAL_AUTH, true)
  signIn('writer')
  useTemplateStore.getState().reset()
  useContextStore.getState().clearSelections()
  useSceneCatalogStore.setState({
    characters: [{ name: 'Korga', data: { notion_page_id: 'page-korga' } }],
    places: [{ name: 'La Forge', data: { notion_page_id: 'page-forge' } }],
    loadedRevision: useContextStore.getState().gddDataRevision,
  })
  vi.mocked(documentsAPI.getLayout).mockResolvedValue({
    layout: { nodes: { START: { x: 0, y: 0 } } },
    revision: 1,
  })
  vi.mocked(documentsAPI.putDocument).mockResolvedValue({ revision: 4 })
  vi.mocked(documentsAPI.putLayout).mockResolvedValue({ revision: 2 })
  vi.mocked(documentsAPI.deleteDocument).mockResolvedValue(undefined)
  vi.mocked(graphAPI.validateGraph).mockResolvedValue({ errors: [], warnings: [] } as never)
  vi.mocked(graphAPI.getContextDroppingRules).mockRejectedValue(new Error('absent'))
  vi.mocked(templatesAPI.listTemplatesApi).mockResolvedValue([TEMPLATE])
  vi.mocked(templatesAPI.getTemplateApi).mockResolvedValue(TEMPLATE)
  vi.mocked(templatesAPI.validateTemplateApi).mockResolvedValue({
    valid: true,
    warnings: [],
    obsoleteRefs: [],
  })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('entrées et droits', () => {
  const ALL = [
    'Flags du dialogue',
    'Enregistrer comme template',
    'Appliquer un template…',
    'Métadonnées',
    'Partager',
    'Permissions',
    'Supprimer',
  ]

  it.each([
    ['propriétaire', 'writer', OWNER, ALL],
    [
      'co-éditeur',
      'writer',
      { can_edit: true, can_delete: false, is_owner: false },
      ALL.filter((label) => label !== 'Partager' && label !== 'Supprimer'),
    ],
    [
      'writer sans droit d’écriture',
      'writer',
      { can_edit: false, can_delete: false, is_owner: false },
      ['Flags du dialogue', 'Enregistrer comme template', 'Métadonnées', 'Permissions'],
    ],
    [
      'invité',
      'guest',
      { can_edit: false, can_delete: false, is_owner: false },
      ['Flags du dialogue', 'Métadonnées'],
    ],
    [
      'admin non propriétaire',
      'admin',
      { can_edit: true, can_delete: true, is_owner: false },
      ALL,
    ],
  ] as const)('%s', async (_label, role, capabilities, expected) => {
    signIn(role)
    render(<Harness />)
    await open({ ...capabilities })

    expect(entryLabels()).toEqual(expected)
  })

  it('le menu est là, fiche repliée comme dépliée', async () => {
    render(<Harness />)
    await open()

    expect(trigger()).toHaveAttribute('aria-haspopup', 'menu')
    fireEvent.click(screen.getByRole('button', { name: /déplier la fiche/ }))
    expect(trigger()).toBeInTheDocument()
  })
})

describe('clavier', () => {
  it('le menu se parcourt aux flèches ; ÉCHAP le ferme et rend le focus', async () => {
    render(<Harness />)
    await open()
    trigger().focus()
    press('ArrowDown')

    expect(document.activeElement).toHaveTextContent('Flags du dialogue')
    press('ArrowDown')
    expect(document.activeElement).toHaveTextContent('Enregistrer comme template')
    press('End')
    expect(document.activeElement).toHaveTextContent('Supprimer')
    press('ArrowDown')
    expect(document.activeElement).toHaveTextContent('Flags du dialogue')
    press('Escape')

    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(document.activeElement).toBe(trigger())
  })

  it.each([
    ['Flags du dialogue', 'Flags du dialogue'],
    ['Appliquer un template…', 'Appliquer un template'],
    ['Métadonnées', 'Métadonnées dialogue'],
    ['Partager', 'Partager la co-édition'],
    ['Permissions', 'Permissions'],
  ])('« %s » ouvre une fenêtre nommée, que ÉCHAP ferme en rendant le focus', async (entry, name) => {
    render(<Harness />)
    await open()
    choose(entry)

    const dialog = await screen.findByRole('dialog', { name })
    expect(dialog.contains(document.activeElement)).toBe(true)
    press('Escape')

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(document.activeElement).toBe(trigger())
  })

  it('permissions ouvertes depuis les métadonnées : ÉCHAP ne ferme qu’elles', async () => {
    render(<Harness />)
    await open()
    choose('Métadonnées')
    fireEvent.click(await screen.findByRole('button', { name: 'Voir les permissions' }))
    await screen.findByRole('dialog', { name: 'Permissions' })

    press('Escape')

    expect(screen.queryByRole('dialog', { name: 'Permissions' })).not.toBeInTheDocument()
    expect(screen.getByRole('dialog', { name: 'Métadonnées dialogue' })).toBeInTheDocument()
  })

  it('une frappe dans une fenêtre n’atteint pas les raccourcis de la page', async () => {
    const listener = vi.fn()
    window.addEventListener('keydown', listener)
    render(<Harness />)
    await open()
    choose('Flags du dialogue')
    await screen.findByRole('dialog', { name: 'Flags du dialogue' })

    press('Delete')
    press('p')

    expect(listener).not.toHaveBeenCalled()
    window.removeEventListener('keydown', listener)
  })

  it.each([
    ['Flags du dialogue', 'Flags du dialogue'],
    ['Métadonnées', 'Métadonnées dialogue'],
  ])('« %s », focus retombé sur la page : rien n’atteint le graphe', async (entry, name) => {
    const listener = vi.fn()
    window.addEventListener('keydown', listener)
    render(<Harness />)
    await open()
    choose(entry)
    await screen.findByRole('dialog', { name })
    ;(document.activeElement as HTMLElement).blur()
    expect(document.activeElement).toBe(document.body)

    press('Delete')
    press('z', { ctrlKey: true })

    expect(listener).not.toHaveBeenCalled()
    press('Escape')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    window.removeEventListener('keydown', listener)
  })

  it('autre dialogue ouvert : la fenêtre se ferme', async () => {
    render(<Harness />)
    await open()
    choose('Flags du dialogue')
    await screen.findByRole('dialog', { name: 'Flags du dialogue' })

    await open(OWNER, { documentId: 'autre' })

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})

describe('flags', () => {
  it('un flag ajouté s’enregistre seul puis se relit', async () => {
    render(<Harness />)
    await open()
    choose('Flags du dialogue')

    fireEvent.click(await screen.findByRole('button', { name: 'Ajouter' }))

    await waitFor(() => expect(documentsAPI.putDocument).toHaveBeenCalled())
    const body = vi.mocked(documentsAPI.putDocument).mock.calls[0][1]
    expect(body.document.dialogueFlags).toEqual([
      expect.objectContaining({ flagId: 'forge_ouverte' }),
    ])
    await waitFor(() => expect(screen.getByText(/^Enregistré · /)).toBeInTheDocument())

    vi.mocked(documentsAPI.getDocument).mockResolvedValueOnce({
      document: body.document,
      schemaVersion: '1.2.0',
      revision: 4,
      capabilities: { can_read: true, ...OWNER },
    })
    await act(async () => {
      await useGraphStore.getState().loadDialogueByDocumentId('forge')
    })
    expect(useGraphStore.getState().dialogueFlagBindings).toEqual([
      expect.objectContaining({ flagId: 'forge_ouverte' }),
    ])
  })

  it('s’enregistre aussi sur une scène sans réplique', async () => {
    render(<Harness />)
    await open(OWNER, { nodes: [] })
    choose('Flags du dialogue')

    fireEvent.click(await screen.findByRole('button', { name: 'Ajouter' }))

    await waitFor(() => expect(documentsAPI.putDocument).toHaveBeenCalled())
  })

  it('enregistrement en échec : la fenêtre le dit', async () => {
    vi.mocked(documentsAPI.putDocument).mockRejectedValue(new Error('disque plein'))
    render(<Harness />)
    await open()
    choose('Flags du dialogue')

    fireEvent.click(await screen.findByRole('button', { name: 'Ajouter' }))

    const dialog = screen.getByRole('dialog', { name: 'Flags du dialogue' })
    await waitFor(() =>
      expect(within(dialog).getByText('Non enregistré')).toBeInTheDocument(),
    )
  })

  it('lecture seule : ni ajout, ni retrait, ni saisie', async () => {
    render(<Harness />)
    await open({ can_edit: false, can_delete: false, is_owner: false })
    act(() => {
      useGraphStore.setState({
        dialogueFlagBindings: [{ flagId: 'forge_ouverte', type: 'bool', initialValue: true }],
      })
    })
    choose('Flags du dialogue')
    const dialog = await screen.findByRole('dialog', { name: 'Flags du dialogue' })

    await waitFor(() => expect(within(dialog).getByText('Forge ouverte')).toBeInTheDocument())
    expect(within(dialog).queryByRole('button', { name: 'Ajouter' })).not.toBeInTheDocument()
    expect(within(dialog).queryByRole('button', { name: 'Retirer' })).not.toBeInTheDocument()
    expect(within(dialog).queryByRole('searchbox')).not.toBeInTheDocument()
    expect(within(dialog).getByRole('checkbox')).toBeDisabled()
  })
})

describe('suppression', () => {
  it('annulée : rien ne change', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    render(<Harness />)
    await open()

    choose('Supprimer')

    expect(confirm).toHaveBeenCalledWith(
      'Supprimer le dialogue « Rencontre » ? Cette action est irréversible.',
    )
    expect(documentsAPI.deleteDocument).not.toHaveBeenCalled()
    expect(useGraphStore.getState().documentId).toBe('forge')
    expect(useGraphStore.getState().isDeletingDocument).toBe(false)
  })

  it('avec une saisie en attente : la scène se ferme et rien n’est réécrit', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
    let finish: () => void = () => {}
    vi.mocked(documentsAPI.deleteDocument).mockImplementation(
      () => new Promise<void>((resolve) => (finish = resolve)),
    )
    render(<Harness />)
    await open()
    // Autosave programmé, pas encore parti.
    act(() => {
      useGraphStore.getState().updateScene((sheet) => ({ ...sheet, brief: 'En cours' }))
    })

    choose('Supprimer')
    await pause(150)

    expect(confirm).toHaveBeenCalledWith(expect.stringContaining('non sauvegardées seront perdues'))
    expect(documentsAPI.deleteDocument).toHaveBeenCalledWith('forge')
    expect(documentsAPI.putDocument).not.toHaveBeenCalled()

    await act(async () => finish())
    await pause(150)

    expect(useGraphStore.getState().documentId).toBeNull()
    expect(screen.queryByTestId('scene-sheet')).not.toBeInTheDocument()
    expect(documentsAPI.putDocument).not.toHaveBeenCalled()
    expect(documentsAPI.putLayout).not.toHaveBeenCalled()
  })

  it('en cours : le clavier saute l’entrée désactivée', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    vi.mocked(documentsAPI.deleteDocument).mockImplementation(() => new Promise<void>(() => {}))
    render(<Harness />)
    await open()
    choose('Supprimer')
    openMenu()
    expect(screen.getByRole('menuitem', { name: 'Suppression…' })).toBeDisabled()

    press('End')
    expect(document.activeElement).toHaveTextContent('Permissions')
    press('ArrowDown')
    expect(document.activeElement).toHaveTextContent('Flags du dialogue')
    press('ArrowUp')
    expect(document.activeElement).toHaveTextContent('Permissions')
  })

  it('en échec : message, scène intacte et saisie enregistrée', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    vi.mocked(documentsAPI.deleteDocument).mockRejectedValue(new Error('disque plein'))
    render(<Harness />)
    await open()
    act(() => {
      useGraphStore.getState().updateScene((sheet) => ({ ...sheet, brief: 'En cours' }))
    })

    choose('Supprimer')

    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(expect.stringContaining('Suppression impossible'), 'error'),
    )
    expect(useGraphStore.getState().documentId).toBe('forge')
    expect(useGraphStore.getState().scene?.brief).toBe('En cours')
    await waitFor(() => expect(documentsAPI.putDocument).toHaveBeenCalled())
  })
})

describe('templates', () => {
  const sheet = () => useGraphStore.getState().scene

  async function openFilledScene() {
    render(<Harness />)
    await open()
    act(() => {
      useGraphStore.getState().updateScene((current) => ({
        ...current,
        brief: 'Ancien brief',
        tones: ['tension'],
        authorProfileId: 'voix-1',
      }))
    })
    choose('Appliquer un template…')
  }

  it('appliqué : distribution, lieu et brief remplacés ; tons, profil et répliques gardés', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    await openFilledScene()
    const nodes = useGraphStore.getState().nodes

    fireEvent.click(await screen.findByRole('button', { name: /Confrontation/ }))

    await waitFor(() => expect(sheet()?.brief).toBe('Il exige son dû.'))
    expect(sheet()).toMatchObject({
      pc: { name: 'Vethraak' },
      npcs: [{ name: 'Korga', entryId: 'page-korga' }],
      place: { name: 'La Forge', entryId: 'page-forge' },
      tones: ['tension'],
      authorProfileId: 'voix-1',
    })
    expect(sheet()).not.toHaveProperty('llmModel')
    expect(useGraphStore.getState().nodes).toBe(nodes)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(document.activeElement).toBe(trigger())
  })

  it('refusé à la confirmation : fiche inchangée', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    await openFilledScene()
    const before = sheet()

    fireEvent.click(await screen.findByRole('button', { name: /Confrontation/ }))

    await waitFor(() => expect(confirm).toHaveBeenCalled())
    expect(sheet()).toBe(before)
  })

  it('scène changée pendant la lecture du template : rien ne s’applique', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
    let deliver: (value: typeof TEMPLATE) => void = () => {}
    vi.mocked(templatesAPI.getTemplateApi).mockImplementation(
      () => new Promise((resolve) => (deliver = resolve)),
    )
    render(<Harness />)
    await open()
    choose('Appliquer un template…')
    fireEvent.click(await screen.findByRole('button', { name: /Confrontation/ }))

    await open(OWNER, { documentId: 'autre' })
    await act(async () => deliver(TEMPLATE))

    expect(confirm).not.toHaveBeenCalled()
    expect(sheet()).toBeNull()
  })

  it('lieu du GDD : la création porte la région, le sous-lieu et la fiche de lieu', async () => {
    vi.mocked(contextAPI.listSceneRegions).mockResolvedValue({
      regions: ['Le Port', 'Les Fonderies'],
    } as never)
    vi.mocked(contextAPI.getSceneSubLocations).mockImplementation(
      async (region) =>
        ({ sub_locations: region === 'Les Fonderies' ? ['La Forge'] : [] }) as never,
    )
    vi.mocked(templatesAPI.createTemplateApi).mockResolvedValue({
      ...TEMPLATE,
      warnings: [],
    })
    render(<Harness />)
    await open()
    act(() => {
      useGraphStore.getState().updateScene((current) => ({
        ...current,
        place: { name: 'La Forge', entryId: 'page-forge' },
      }))
    })
    choose('Enregistrer comme template')
    const dialog = await screen.findByRole('dialog', { name: 'Sauvegarder comme template' })
    fireEvent.change(within(dialog).getByTestId('template-form-name'), {
      target: { value: 'Marché' },
    })
    const create = within(dialog).getByTestId('template-modal-create-btn')
    await waitFor(() => expect(create).toBeEnabled())

    fireEvent.click(create)

    await waitFor(() => expect(templatesAPI.createTemplateApi).toHaveBeenCalled())
    const { configuration } = vi.mocked(templatesAPI.createTemplateApi).mock.calls[0][0]
    expect(configuration).toMatchObject({
      region: 'Les Fonderies',
      subLocation: 'La Forge',
      selectedSubLocations: ['La Forge'],
    })
    expect(configuration.contextSelections?.locations_full).toEqual(['La Forge'])
  })

  it('alias remis au nom du GDD ; nom absent signalé et repris', async () => {
    useSceneCatalogStore.setState({
      characters: [{ name: 'Korga Ghira-Vorthul', data: { notion_page_id: 'page-ghira' } }],
    })
    vi.mocked(templatesAPI.getTemplateApi).mockResolvedValue({
      ...TEMPLATE,
      configuration: {
        ...TEMPLATE.configuration,
        characters: ['Vethraak', 'La Korga'],
        locations: [],
        region: '',
        subLocation: 'Sous un pont',
      },
    })
    vi.mocked(templatesAPI.validateTemplateApi).mockResolvedValue({
      valid: false,
      warnings: [],
      obsoleteRefs: ['Sous un pont'],
      resolvedRefs: { 'La Korga': 'Korga Ghira-Vorthul' },
    })
    render(<Harness />)
    await open()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    choose('Appliquer un template…')

    fireEvent.click(await screen.findByRole('button', { name: /Confrontation/ }))

    await waitFor(() => expect(sheet()?.brief).toBe('Il exige son dû.'))
    expect(sheet()?.npcs).toEqual([{ name: 'Korga Ghira-Vorthul', entryId: 'page-ghira' }])
    expect(sheet()?.place).toEqual({ name: 'Sous un pont', entryId: null })
    expect(toast).toHaveBeenCalledWith(
      'Absent du GDD, repris tel quel : Sous un pont',
      'warning',
    )
  })

  it('« Enregistrer comme template » ouvre la fenêtre de création avec la scène', async () => {
    render(<Harness />)
    await open()
    act(() => {
      useGraphStore.getState().updateScene((current) => ({
        ...current,
        brief: 'Un marché.',
        tones: ['tension'],
      }))
    })

    choose('Enregistrer comme template')

    const dialog = await screen.findByRole('dialog', { name: 'Sauvegarder comme template' })
    expect(dialog).toHaveTextContent('Instructions : Un marché.')
    expect(dialog).toHaveTextContent("Grish T'vok")
    expect(dialog).not.toHaveTextContent('tension')
    expect(dialog.contains(document.activeElement)).toBe(true)
    press('Escape')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(document.activeElement).toBe(trigger())
  })
})

describe('titre', () => {
  const field = () => screen.getByRole('textbox', { name: 'Titre de la scène' })
  const storedTitle = () => useGraphStore.getState().document?.title

  async function openExpanded(capabilities: Capabilities = OWNER) {
    render(<Harness />)
    await open(capabilities)
    fireEvent.click(screen.getByRole('button', { name: /déplier la fiche/ }))
  }

  it('s’enregistre au fil de la saisie, sans changer de fichier', async () => {
    await openExpanded()

    fireEvent.change(field(), { target: { value: 'Le marché ' } })

    await waitFor(() => expect(documentsAPI.putDocument).toHaveBeenCalled())
    const [documentId, body] = vi.mocked(documentsAPI.putDocument).mock.calls[0]
    expect(documentId).toBe('forge')
    expect(body.document.title).toBe('Le marché ')
    expect(field()).toHaveValue('Le marché ')
    fireEvent.blur(field())
    expect(storedTitle()).toBe('Le marché')
  })

  it('scène sans réplique : le titre s’enregistre seul', async () => {
    render(<Harness />)
    await open(OWNER, { nodes: [] })

    fireEvent.change(field(), { target: { value: 'Prologue' } })

    await waitFor(() => expect(documentsAPI.putDocument).toHaveBeenCalled())
    expect(vi.mocked(documentsAPI.putDocument).mock.calls[0][1].document.title).toBe('Prologue')
  })

  it('sur plusieurs lignes : Entrée quitte le champ, aucun retour à la ligne gardé', async () => {
    await openExpanded()
    expect(field().tagName).toBe('TEXTAREA')
    field().focus()

    fireEvent.change(field(), { target: { value: 'Le marché\r\nde Korga' } })
    expect(storedTitle()).toBe('Le marché de Korga')
    const kept = fireEvent.keyDown(field(), { key: 'Enter' })

    expect(kept).toBe(false)
    expect(document.activeElement).not.toBe(field())
  })

  it('effacé d’un coup puis quitté : rien n’est réécrit', async () => {
    await openExpanded()

    fireEvent.change(field(), { target: { value: '' } })
    fireEvent.blur(field())

    expect(field()).toHaveValue('Rencontre')
    expect(useGraphStore.getState()).toMatchObject({
      titleDirty: false,
      hasUnsavedChanges: false,
    })
  })

  it('vidé à la sortie : le titre précédent revient', async () => {
    await openExpanded()

    fireEvent.change(field(), { target: { value: 'R' } })
    fireEvent.change(field(), { target: { value: '' } })
    expect(storedTitle()).toBe('R')
    expect(field()).toHaveValue('')
    fireEvent.blur(field())

    expect(storedTitle()).toBe('Rencontre')
    expect(field()).toHaveValue('Rencontre')
  })

  it('entré puis quitté sans saisie : rien à écrire', async () => {
    await openExpanded()

    fireEvent.focus(field())
    fireEvent.blur(field())

    expect(useGraphStore.getState().hasUnsavedChanges).toBe(false)
  })

  it('lecture seule : le titre est un texte', async () => {
    await openExpanded({ can_edit: false, can_delete: false, is_owner: false })

    expect(screen.queryByRole('textbox', { name: 'Titre de la scène' })).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Rencontre' })).toBeInTheDocument()
  })
})
