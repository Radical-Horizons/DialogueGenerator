/**
 * Page standalone : l'URL suit le dialogue que le graphe affiche réellement.
 */
import { act, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useGraphViewStore } from '../store/graphViewStore'
import { GraphEditorPage } from './GraphEditorPage'

vi.mock('../components/graph/GraphEditor', () => ({
  GraphEditor: ({ onActiveDialogueDeleted }: { onActiveDialogueDeleted?: () => void }) => (
    <button type="button" onClick={onActiveDialogueDeleted}>
      dialogue supprimé
    </button>
  ),
}))

function CurrentPath() {
  return <div data-testid="path">{useLocation().pathname}</div>
}

describe('GraphEditorPage — URL du dialogue affiché', () => {
  beforeEach(() => {
    useGraphViewStore.setState({ routeDialogueRevert: null })
  })

  it("remet l'URL sur le dialogue réellement affiché", () => {
    render(
      <MemoryRouter initialEntries={['/graph-editor/B']}>
        <Routes>
          <Route
            path="/graph-editor/:dialogueId"
            element={
              <>
                <GraphEditorPage />
                <CurrentPath />
              </>
            }
          />
        </Routes>
      </MemoryRouter>,
    )
    expect(screen.getByTestId('path')).toHaveTextContent('/graph-editor/B')

    act(() => {
      useGraphViewStore.getState().requestRouteDialogueRevert('Dialogue A.json')
    })

    expect(screen.getByTestId('path')).toHaveTextContent('/graph-editor/Dialogue%20A')
    expect(useGraphViewStore.getState().routeDialogueRevert).toBeNull()
  })

  it("quitte l'adresse du dialogue supprimé", () => {
    render(
      <MemoryRouter initialEntries={['/graph-editor/B']}>
        <Routes>
          <Route path="/graph-editor/:dialogueId" element={<GraphEditorPage />} />
          <Route path="/graph-editor" element={<GraphEditorPage />} />
        </Routes>
        <CurrentPath />
      </MemoryRouter>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'dialogue supprimé' }))

    expect(screen.getByTestId('path').textContent).toBe('/graph-editor')
  })
})
