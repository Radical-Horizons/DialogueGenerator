import type { ReactFlowInstance } from 'reactflow'
import { describe, expect, it, vi } from 'vitest'

import { manualNodePositionInView } from './manualNodePlacement'

function canvasAt(left: number, top: number, width: number, height: number): HTMLElement {
  const element = document.createElement('div')
  vi.spyOn(element, 'getBoundingClientRect').mockReturnValue({
    left,
    top,
    width,
    height,
  } as DOMRect)
  return element
}

/** Vue décalée et zoomée : le centre écran tombe loin de l'origine du graphe. */
const zoomedOutInstance = {
  screenToFlowPosition: ({ x, y }: { x: number; y: number }) => ({
    x: (x - 100) * 2 + 5000,
    y: (y - 50) * 2 - 3000,
  }),
} as unknown as ReactFlowInstance

describe('manualNodePositionInView', () => {
  it('centre le nœud sur la vue courante, quel que soit le nombre de nœuds', () => {
    const position = manualNodePositionInView(zoomedOutInstance, canvasAt(100, 50, 800, 600), 0)

    expect(position).toEqual({ x: 5800 - 140, y: -2400 - 60 })
  })

  it('décale les créations successives puis repart du centre', () => {
    const canvas = canvasAt(100, 50, 800, 600)
    const first = manualNodePositionInView(zoomedOutInstance, canvas, 0)
    const second = manualNodePositionInView(zoomedOutInstance, canvas, 1)
    const afterCascade = manualNodePositionInView(zoomedOutInstance, canvas, 6)

    expect(second.x).toBeGreaterThan(first.x)
    expect(second.y).toBeGreaterThan(first.y)
    expect(afterCascade).toEqual(first)
  })

  it('reste dans la vue même avec des centaines de nœuds', () => {
    const position = manualNodePositionInView(zoomedOutInstance, canvasAt(100, 50, 800, 600), 503)

    expect(position.x).toBeLessThan(6600)
    expect(position.y).toBeLessThan(-1800)
  })

  it('retombe sur l’escalier historique sans canvas monté', () => {
    expect(manualNodePositionInView(null, null, 2)).toEqual({ x: 230, y: 140 })
  })
})
