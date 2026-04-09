/**
 * Tests FlowSimulationPanel (FR46 / Story 4.11).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { FlowSimulationPanel } from '../components/graph/FlowSimulationPanel'

const hoisted = vi.hoisted(() => {
  const requestFitViewOnNodeIdsMock = vi.fn()
  const simulateFlowMock = vi.fn()

  return { requestFitViewOnNodeIdsMock, simulateFlowMock }
})

vi.mock('../store/graphViewStore', () => ({
  useGraphViewStore: vi.fn((sel: (s: unknown) => unknown) =>
    sel({
      requestFitViewOnNodeIds: hoisted.requestFitViewOnNodeIdsMock,
    })
  ),
}))

vi.mock('../store/graphStore', () => ({
  useGraphStore: vi.fn((sel: (s: unknown) => unknown) =>
    sel({
      nodes: [{ id: 'A', position: { x: 0, y: 0 }, data: {} }],
      edges: [],
    })
  ),
}))

vi.mock('../api/graph', () => ({
  simulateFlow: hoisted.simulateFlowMock,
}))

const { requestFitViewOnNodeIdsMock, simulateFlowMock } = hoisted

const DEAD_END_RESPONSE = {
  dead_ends: [
    { type: 'dead_end_node', node_id: 'X', message: 'Nœud « X » : dead end', severity: 'error' },
    { type: 'dead_end_node', node_id: 'Y', message: 'Nœud « Y » : dead end', severity: 'error' },
  ],
  cul_de_sacs: [
    { type: 'cul_de_sac_node', node_id: 'Z', message: 'Nœud « Z » : cul-de-sac', severity: 'warning' },
  ],
}

const EMPTY_RESPONSE = { dead_ends: [], cul_de_sacs: [] }

describe('FlowSimulationPanel (FR46)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders dead end count and cul-de-sac count after simulation', async () => {
    simulateFlowMock.mockResolvedValueOnce(DEAD_END_RESPONSE)

    render(<FlowSimulationPanel onClose={vi.fn()} />)
    const btn = screen.getByTestId('flow-simulation-run')
    await act(async () => {
      fireEvent.click(btn)
    })

    expect(screen.getByText(/2.*dead end/i)).toBeTruthy()
    expect(screen.getByText(/1.*cul.de.sac/i)).toBeTruthy()
  })

  it('renders dead end messages', async () => {
    simulateFlowMock.mockResolvedValueOnce(DEAD_END_RESPONSE)

    render(<FlowSimulationPanel onClose={vi.fn()} />)
    await act(async () => {
      fireEvent.click(screen.getByTestId('flow-simulation-run'))
    })

    expect(screen.getByText(/Nœud « X »/)).toBeTruthy()
    expect(screen.getByText(/Nœud « Y »/)).toBeTruthy()
  })

  it('navigates on dead end item click via requestFitViewOnNodeIds', async () => {
    simulateFlowMock.mockResolvedValueOnce(DEAD_END_RESPONSE)

    render(<FlowSimulationPanel onClose={vi.fn()} />)
    await act(async () => {
      fireEvent.click(screen.getByTestId('flow-simulation-run'))
    })

    const items = screen.getAllByTestId('flow-simulation-dead-end-item')
    fireEvent.click(items[0])
    expect(requestFitViewOnNodeIdsMock).toHaveBeenCalledWith(['X'])
  })

  it('navigates on cul-de-sac item click via requestFitViewOnNodeIds', async () => {
    simulateFlowMock.mockResolvedValueOnce(DEAD_END_RESPONSE)

    render(<FlowSimulationPanel onClose={vi.fn()} />)
    await act(async () => {
      fireEvent.click(screen.getByTestId('flow-simulation-run'))
    })

    const items = screen.getAllByTestId('flow-simulation-cul-de-sac-item')
    fireEvent.click(items[0])
    expect(requestFitViewOnNodeIdsMock).toHaveBeenCalledWith(['Z'])
  })

  it('renders no-problem message when response is empty', async () => {
    simulateFlowMock.mockResolvedValueOnce(EMPTY_RESPONSE)

    render(<FlowSimulationPanel onClose={vi.fn()} />)
    await act(async () => {
      fireEvent.click(screen.getByTestId('flow-simulation-run'))
    })

    expect(screen.getByText(/aucun problème détecté/i)).toBeTruthy()
  })

  it('calls onClose when close button is clicked', () => {
    const onClose = vi.fn()
    render(<FlowSimulationPanel onClose={onClose} />)
    fireEvent.click(screen.getByTestId('flow-simulation-close'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
