/**
 * Taille du MiniMap React Flow : bornes par rapport au canvas (pas le viewport fenêtre).
 * @see @reactflow/minimap — défaut interne 200×150, le viewBox dépend de width/height numériques.
 */

export const REACT_FLOW_MINIMAP_DEFAULT_WIDTH = 200
export const REACT_FLOW_MINIMAP_DEFAULT_HEIGHT = 150

/** Largeur et hauteur max du MiniMap = cette fraction du clientWidth / clientHeight du conteneur canvas. */
export const MINIMAP_MAX_EDITOR_FRACTION = 3 / 8

/**
 * Calcule width/height du MiniMap pour ne pas dépasser {@link MINIMAP_MAX_EDITOR_FRACTION} du canvas,
 * en conservant le ratio 200:150 (un seul facteur d’échelle).
 *
 * @returns `null` si le canvas n’est pas encore dimensionné (évite d’imposer 200×150 sur mesure 0×0).
 */
export function computeGraphMinimapSizePx(
  editorW: number,
  editorH: number
): { width: number; height: number } | null {
  if (editorW <= 0 || editorH <= 0) {
    return null
  }
  const maxW = Math.floor(editorW * MINIMAP_MAX_EDITOR_FRACTION)
  const maxH = Math.floor(editorH * MINIMAP_MAX_EDITOR_FRACTION)
  const scale = Math.min(
    maxW / REACT_FLOW_MINIMAP_DEFAULT_WIDTH,
    maxH / REACT_FLOW_MINIMAP_DEFAULT_HEIGHT,
    1
  )
  const width = Math.max(1, Math.floor(REACT_FLOW_MINIMAP_DEFAULT_WIDTH * scale))
  const height = Math.max(1, Math.floor(REACT_FLOW_MINIMAP_DEFAULT_HEIGHT * scale))
  return { width, height }
}
