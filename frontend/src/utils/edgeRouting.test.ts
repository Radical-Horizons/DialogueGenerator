import { describe, expect, it } from 'vitest'
import {
  EDGE_ROUTING_CLEARANCE_PX,
  routeSmoothStepEdge,
  smoothStepSegments,
  type RoutingBox,
} from './edgeRouting'

function crosses(params: Parameters<typeof routeSmoothStepEdge>[0], box: RoutingBox): boolean {
  return smoothStepSegments(params, routeSmoothStepEdge(params)).some(([x1, y1, x2, y2]) => {
    return (
      Math.max(x1, x2) > box.x + 2 &&
      Math.min(x1, x2) < box.x + box.width - 2 &&
      Math.max(y1, y2) > box.y + 2 &&
      Math.min(y1, y2) < box.y + box.height - 2
    )
  })
}

describe('routeSmoothStepEdge', () => {
  it('garde le tracé par défaut quand il ne traverse aucun nœud', () => {
    const obstacles = [{ x: 600, y: 200, width: 280, height: 160 }]
    expect(
      routeSmoothStepEdge({ sourceX: 100, sourceY: 0, targetX: 100, targetY: 500, offset: 20, obstacles })
    ).toEqual({})
  })

  it("décale le couloir d'un renvoi qui remonterait à travers un nœud", () => {
    // Renvoi : source en bas à droite, cible en haut à gauche, un nœud pile au milieu.
    const middle = { x: 360, y: 300, width: 280, height: 160 }
    const params = { sourceX: 900, sourceY: 800, targetX: 100, targetY: 0, offset: 20, obstacles: [middle] }
    expect([
      middle.x - EDGE_ROUTING_CLEARANCE_PX,
      middle.x + middle.width + EDGE_ROUTING_CLEARANCE_PX,
    ]).toContain(routeSmoothStepEdge(params).centerX)
    expect(crosses(params, middle)).toBe(false)
  })

  it("loge le coude d'un fil descendant dans la bande libre au-dessus de la cible", () => {
    // Fil long : un nœud intermédiaire sous la cible horizontale du coude par défaut.
    const between = { x: 300, y: 260, width: 280, height: 160 }
    const params = { sourceX: 100, sourceY: 0, targetX: 440, targetY: 700, offset: 20, obstacles: [between] }
    const center = routeSmoothStepEdge(params)
    expect(center.centerY).toBeGreaterThan(between.y + between.height)
    expect(crosses(params, between)).toBe(false)
  })
})
