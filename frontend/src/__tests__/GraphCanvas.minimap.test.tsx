/**
 * Minimap du graphe : masquée par défaut, « CARTE » dans la barrette de zoom la bascule.
 *
 * Affichée d'office, elle recouvrait le coin bas-droit du canvas — là où atterrissent
 * les nœuds générés — et interceptait les clics sur leurs actions (E2E accept/reject).
 * La maquette 2e n'en montre pas. Vrai `MiniMap` React Flow ici, pas de mock.
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest'
import React from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ReactFlowProvider } from 'reactflow'
import { GraphCanvas } from '../components/graph/GraphCanvas'
import { useGraphStore } from '../store/graphStore'
import { useUiLayoutStore } from '../store/uiLayoutStore'
import { GRAPH_TOOLBAR_COMFORT_MIN_WIDTH_PX } from '../theme/responsiveChrome'

vi.mock('../api/graph', () => ({
  getNodePrompt: vi.fn(),
  loadGraph: vi.fn(),
  saveGraph: vi.fn(),
  saveGraphAndWrite: vi.fn(),
  generateNode: vi.fn(),
  validateGraph: vi.fn(),
  calculateLayout: vi.fn(),
}))

/**
 * jsdom mesure 0 px : le canvas serait « étroit » et la barrette perdrait ses boutons
 * (dont « CARTE »). On lui donne une largeur de bureau.
 */
const CANVAS_WIDTH_PX = GRAPH_TOOLBAR_COMFORT_MIN_WIDTH_PX + 400
const CANVAS_HEIGHT_PX = 700
const originalClientWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth')
const originalClientHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientHeight')

function renderGraphCanvas() {
  return render(
    React.createElement(ReactFlowProvider, null, React.createElement(GraphCanvas))
  )
}

describe('GraphCanvas — minimap à la demande', () => {
  beforeAll(() => {
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
      configurable: true,
      get: () => CANVAS_WIDTH_PX,
    })
    Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
      configurable: true,
      get: () => CANVAS_HEIGHT_PX,
    })
  })

  afterAll(() => {
    if (originalClientWidth) {
      Object.defineProperty(HTMLElement.prototype, 'clientWidth', originalClientWidth)
    }
    if (originalClientHeight) {
      Object.defineProperty(HTMLElement.prototype, 'clientHeight', originalClientHeight)
    }
  })

  beforeEach(() => {
    useGraphStore.getState().resetGraph()
    useUiLayoutStore.setState({ showGraphMinimap: false })
    useGraphStore.getState().addNode({
      id: 'n1',
      type: 'dialogueNode',
      position: { x: 0, y: 0 },
      data: { id: 'n1', speaker: 'A', line: 'Bonjour' },
    })
  })

  it('ne rend pas la minimap par défaut', () => {
    renderGraphCanvas()
    expect(screen.queryByTestId('rf__minimap')).not.toBeInTheDocument()
    expect(screen.getByTestId('graph-minimap-toggle')).toHaveAttribute('aria-pressed', 'false')
  })

  it('« CARTE » affiche la minimap, un second clic la masque', async () => {
    const user = userEvent.setup()
    renderGraphCanvas()
    const toggle = screen.getByTestId('graph-minimap-toggle')
    expect(toggle).toHaveTextContent(/carte/i)

    await user.click(toggle)
    expect(screen.getByTestId('rf__minimap')).toBeInTheDocument()
    expect(toggle).toHaveAttribute('aria-pressed', 'true')
    expect(useUiLayoutStore.getState().showGraphMinimap).toBe(true)

    await user.click(toggle)
    expect(screen.queryByTestId('rf__minimap')).not.toBeInTheDocument()
    expect(toggle).toHaveAttribute('aria-pressed', 'false')
    expect(useUiLayoutStore.getState().showGraphMinimap).toBe(false)
  })

  it('« CARTE » suit les autres boutons de la barrette, après « AJUSTER »', () => {
    renderGraphCanvas()
    const buttons = Array.from(
      screen.getByTestId('graph-zoom-bar').querySelectorAll('button')
    ).map((b) => b.textContent?.trim())
    expect(buttons).toEqual(['−', '+', 'Ajuster', 'Carte'])
  })
})
