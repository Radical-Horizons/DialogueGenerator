/**
 * Fiche de scène en tête du graphe (story 20.4 lot A).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { SceneSheetBar } from './SceneSheetBar'
import { useGraphStore } from '../../store/graphStore'
import { useAuthStore } from '../../store/authStore'
import { useContextStore } from '../../store/contextStore'
import { useSceneCatalogStore } from '../../store/sceneCatalogStore'

vi.mock('../../api/authorProfiles', () => ({
  listAuthorProfilesApi: vi.fn().mockResolvedValue([]),
  listPrebuiltAuthorProfilesApi: vi.fn().mockResolvedValue([]),
}))

const INITIAL_AUTH = useAuthStore.getState()

function node(id: string, speaker: string) {
  return {
    id,
    type: 'dialogueNode',
    position: { x: 0, y: 0 },
    data: { id, speaker, line: '*Il salue Uresaïr.*', choices: [] },
  }
}

function expand() {
  fireEvent.click(screen.getByRole('button', { name: /déplier la fiche/ }))
}

beforeEach(() => {
  useAuthStore.setState(INITIAL_AUTH, true)
  useGraphStore.getState().resetGraph()
  // Catalogue déjà chargé à la révision GDD courante : aucun appel réseau.
  useSceneCatalogStore.setState({
    characters: [
      { name: "Grish T'vok", data: { notion_page_id: 'page-grish' } },
      { name: 'Korga', data: { notion_page_id: 'page-korga' } },
      { name: "L'Éthérée", data: {} },
    ],
    places: [{ name: 'La Forge', data: { notion_page_id: 'page-forge' } }],
    loadedRevision: useContextStore.getState().gddDataRevision,
  })
  useContextStore.getState().clearSelections()
  useGraphStore.setState({
    documentId: 'forgeron',
    document: { schemaVersion: '1.2.0', title: 'Rencontre avec le forgeron' },
    nodes: [node('START', "Grish T'vok"), node('b', "Grish T'vok"), node('c', 'Grish T’vok')],
  })
})

describe('SceneSheetBar', () => {
  it('repliée en une ligne, déduite sans rien écrire', () => {
    render(<SceneSheetBar />)

    const summary = screen.getByTestId('scene-sheet-summary')
    expect(summary).toHaveTextContent('Rencontre avec le forgeron')
    expect(summary).toHaveTextContent("Grish T'vok face à Uresaïr")
    expect(summary).toHaveTextContent('lieu à préciser')
    expect(summary).toHaveTextContent('sans brief')
    expect(screen.getByText('Déduite — vérifier')).toBeInTheDocument()

    expand()

    expect(useGraphStore.getState().scene).toBeNull()
    expect(useGraphStore.getState().hasUnsavedChanges).toBe(false)
  })

  it('absente sans dialogue ouvert', () => {
    useGraphStore.setState({ documentId: null })

    render(<SceneSheetBar />)

    expect(screen.queryByTestId('scene-sheet')).not.toBeInTheDocument()
  })

  it('le brief, le lieu et le PJ s’écrivent sur place et marquent le dialogue à enregistrer', () => {
    render(<SceneSheetBar />)
    expand()

    fireEvent.change(screen.getByRole('textbox', { name: 'Brief de la scène' }), {
      target: { value: 'Il propose de réparer.' },
    })
    fireEvent.change(screen.getByTestId('scene-sheet-place'), { target: { value: 'Sous un pont' } })
    fireEvent.change(screen.getByRole('combobox', { name: 'PJ' }), {
      target: { value: 'Vethraak' },
    })

    const state = useGraphStore.getState()
    expect(state.scene).toMatchObject({
      brief: 'Il propose de réparer.',
      place: { name: 'Sous un pont', entryId: null },
      pc: { name: 'Vethraak' },
    })
    expect(state.sceneDirty).toBe(true)
    expect(state.hasUnsavedChanges).toBe(true)
  })

  it('PJ parmi les seuls jouables ; L’Éthérée n’est pas proposée comme PNJ', () => {
    render(<SceneSheetBar />)
    expand()
    const options = within(screen.getByRole('combobox', { name: 'PJ' })).getAllByRole('option')
    expect(options.map((option) => option.textContent)).toEqual([
      'à préciser',
      'Uresaïr',
      "L'Éthérée",
      'Vethraak',
      'Eonundé Alinen-Egan',
    ])

    fireEvent.click(screen.getByRole('button', { name: '+ Personnage' }))
    fireEvent.focus(screen.getByTestId('scene-sheet-add-character'))
    const suggestions = within(screen.getByRole('listbox'))
    expect(suggestions.getByRole('option', { name: 'Korga' })).toBeInTheDocument()
    expect(suggestions.queryByRole('option', { name: "L'Éthérée" })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('option', { name: 'Korga' }))

    expect(useGraphStore.getState().scene?.npcs).toContainEqual({
      name: 'Korga',
      entryId: 'page-korga',
    })
  })

  it('propose la graphie et ne réécrit qu’au clic', () => {
    render(<SceneSheetBar />)
    expand()
    const speakers = () => useGraphStore.getState().nodes.map((n) => n.data.speaker)
    expect(speakers()).toContain('Grish T’vok')

    fireEvent.click(screen.getByRole('button', { name: "Écrire « Grish T'vok »" }))

    expect(speakers()).toEqual(["Grish T'vok", "Grish T'vok", "Grish T'vok"])
  })

  it('« Attribuer à » réécrit les répliques sans locuteur', () => {
    useGraphStore.setState((state) => ({ nodes: [...state.nodes, node('vide', '')] }))
    render(<SceneSheetBar />)
    expand()

    fireEvent.click(screen.getByRole('button', { name: "Attribuer à Grish T'vok" }))

    expect(useGraphStore.getState().nodes.find((n) => n.id === 'vide')?.data.speaker).toBe(
      "Grish T'vok",
    )
  })

  it('retirer un PNJ le sort de la fiche', () => {
    render(<SceneSheetBar />)
    expand()

    fireEvent.click(screen.getByRole('button', { name: "Retirer le PNJ Grish T'vok" }))

    expect(useGraphStore.getState().scene?.npcs).toEqual([])
    expect(useGraphStore.getState().sceneDirty).toBe(true)
  })

  it('un lieu du GDD tapé autrement prend son nom ; une espace laisse écrire plus long', () => {
    render(<SceneSheetBar />)
    expand()
    const type = (value: string) =>
      fireEvent.change(screen.getByTestId('scene-sheet-place'), { target: { value } })

    type('la forge')
    expect(useGraphStore.getState().scene?.place).toEqual({
      name: 'La Forge',
      entryId: 'page-forge',
    })

    type('la forge ')
    expect(useGraphStore.getState().scene?.place?.name).toBe('la forge ')
    type('La Forge du nord')
    expect(useGraphStore.getState().scene?.place).toEqual({
      name: 'La Forge du nord',
      entryId: null,
    })
  })

  it('« Reprendre les fiches cochées » copie la colonne, retirable', () => {
    useContextStore.setState((state) => ({
      selections: { ...state.selections, items_excerpt: ['Anneau'] },
    }))
    render(<SceneSheetBar />)
    expand()

    fireEvent.click(screen.getByRole('button', { name: /Reprendre les fiches cochées/ }))

    expect(useGraphStore.getState().scene?.linkedEntries).toEqual([
      { category: 'items', name: 'Anneau', mode: 'excerpt', entryId: null },
    ])
    expect(screen.getByRole('button', { name: /Reprendre les fiches cochées/ })).toBeDisabled()

    fireEvent.click(screen.getByRole('button', { name: 'Retirer la fiche Anneau' }))

    expect(useGraphStore.getState().scene?.linkedEntries).toEqual([])
  })

  it.each([
    ['invité', () => useAuthStore.setState({ user: { role: 'guest' } } as never)],
    ['sans droit d’écriture', () => useGraphStore.setState({ canEditDocument: false })],
  ])('lecture seule : %s', (_label, restrict) => {
    restrict()
    render(<SceneSheetBar />)
    expand()

    expect(screen.getByText('Lecture seule')).toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: 'Brief de la scène' })).not.toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Brief de la scène' })).toHaveTextContent('Aucun brief.')
    expect(screen.queryByRole('combobox', { name: 'Profil d’auteur' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'tension' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Ajouter un ton' })).not.toBeInTheDocument()
    expect(screen.getByTestId('scene-sheet-place')).toBeDisabled()
    expect(screen.getByRole('combobox', { name: 'PJ' })).toBeDisabled()
    expect(screen.queryByRole('button', { name: '+ Personnage' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Écrire «/ })).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /Reprendre les fiches cochées/ }),
    ).not.toBeInTheDocument()
  })
})
