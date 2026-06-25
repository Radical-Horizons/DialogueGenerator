/**
 * Constantes et helpers de placement des nœuds du graphe (alignés sur les composants React Flow).
 *
 * Les largeurs doivent rester synchronisées avec `DialogueNode.tsx` et `TestNode.tsx`.
 */

/** Largeur du nœud dialogue (carte). */
export const GRAPH_DIALOGUE_NODE_WIDTH = 280

/** Largeur du nœud test (barre). */
export const GRAPH_TEST_NODE_WIDTH = 200

/**
 * Marge horizontale entre boîtes de nœuds frères pour laisser de la place aux sous-graphes.
 */
export const GRAPH_SIBLING_GAP_X = 64

/** Pas entre colonnes pour des barres de test frères (largeur barre + marge). */
export const GRAPH_TEST_NODE_COLUMN_STEP = GRAPH_TEST_NODE_WIDTH + GRAPH_SIBLING_GAP_X

/**
 * Pas entre colonnes pour des enfants de type dialogue (largeur carte + marge).
 */
export const GRAPH_SIBLING_COLUMN_STEP = GRAPH_DIALOGUE_NODE_WIDTH + GRAPH_SIBLING_GAP_X

/** Décalage vertical standard parent → enfant (dialogue ou barre de test). */
export const GRAPH_OFFSET_PARENT_TO_CHILD_Y = 140
/** Marge verticale minimale sous la boîte parent pour éviter les recouvrements. */
export const GRAPH_PARENT_TO_CHILD_CLEARANCE_Y = 60

export type GraphLayoutSpacingMode = 'compact' | 'normal' | 'large'
export type GraphLayoutDirection = 'TB' | 'LR' | 'BT' | 'RL'

/**
 * Retourne la largeur visuelle du parent selon son type React Flow.
 *
 * @param nodeType - Type du nœud parent (`dialogueNode`, `testNode`, etc.).
 * @returns Largeur en pixels.
 */
export function graphParentNodeWidth(nodeType: string | undefined): number {
  return nodeType === 'testNode' ? GRAPH_TEST_NODE_WIDTH : GRAPH_DIALOGUE_NODE_WIDTH
}

/**
 * Calcule l'abscisse (top-left) d'un nœud enfant centré sous le parent, avec frères espacés.
 *
 * @param params.parentX - Abscisse du coin supérieur gauche du parent.
 * @param params.parentWidth - Largeur du parent.
 * @param params.childWidth - Largeur de l'enfant à placer.
 * @param params.siblingIndex - Index du frère dans la rangée (0 … siblingCount - 1).
 * @param params.siblingCount - Nombre de frères sur la même rangée.
 * @param params.columnStep - Pas horizontal optionnel (défaut : GRAPH_SIBLING_COLUMN_STEP).
 * @returns Abscisse du coin supérieur gauche de l'enfant.
 */
export function childNodeTopLeftX(params: {
  parentX: number
  parentWidth: number
  childWidth: number
  siblingIndex: number
  siblingCount: number
  columnStep?: number
}): number {
  const step = params.columnStep ?? GRAPH_SIBLING_COLUMN_STEP
  const parentCenter = params.parentX + params.parentWidth / 2
  const offset =
    params.siblingCount <= 1
      ? 0
      : (params.siblingIndex - (params.siblingCount - 1) / 2) * step
  return parentCenter - params.childWidth / 2 + offset
}

/**
 * Calcule l'ordonnée (top-left) d'un enfant sous le parent en tenant compte
 * de la hauteur réelle/estimée du parent pour éviter les recouvrements verticaux.
 */
export function childNodeTopLeftY(params: {
  parentY: number
  parentHeight: number
  minimumOffset?: number
  clearanceY?: number
}): number {
  const minimumOffset = params.minimumOffset ?? GRAPH_OFFSET_PARENT_TO_CHILD_Y
  const clearanceY = params.clearanceY ?? GRAPH_PARENT_TO_CHILD_CLEARANCE_Y
  return params.parentY + Math.max(minimumOffset, params.parentHeight + clearanceY)
}

/**
 * Décale légèrement les frères pour éviter les alignements trop rigides.
 * - 3 frères : éventail léger
 * - 4+ frères : quinconce renforcé sur deux sous-rangs
 */
export function siblingBranchOffset(params: {
  siblingIndex: number
  siblingCount: number
  spacingMode: GraphLayoutSpacingMode
  direction: GraphLayoutDirection
}): { dx: number; dy: number } {
  const { siblingIndex, siblingCount, spacingMode, direction } = params
  if (siblingCount <= 2) return { dx: 0, dy: 0 }

  const mainAmpByMode: Record<GraphLayoutSpacingMode, number> = {
    compact: 28,
    normal: 44,
    large: 62,
  }
  const crossAmpByMode: Record<GraphLayoutSpacingMode, number> = {
    compact: 12,
    normal: 18,
    large: 26,
  }
  const mainAmplitude = mainAmpByMode[spacingMode]
  const crossAmplitude = crossAmpByMode[spacingMode]
  const centeredIndex = siblingIndex - (siblingCount - 1) / 2

  let mainAxisOffset = 0
  let crossAxisOffset = 0
  if (siblingCount <= 3) {
    mainAxisOffset = centeredIndex * mainAmplitude
    crossAxisOffset = centeredIndex * crossAmplitude
  } else {
    const denseMainMultiplierByMode: Record<GraphLayoutSpacingMode, number> = {
      compact: 1.5,
      normal: 1.7,
      large: 1.85,
    }
    const denseCrossMultiplierByMode: Record<GraphLayoutSpacingMode, number> = {
      compact: 1.5,
      normal: 1.8,
      large: 1.95,
    }
    const denseMainAmplitude = mainAmplitude * denseMainMultiplierByMode[spacingMode]
    const denseCrossAmplitude = crossAmplitude * denseCrossMultiplierByMode[spacingMode]
    const laneIndex = siblingIndex % 2
    const waveIndex = Math.floor(siblingIndex / 2)
    const laneCount = Math.ceil(siblingCount / 2)
    const centeredWaveIndex = waveIndex - (laneCount - 1) / 2
    mainAxisOffset = laneIndex === 0 ? -denseMainAmplitude : denseMainAmplitude
    crossAxisOffset = centeredWaveIndex * denseCrossAmplitude
  }

  if (direction === 'TB') {
    return { dx: crossAxisOffset, dy: mainAxisOffset }
  }
  if (direction === 'BT') {
    return { dx: crossAxisOffset, dy: -mainAxisOffset }
  }
  if (direction === 'LR') {
    return { dx: mainAxisOffset, dy: crossAxisOffset }
  }
  return { dx: -mainAxisOffset, dy: crossAxisOffset }
}
