/**
 * Story 17.2 FR119 — pas de régression pan/zoom tactile (valeurs explicites React Flow 11).
 */
import { describe, it, expect } from 'vitest'
import { GRAPH_VIEWPORT_INTERACTION_OPTIONS } from './graphViewportInteraction'

describe('GRAPH_VIEWPORT_INTERACTION_OPTIONS', () => {
  it('garde panOnDrag, zoom molette et pinch actifs', () => {
    expect(GRAPH_VIEWPORT_INTERACTION_OPTIONS.panOnDrag).toBe(true)
    expect(GRAPH_VIEWPORT_INTERACTION_OPTIONS.zoomOnScroll).toBe(true)
    expect(GRAPH_VIEWPORT_INTERACTION_OPTIONS.zoomOnPinch).toBe(true)
    expect(GRAPH_VIEWPORT_INTERACTION_OPTIONS.panActivationKeyCode).toBe('Space')
  })
})
