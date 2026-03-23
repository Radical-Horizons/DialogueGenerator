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

/**
 * Pas entre colonnes pour des enfants de type dialogue (largeur carte + marge).
 */
export const GRAPH_SIBLING_COLUMN_STEP = GRAPH_DIALOGUE_NODE_WIDTH + GRAPH_SIBLING_GAP_X

/** Décalage vertical standard parent → enfant (dialogue ou barre de test). */
export const GRAPH_OFFSET_PARENT_TO_CHILD_Y = 280
/** Marge verticale minimale sous la boîte parent pour éviter les recouvrements. */
export const GRAPH_PARENT_TO_CHILD_CLEARANCE_Y = 120

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
