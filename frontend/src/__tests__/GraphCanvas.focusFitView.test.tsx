/**
 * `focusNode` doit recentrer la vue sur le nœud, pas seulement le sélectionner.
 *
 * Régression : l'effet de focus retire la tête de file (`dequeueFocus`) avant de
 * programmer son `fitView` ; le re-rendu qui suit changeait `focusHeadId` et le
 * nettoyage de l'effet annulait le minuteur. Le nœud était sélectionné mais la vue ne
 * bougeait jamais — un nœud généré hors champ restait invisible (E2E génération AC#1).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import React from 'react'
import { render, act } from '@testing-library/react'
import { ReactFlowProvider } from 'reactflow'
import type { Node } from 'reactflow'
import { GraphCanvas } from '../components/graph/GraphCanvas'
import { useGraphStore } from '../store/graphStore'
import { useGraphViewStore } from '../store/graphViewStore'

const fitViewSpy = vi.fn()

vi.mock('reactflow', async (importOriginal) => {
  const mod = await importOriginal<typeof import('reactflow')>()
  return {
    ...mod,
    useReactFlow: () => ({ ...mod.useReactFlow(), fitView: fitViewSpy }),
  }
})

vi.mock('../api/graph', () => ({
  getNodePrompt: vi.fn(),
  loadGraph: vi.fn(),
  saveGraph: vi.fn(),
  saveGraphAndWrite: vi.fn(),
  generateNode: vi.fn(),
  validateGraph: vi.fn(),
  calculateLayout: vi.fn(),
}))

/** Délai du `fitView` de focus (100 ms) + marge. */
const FOCUS_FIT_SETTLE_MS = 200

function dialogueNode(id: string, x: number): Node {
  return {
    id,
    type: 'dialogueNode',
    position: { x, y: 0 },
    data: { id, speaker: 'A', line: `Réplique ${id}` },
  }
}

function renderGraphCanvas() {
  return render(
    React.createElement(ReactFlowProvider, null, React.createElement(GraphCanvas))
  )
}

async function settleFocus() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, FOCUS_FIT_SETTLE_MS))
  })
}

function fittedNodeIds(): string[][] {
  return fitViewSpy.mock.calls.map(
    ([options]) => ((options as { nodes?: Array<{ id: string }> } | undefined)?.nodes ?? []).map((n) => n.id)
  )
}

describe('GraphCanvas — focusNode recentre la vue', () => {
  beforeEach(() => {
    useGraphStore.getState().resetGraph()
    useGraphViewStore.getState().clearFocus()
    useGraphStore.getState().addNode(dialogueNode('n1', 0))
    useGraphStore.getState().addNode(dialogueNode('n2', 900))
    fitViewSpy.mockClear()
  })

  it('appelle fitView sur le nœud focalisé après l’avoir sélectionné', async () => {
    renderGraphCanvas()
    await act(async () => {
      useGraphViewStore.getState().focusNode('n2')
    })
    await settleFocus()

    expect(useGraphStore.getState().selectedNodeId).toBe('n2')
    expect(useGraphViewStore.getState().focusQueue).toEqual([])
    expect(fittedNodeIds()).toEqual([['n2']])
  })

  it('deux focus rapprochés : la vue finit sur le dernier', async () => {
    renderGraphCanvas()
    await act(async () => {
      useGraphViewStore.getState().focusNode('n1')
      useGraphViewStore.getState().focusNode('n2')
    })
    await settleFocus()

    expect(fittedNodeIds()).toEqual([['n2']])
    expect(useGraphStore.getState().selectedNodeId).toBe('n2')
  })

  it('aucun fitView après démontage du canvas', async () => {
    const { unmount } = renderGraphCanvas()
    await act(async () => {
      useGraphViewStore.getState().focusNode('n2')
    })
    unmount()
    await settleFocus()

    expect(fitViewSpy).not.toHaveBeenCalled()
  })
})
