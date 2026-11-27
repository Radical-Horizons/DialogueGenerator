/**
 * Paliers de zoom du graphe à cartes de texte (Story 20.2, A10) : bornes contiguës,
 * écrire ≥ 75 %, lire ≥ 40 % et < 75 %, situer < 40 %.
 */
export type ZoomTier = 'write' | 'read' | 'situate'

export const ZOOM_TIER_WRITE_MIN = 0.75
export const ZOOM_TIER_READ_MIN = 0.4

export function zoomTierForZoom(zoom: number): ZoomTier {
  if (zoom >= ZOOM_TIER_WRITE_MIN) return 'write'
  return zoom >= ZOOM_TIER_READ_MIN ? 'read' : 'situate'
}
