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
}))

beforeEach(() => {
  vi.mocked(contextAPI.listCharacters).mockResolvedValue({
    characters: [{ name: 'Korga', data: { notion_page_id: 'page-korga' } }],
    total: 1,
  })
  vi.mocked(contextAPI.listLocations).mockResolvedValue({
    locations: [{ name: 'La Forge', data: { notion_page_id: 'page-forge' } }],
    total: 1,
  })
  useGraphStore.getState().resetGraph()
  useGraphStore.setState({ documentId: 'forgeron', document: { title: 'Forgeron' } })
  useSceneCatalogStore.setState({ characters: [], places: [], loadedRevision: null })
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

    fireEvent.click(screen.getByRole('button', { name: /déplier la fiche/ }))
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
})
