import { describe, it, expect } from 'vitest'
import { zoomTierForZoom } from './zoomTiers'

describe('zoomTierForZoom (Story 20.2)', () => {
  it.each([
    [2, 'write'],
    [0.75, 'write'],
    [0.7499, 'read'],
    [0.4, 'read'],
    [0.3999, 'situate'],
    [0.1, 'situate'],
  ])('zoom %f → palier %s', (zoom, tier) => {
    expect(zoomTierForZoom(zoom)).toBe(tier)
  })
})
