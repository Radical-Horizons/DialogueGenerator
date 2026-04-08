/**
 * Options viewport React Flow partagées (Story 17.2 FR119).
 * Valeurs explicites pour éviter une désactivation accidentelle du pan/zoom tactile.
 */
export const GRAPH_VIEWPORT_INTERACTION_OPTIONS = {
  minZoom: 0.1,
  maxZoom: 2,
  panActivationKeyCode: 'Space' as const,
  panOnDrag: true,
  zoomOnScroll: true,
  zoomOnPinch: true,
} as const
