/**
 * Fiche de scène complète (story 20.4 lot B) : tons, profil, brief à mentions, aperçu,
 * ligne de contexte et premier emplacement d'une scène neuve.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { SceneSheetBar } from './SceneSheetBar'
import { SceneFirstSlot } from './SceneFirstSlot'
import { useGraphStore } from '../../store/graphStore'
import { useGraphViewStore } from '../../store/graphViewStore'
import { useAuthStore } from '../../store/authStore'
import { useContextStore } from '../../store/contextStore'
import { useSceneCatalogStore } from '../../store/sceneCatalogStore'
import { useSceneProfileStore } from '../../store/sceneProfileStore'
import * as authorProfilesAPI from '../../api/authorProfiles'

vi.mock('../../api/authorProfiles', () => ({
  listAuthorProfilesApi: vi.fn(),
  listPrebuiltAuthorProfilesApi: vi.fn(),
}))
vi.mock('../../utils/graphJournal', () => ({
  setPending: vi.fn().mockResolvedValue(undefined),
  acknowledgeSnapshot: vi.fn().mockResolvedValue(undefined),
}))
// L'historique d'une fiche n'est pas demandé ici, mais le composant l'importe.
vi.mock('../context/GddEntityHistoryViewer', () => ({ GddEntityHistoryViewer: () => null }))

const INITIAL_AUTH = useAuthStore.getState()
const GRISH = 'Grish T’vok'

function node(id: string, speaker: string) {
  return {
    id,
    type: 'dialogueNode',
    position: { x: 0, y: 0 },
    data: { id, speaker, line: '…', choices: [] },
  }
}

const scene = () => useGraphStore.getState().scene
const brief = () => screen.getByRole('textbox', { name: 'Brief de la scène' }) as HTMLTextAreaElement

function type(value: string) {
  const field = brief()
  fireEvent.focus(field)
  fireEvent.change(field, { target: { value, selectionStart: value.length } })
}

function openScene(patch: Record<string, unknown> = {}, nodes = [node('START', GRISH)]) {
  useGraphStore.setState({
    documentId: 'forgeron',
    document: { schemaVersion: '1.2.0', title: 'Forgeron' },
    nodes,
    scene: {
      npcs: [{ name: GRISH, entryId: 'page-grish' }],
      pc: { name: 'Uresaïr', entryId: null },
      place: null,
      brief: '',
      linkedEntries: [],
      ...patch,
    },
  })
}

function renderExpanded() {
  render(<SceneSheetBar />)
  const toggle = screen.queryByRole('button', { name: /déplier la fiche/ })
  if (toggle) fireEvent.click(toggle)
}

beforeEach(() => {
  vi.clearAllMocks()
  useAuthStore.setState(INITIAL_AUTH, true)
  useGraphStore.getState().resetGraph()
  useContextStore.getState().clearSelections()
  useSceneProfileStore.setState({ voices: [], status: 'idle' })
  useSceneCatalogStore.setState({
    characters: [
      {
        name: GRISH,
        data: {
          notion_page_id: 'page-grish',
          values: { Épithète: 'La Forge ambulante', Occupation: 'Forge itinérante' },
          sections: { re_sume__de_la_fiche: 'Un Moribandon qui répare les objets brisés.' },
        },
      },
      { name: 'Korga', data: { notion_page_id: 'page-korga' } },
      { name: 'Uresaïr', data: {} },
    ],
    places: [],
    items: [{ name: 'Anneau de Vœu', data: { notion_page_id: 'page-anneau' } }],
    species: [],
    communities: [],
    loadedRevision: useContextStore.getState().gddDataRevision,
  })
  vi.mocked(authorProfilesAPI.listAuthorProfilesApi).mockResolvedValue([
    {
      id: 'equipe',
      name: 'Salutation',
      description: 'Répliques mesurées.',
      content: 'Sois bref.',
      metadata: { created: '', modified: '' },
      visibility: 'shared',
    },
  ])
  vi.mocked(authorProfilesAPI.listPrebuiltAuthorProfilesApi).mockResolvedValue([
    { id: 'literary', name: 'Littéraire', description: 'Dense.', content: 'Écris dense.' },
  ])
})

describe('tons', () => {
  it('cocher écrit la fiche ; « + » ajoute un ton libre sans « # »', () => {
    openScene()
    renderExpanded()
    const group = within(screen.getByRole('group', { name: 'Ton' }))
    expect(group.getAllByRole('button').map((button) => button.textContent)).toEqual([
      'tension',
      'intime',
      'humour',
      'révélation',
      'menace',
      'solennel',
      'dramatique',
      '+',
    ])

    fireEvent.click(group.getByRole('button', { name: 'menace' }))
    expect(scene()?.tones).toEqual(['menace'])
    expect(group.getByRole('button', { name: 'menace' })).toHaveAttribute('aria-pressed', 'true')

    fireEvent.click(group.getByRole('button', { name: 'Ajouter un ton' }))
    const field = screen.getByRole('textbox', { name: 'Nouveau ton' })
    fireEvent.change(field, { target: { value: '  #murmuré ' } })
    fireEvent.keyDown(field, { key: 'Enter' })

    expect(scene()?.tones).toEqual(['menace', 'murmuré'])
    expect(group.getByRole('button', { name: 'murmuré' })).toHaveAttribute('aria-pressed', 'true')
    expect(useGraphStore.getState().sceneDirty).toBe(true)
  })
})

describe('profil d’auteur', () => {
  it('propose équipe et voix fournies, enregistre le choix et montre sa description', async () => {
    openScene()
    renderExpanded()
    const select = screen.getByRole('combobox', { name: 'Profil d’auteur' })
    await waitFor(() =>
      expect(within(select).getAllByRole('option').map((option) => option.textContent)).toEqual([
        'aucun',
        'Salutation',
        'Littéraire',
      ]),
    )

    fireEvent.change(select, { target: { value: 'equipe' } })
    expect(scene()?.authorProfileId).toBe('equipe')
    expect(screen.getByText('Répliques mesurées.')).toBeInTheDocument()

    fireEvent.change(select, { target: { value: '' } })
    expect(scene()?.authorProfileId).toBeNull()
  })

  it('un profil introuvable se dit, y compris dans la ligne de contexte', async () => {
    openScene({ authorProfileId: 'supprimé' })
    renderExpanded()

    expect(await screen.findByText(/Profil introuvable/)).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Ce que le modèle saura' })).toHaveTextContent(
      'profil introuvable',
    )
  })
})

describe('brief et mentions', () => {
  it('« @ » + saisie propose les fiches ; choisir écrit @Nom et lie la fiche une fois', () => {
    openScene()
    renderExpanded()

    type('Il tend @ann')
    const list = screen.getByRole('listbox', { name: 'Fiches à citer' })
    expect(within(list).getByRole('option')).toHaveTextContent('Anneau de Vœuobjet')
    fireEvent.keyDown(brief(), { key: 'Enter' })

    expect(scene()?.brief).toBe('Il tend @Anneau de Vœu ')
    expect(scene()?.linkedEntries).toEqual([
      { category: 'items', name: 'Anneau de Vœu', mode: 'full', entryId: 'page-anneau' },
    ])
    expect(screen.queryByRole('listbox', { name: 'Fiches à citer' })).not.toBeInTheDocument()

    type('Il tend @Anneau de Vœu puis @ann')
    fireEvent.mouseDown(
      within(screen.getByRole('listbox', { name: 'Fiches à citer' })).getByRole('option'),
    )
    expect(scene()?.linkedEntries).toHaveLength(1)

    // Effacer la mention ne retire pas la fiche.
    type('Il tend la main.')
    expect(scene()?.linkedEntries).toHaveLength(1)
  })

  it('mentionner le PNJ n’ajoute rien ; « @xyz » reste du texte', () => {
    openScene()
    renderExpanded()

    type('@gri')
    fireEvent.keyDown(brief(), { key: 'Enter' })
    expect(scene()?.brief).toBe(`@${GRISH} `)
    expect(scene()?.linkedEntries).toEqual([])

    type('@xyz')
    expect(screen.queryByRole('listbox', { name: 'Fiches à citer' })).not.toBeInTheDocument()
    act(() => brief().blur())
    expect(screen.queryByRole('textbox', { name: 'Brief de la scène' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '@xyz' })).not.toBeInTheDocument()
  })

  it('ÉCHAP ferme la liste, puis remet le brief en forme ; Entrée le rouvre', () => {
    openScene()
    renderExpanded()

    type('@kor')
    fireEvent.keyDown(brief(), { key: 'Escape' })
    expect(screen.queryByRole('listbox', { name: 'Fiches à citer' })).not.toBeInTheDocument()
    fireEvent.keyDown(brief(), { key: 'Escape' })

    const read = screen.getByRole('group', { name: 'Brief de la scène' })
    expect(read).toHaveFocus()
    expect(read).toHaveTextContent('@kor')
    fireEvent.keyDown(read, { key: 'Enter' })
    expect(brief()).toHaveFocus()
  })

  it('flèche bas puis Entrée choisit la deuxième fiche proposée', () => {
    useSceneCatalogStore.setState({
      items: [
        { name: 'Anneau de Vœu', data: {} },
        { name: 'Anneau Brisé', data: {} },
      ],
    })
    openScene()
    renderExpanded()

    type('@ann')
    fireEvent.keyDown(brief(), { key: 'ArrowDown' })
    fireEvent.keyDown(brief(), { key: 'Enter' })

    expect(scene()?.brief).toBe('@Anneau Brisé ')
  })

  it('seule une Entrée simple choisit : ni Maj, ni Ctrl, ni composition en cours', () => {
    openScene()
    renderExpanded()
    type('@ann')

    for (const modifier of [{ shiftKey: true }, { ctrlKey: true }, { isComposing: true }]) {
      fireEvent.keyDown(brief(), { key: 'Enter', ...modifier })
    }

    expect(scene()?.brief).toBe('@ann')
    expect(screen.getByRole('listbox', { name: 'Fiches à citer' })).toBeInTheDocument()
  })

  it('effacer dans le nom repropose les fiches, après un choix comme après ÉCHAP', () => {
    openScene()
    renderExpanded()
    const list = () => screen.queryByRole('listbox', { name: 'Fiches à citer' })

    type('@ann')
    fireEvent.keyDown(brief(), { key: 'Enter' })
    expect(list()).not.toBeInTheDocument()
    type('@Anneau de V')
    expect(list()).toBeInTheDocument()

    fireEvent.keyDown(brief(), { key: 'Escape' })
    expect(list()).not.toBeInTheDocument()
    type('@Anneau de ')
    expect(list()).toBeInTheDocument()
  })

  it('la fenêtre qui perd le focus laisse le champ ouvert', () => {
    openScene({ brief: 'Il répare.' })
    renderExpanded()
    fireEvent.keyDown(screen.getByRole('group', { name: 'Brief de la scène' }), { key: 'Enter' })
    const field = brief()
    expect(field).toHaveFocus()

    // Alt+Tab : « blur » sans que le champ cesse d'être l'élément actif.
    fireEvent.blur(field)
    expect(brief()).toBe(field)

    act(() => field.blur())
    expect(screen.queryByRole('textbox', { name: 'Brief de la scène' })).not.toBeInTheDocument()
  })

  it('lecture seule : le brief se focalise pour défiler, sans s’ouvrir', () => {
    openScene({ brief: 'Il répare.' })
    useGraphStore.setState({ canEditDocument: false })
    renderExpanded()
    const read = screen.getByRole('group', { name: 'Brief de la scène' })

    expect(read).toHaveAttribute('tabindex', '0')
    fireEvent.click(read)
    fireEvent.keyDown(read, { key: 'Enter' })

    expect(screen.queryByRole('textbox', { name: 'Brief de la scène' })).not.toBeInTheDocument()
  })

  it('l’aperçu et la fiche gardent le focus après un clic dans leur texte', () => {
    openScene({ brief: `@${GRISH} arrive.` })
    renderExpanded()
    const mention = screen.getByRole('button', { name: `@${GRISH}` })

    fireEvent.click(mention)
    const card = screen.getByRole('dialog', { name: `Aperçu de la fiche ${GRISH}` })
    expect(card).toHaveAttribute('tabindex', '-1')
    act(() => card.focus())
    expect(card).toHaveFocus()
    fireEvent.keyDown(card, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    fireEvent.click(mention)
    fireEvent.click(screen.getByRole('button', { name: /Ouvrir la fiche/ }))
    const full = screen.getByRole('dialog', { name: `Fiche ${GRISH}` })
    expect(full).toHaveAttribute('tabindex', '-1')
    act(() => full.focus())
    fireEvent.keyDown(full, { key: 'Tab', shiftKey: true })
    expect(full.contains(document.activeElement)).toBe(true)
    expect(document.activeElement).not.toBe(full)
    act(() => full.focus())
    fireEvent.keyDown(full, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('le focus parti ailleurs ferme l’aperçu sans être ramené', () => {
    openScene({ brief: `@${GRISH} arrive.` })
    renderExpanded()
    fireEvent.click(screen.getByRole('button', { name: `@${GRISH}` }))
    const elsewhere = screen.getByRole('button', { name: 'tension' })

    act(() => elsewhere.focus())

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(elsewhere).toHaveFocus()
  })

  it('un clic dans le texte l’ouvre en texte brut, curseur à l’endroit cliqué', () => {
    openScene({ brief: `La caravane de @${GRISH} arrive.` })
    renderExpanded()
    const tail = screen.getByText('arrive.', { exact: false })
    window.getSelection()?.collapse(tail.firstChild, 3)

    fireEvent.click(tail)

    expect(brief().value).toBe(`La caravane de @${GRISH} arrive.`)
    expect(brief()).toHaveFocus()
    expect(brief().selectionStart).toBe(brief().value.indexOf(' arrive.') + 3)
    act(() => brief().blur())
    expect(screen.getByRole('button', { name: `@${GRISH}` })).toBeInTheDocument()
  })

  it('une mention ouvre l’aperçu, puis la fiche complète ; ÉCHAP rend le focus', () => {
    openScene({ brief: `La caravane de @${GRISH} arrive.` })
    renderExpanded()
    const mention = screen.getByRole('button', { name: `@${GRISH}` })

    fireEvent.click(mention)
    const preview = screen.getByRole('dialog', { name: `Aperçu de la fiche ${GRISH}` })
    expect(preview).toHaveTextContent('La Forge ambulante')
    expect(preview).toHaveTextContent('Personnages · Forge itinérante')
    expect(preview).toHaveTextContent('Un Moribandon qui répare les objets brisés.')
    fireEvent.keyDown(preview, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(mention).toHaveFocus()

    fireEvent.click(mention)
    fireEvent.click(screen.getByRole('button', { name: /Ouvrir la fiche/ }))
    const full = screen.getByRole('dialog', { name: `Fiche ${GRISH}` })
    expect(within(full).getByText('Sections GDD')).toBeInTheDocument()
    fireEvent.keyDown(full, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(mention).toHaveFocus()

    // Tab depuis l'aperçu : il se ferme, le focus repart de la mention.
    fireEvent.click(mention)
    fireEvent.keyDown(screen.getByRole('button', { name: /Ouvrir la fiche/ }), { key: 'Tab' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(mention).toHaveFocus()
  })

  it('la puce d’une fiche liée ouvre aussi son aperçu, même en lecture seule', () => {
    openScene({
      linkedEntries: [{ category: 'items', name: 'Anneau de Vœu', mode: 'full', entryId: null }],
    })
    useGraphStore.setState({ canEditDocument: false })
    renderExpanded()

    fireEvent.click(screen.getByRole('button', { name: 'Aperçu de Anneau de Vœu' }))

    expect(
      screen.getByRole('dialog', { name: 'Aperçu de la fiche Anneau de Vœu' }),
    ).toBeInTheDocument()
  })

  it('« Ce que le modèle saura » : fiches envoyées, brief, ton, profil', async () => {
    openScene({
      // Un nom libre, sans fiche au GDD, n'est pas compté.
      npcs: [
        { name: GRISH, entryId: 'page-grish' },
        { name: 'Passant sans fiche', entryId: null },
      ],
      brief: 'Il répare.',
      tones: ['tension'],
      authorProfileId: 'literary',
    })
    renderExpanded()

    const line = screen.getByRole('group', { name: 'Ce que le modèle saura' })
    expect(line).toHaveTextContent(`2 fiches envoyées : ${GRISH} · Uresaïr`)
    await waitFor(() => expect(line).toHaveTextContent('brief · ton · profil'))
  })
})

describe('ton libre', () => {
  it('ÉCHAP abandonne la saisie sans toucher aux tons', () => {
    openScene({ tones: ['tension'] })
    renderExpanded()
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter un ton' }))
    const field = screen.getByRole('textbox', { name: 'Nouveau ton' })
    fireEvent.change(field, { target: { value: 'murmuré' } })

    fireEvent.keyDown(field, { key: 'Escape' })

    expect(scene()?.tones).toEqual(['tension'])
    expect(screen.queryByRole('textbox', { name: 'Nouveau ton' })).not.toBeInTheDocument()
  })
})

describe('scène neuve', () => {
  it('fiche dépliée et emplacement ; son bouton crée l’ouverture et l’ouvre à l’éditeur', () => {
    openScene({}, [])
    render(
      <>
        <SceneSheetBar />
        <SceneFirstSlot />
      </>,
    )
    expect(screen.getByRole('button', { name: /replier la fiche/ })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Écrire la première réplique' }))

    const state = useGraphStore.getState()
    expect(state.nodes).toHaveLength(1)
    expect(state.nodes[0]).toMatchObject({
      id: 'START',
      data: { speaker: GRISH, line: '', choices: [] },
    })
    expect(state.selectedNodeId).toBe('START')
    expect(useGraphViewStore.getState().nodeEditRequest).toBe('START')
    expect(
      screen.queryByRole('region', { name: 'Première réplique à écrire' }),
    ).not.toBeInTheDocument()
  })

  it('l’emplacement disparaît dès qu’une réplique existe', () => {
    openScene({}, [])
    render(<SceneFirstSlot />)
    expect(screen.getByRole('region', { name: 'Première réplique à écrire' })).toBeInTheDocument()

    act(() => useGraphStore.setState({ nodes: [node('autre', GRISH)] }))

    expect(
      screen.queryByRole('region', { name: 'Première réplique à écrire' }),
    ).not.toBeInTheDocument()
  })

  it('invité : l’emplacement ne propose aucun geste', () => {
    openScene({}, [])
    useAuthStore.setState({ user: { role: 'guest' } } as never)
    render(<SceneFirstSlot />)

    expect(
      screen.queryByRole('button', { name: 'Écrire la première réplique' }),
    ).not.toBeInTheDocument()
    expect(screen.getByText(/Lecture seule/)).toBeInTheDocument()
  })
})
