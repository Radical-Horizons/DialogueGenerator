import { describe, expect, it } from 'vitest'
import {
  computeGraphMinimapSizePx,
  MINIMAP_MAX_EDITOR_FRACTION,
  REACT_FLOW_MINIMAP_DEFAULT_HEIGHT,
  REACT_FLOW_MINIMAP_DEFAULT_WIDTH,
} from './graphMinimapLayout'

describe('computeGraphMinimapSizePx', () => {
  it('retourne null si largeur ou hauteur éditeur non positive', () => {
    expect(computeGraphMinimapSizePx(0, 400)).toBeNull()
    expect(computeGraphMinimapSizePx(400, 0)).toBeNull()
    expect(computeGraphMinimapSizePx(-10, 200)).toBeNull()
  })

  it('grande surface : taille défaut React Flow (plafond 1)', () => {
    expect(computeGraphMinimapSizePx(1600, 1200)).toEqual({
      width: REACT_FLOW_MINIMAP_DEFAULT_WIDTH,
      height: REACT_FLOW_MINIMAP_DEFAULT_HEIGHT,
    })
  })

  it('respecte le plafond 3/8 largeur et hauteur', () => {
    const w = 320
    const h = 400
    const maxW = Math.floor(w * MINIMAP_MAX_EDITOR_FRACTION)
    const maxH = Math.floor(h * MINIMAP_MAX_EDITOR_FRACTION)
    const result = computeGraphMinimapSizePx(w, h)
    expect(result).not.toBeNull()
    expect(result!.width).toBeLessThanOrEqual(maxW)
    expect(result!.height).toBeLessThanOrEqual(maxH)
  })

  it('ratio 4:3 préservé (200:150) pour une entrée typique mobile', () => {
    const result = computeGraphMinimapSizePx(320, 400)
    expect(result).not.toBeNull()
    expect(result!.width / result!.height).toBeCloseTo(REACT_FLOW_MINIMAP_DEFAULT_WIDTH / REACT_FLOW_MINIMAP_DEFAULT_HEIGHT, 5)
  })

  it('petit canvas : bornes 3/8 et minimum 1×1', () => {
    const w = 16
    const h = 16
    const maxW = Math.floor(w * MINIMAP_MAX_EDITOR_FRACTION)
    const maxH = Math.floor(h * MINIMAP_MAX_EDITOR_FRACTION)
    const result = computeGraphMinimapSizePx(w, h)
    expect(result).not.toBeNull()
    expect(result!.width).toBeGreaterThanOrEqual(1)
    expect(result!.height).toBeGreaterThanOrEqual(1)
    expect(result!.width).toBeLessThanOrEqual(maxW)
    expect(result!.height).toBeLessThanOrEqual(maxH)
  })
})
