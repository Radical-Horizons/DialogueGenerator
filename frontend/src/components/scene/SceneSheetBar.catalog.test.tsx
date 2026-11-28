/**
 * Catalogue GDD de la fiche : chargé par la barre, rechargé quand le GDD change.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { SceneSheetBar } from './SceneSheetBar'
import * as contextAPI from '../../api/context'
import { useGraphStore } from '../../store/graphStore'
import { useContextStore } from '../../store/contextStore'
import { useSceneCatalogStore } from '../../store/sceneCatalogStore'

vi.mock('../../api/context', () => ({
  listCharacters: vi.fn(),
  listLocations: vi.fn(),
  listItems: vi.fn(),
  listSpecies: vi.fn(),
  listCommunities: vi.fn(),
}))

vi.mock('../../api/authorProfiles', () => ({
  listAuthorProfilesApi: vi.fn().mockResolvedValue([]),
  listPrebuiltAuthorProfilesApi: vi.fn().mockResolvedValue([]),
}))

const names = (entries: Array<{ name: string }>) => entries.map((entry) => entry.name)

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(contextAPI.listCharacters).mockResolvedValue({
    characters: [{ name: 'Korga', data: { notion_page_id: 'page-korga' } }],
    total: 1,
  })
  vi.mocked(contextAPI.listLocations).mockResolvedValue({
    locations: [{ name: 'La Forge', data: { notion_page_id: 'page-forge' } }],
    total: 1,
  })
  vi.mocked(contextAPI.listItems).mockResolvedValue({
    items: [{ name: 'Anneau', data: {} }],
    total: 1,
  })
  vi.mocked(contextAPI.listSpecies).mockResolvedValue({
    species: [{ name: 'Moribandons', data: {} }],
    total: 1,
  })
  vi.mocked(contextAPI.listCommunities).mockResolvedValue({
    communities: [{ name: 'Kurgarru', data: {} }],
    total: 1,
  })
  useGraphStore.getState().resetGraph()
  useGraphStore.setState({ documentId: 'forgeron', document: { title: 'Forgeron' } })
  useSceneCatalogStore.setState({
    characters: [],
    places: [],
    items: [],
    species: [],
    communities: [],
    loadedRevision: null,
  })
})

describe('SceneSheetBar — catalogue GDD', () => {
  it('charge les deux listes, remplit les sélecteurs et recharge quand le GDD change', async () => {
    render(<SceneSheetBar />)
    const revision = useContextStore.getState().gddDataRevision
    await waitFor(() =>
      expect(useSceneCatalogStore.getState().loadedRevision).toBe(revision),
    )
    expect(contextAPI.listCharacters).toHaveBeenCalledTimes(1)
    expect(contextAPI.listLocations).toHaveBeenCalledTimes(1)
    const loaded = useSceneCatalogStore.getState()
    expect(names(loaded.items)).toEqual(['Anneau'])
    expect(names(loaded.species)).toEqual(['Moribandons'])
    expect(names(loaded.communities)).toEqual(['Kurgarru'])

    // Scène sans réplique : la fiche est déjà dépliée.
    fireEvent.focus(screen.getByTestId('scene-sheet-place'))
    expect(
      within(screen.getByRole('listbox')).getByRole('option', { name: 'La Forge' }),
    ).toBeInTheDocument()
    fireEvent.mouseDown(document.body)

    fireEvent.click(screen.getByRole('button', { name: '+ Personnage' }))
    fireEvent.focus(screen.getByTestId('scene-sheet-add-character'))
    expect(
      within(screen.getByRole('listbox')).getByRole('option', { name: 'Korga' }),
    ).toBeInTheDocument()

    act(() => useContextStore.getState().bumpGddDataRevision())

    await waitFor(() =>
      expect(useSceneCatalogStore.getState().loadedRevision).toBe(revision + 1),
    )
    expect(contextAPI.listCharacters).toHaveBeenCalledTimes(2)
    expect(contextAPI.listLocations).toHaveBeenCalledTimes(2)
  })

  it('une liste en échec n’emporte pas les autres et tout se relit ensuite', async () => {
    vi.mocked(contextAPI.listSpecies).mockRejectedValue(new Error('indisponible'))

    await useSceneCatalogStore.getState().load(7)

    const partial = useSceneCatalogStore.getState()
    expect(names(partial.characters)).toEqual(['Korga'])
    expect(names(partial.places)).toEqual(['La Forge'])
    expect(names(partial.items)).toEqual(['Anneau'])
    expect(names(partial.communities)).toEqual(['Kurgarru'])
    expect(partial.species).toEqual([])
    expect(partial.loadedRevision).toBeNull()

    await useSceneCatalogStore.getState().load(7)

    expect(contextAPI.listSpecies).toHaveBeenCalledTimes(2)
    expect(contextAPI.listCharacters).toHaveBeenCalledTimes(2)
  })
})
