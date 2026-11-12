/**
 * Page standalone : quand le graphe n'a pas pu quitter un dialogue, l'URL revient dessus.
 */
import { act, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useGraphViewStore } from '../store/graphViewStore'
import { GraphEditorPage } from './GraphEditorPage'

vi.mock('../components/graph/GraphEditor', () => ({
  GraphEditor: () => null,
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
})
