/**
 * Menus de la toolbar sur bureau : les outils s'ouvrent dans l'inspecteur, et un nouveau nœud
 * apparaît dans la zone visible.
 *
 * Régression recette : les entrées du menu Qualités basculaient un état que seul le rendu
 * étroit lit, donc rien ne se passait sur bureau.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactFlowInstance } from 'reactflow'
import { useGraphStore } from '../store/graphStore'
import { useGraphViewStore } from '../store/graphViewStore'
import { useUiLayoutStore } from '../store/uiLayoutStore'
import { makeMockToolbar, renderGraphEditorHeader } from './graphEditorHeaderTestUtils'

vi.mock('../api/graph', () => ({
  loadGraph: vi.fn(),
  saveGraph: vi.fn(),
  saveGraphAndWrite: vi.fn(),
  generateNode: vi.fn(),
  validateGraph: vi.fn(),
  calculateLayout: vi.fn(),
}))

describe('GraphEditorHeader — menus sur bureau', () => {
  beforeEach(() => {
    useGraphStore.getState().resetGraph()
    useUiLayoutStore.setState({ inspectorTab: 'node' })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    useGraphViewStore.getState().registerCanvasElement(null)
    useGraphViewStore.getState().registerReactFlowInstance(null)
  })

  it.each([
    ['btn-quality-llm', 'quality'],
    ['btn-ai-slop', 'slop'],
    ['btn-cost-breakdown', 'cost'],
  ] as const)('%s ouvre l’onglet %s de l’inspecteur', async (buttonId, tab) => {
    const user = userEvent.setup()
    const setShowQualityLlmPanel = vi.fn()
    const setShowAiSlopPanel = vi.fn()
    const setShowCostBreakdown = vi.fn()
    renderGraphEditorHeader({
      narrow: false,
      inspectorAvailable: true,
      toolbar: makeMockToolbar({
        showValidationToolsDropdown: true,
        setShowQualityLlmPanel,
        setShowAiSlopPanel,
        setShowCostBreakdown,
      }),
    })

    await user.click(screen.getByTestId(buttonId))

    expect(useUiLayoutStore.getState().inspectorTab).toBe(tab)
    expect(setShowQualityLlmPanel).not.toHaveBeenCalled()
    expect(setShowAiSlopPanel).not.toHaveBeenCalled()
    expect(setShowCostBreakdown).not.toHaveBeenCalled()
  })

  it('recliquer sur l’entrée garde l’onglet ouvert', async () => {
    const user = userEvent.setup()
    useUiLayoutStore.setState({ inspectorTab: 'quality' })
    renderGraphEditorHeader({
      narrow: false,
      inspectorAvailable: true,
      toolbar: makeMockToolbar({ showValidationToolsDropdown: true }),
    })

    await user.click(screen.getByTestId('btn-quality-llm'))

    expect(useUiLayoutStore.getState().inspectorTab).toBe('quality')
  })

  it('sans inspecteur, l’entrée garde son panneau flottant', async () => {
    const user = userEvent.setup()
    const setShowAiSlopPanel = vi.fn()
    renderGraphEditorHeader({
      narrow: false,
      inspectorAvailable: false,
      toolbar: makeMockToolbar({ showValidationToolsDropdown: true, setShowAiSlopPanel }),
    })

    await user.click(screen.getByTestId('btn-ai-slop'))

    expect(setShowAiSlopPanel).toHaveBeenCalledTimes(1)
    expect(useUiLayoutStore.getState().inspectorTab).toBe('node')
  })

  it('« Nouveau nœud » pose le nœud au centre de la vue et n’empile qu’un snapshot', async () => {
    const user = userEvent.setup()
    const canvas = document.createElement('div')
    vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      top: 0,
      width: 1000,
      height: 800,
    } as DOMRect)
    useGraphViewStore.getState().registerCanvasElement(canvas)
    useGraphViewStore.getState().registerReactFlowInstance({
      screenToFlowPosition: ({ x, y }: { x: number; y: number }) => ({ x: x + 4000, y: y + 2000 }),
    } as unknown as ReactFlowInstance)
    renderGraphEditorHeader({
      narrow: false,
      inspectorAvailable: true,
      toolbar: makeMockToolbar({
        showActionsDropdown: true,
        reactFlowInstance: useGraphViewStore.getState().reactFlowInstance,
      }),
    })

    await user.click(screen.getByTestId('btn-new-manual-node'))

    const [created] = useGraphStore.getState().nodes
    expect(created.position).toEqual({ x: 4500 - 140, y: 2400 - 60 })
    expect(useGraphStore.getState().selectedNodeId).toBe(created.id)
    expect(useGraphStore.getState().undoStack).toHaveLength(1)
  })
})
