/**
 * Géométrie des arêtes « choix » : évite les labels superposés au centre du smoothstep
 * et décale légèrement le routage par index de choix.
 */

/** Marge minimale entre label et nœud source/cible sur l'axe Y. */
export const CHOICE_LABEL_NODE_CLEARANCE_PX = 30

/** Décalage du point d'ancrage le long du segment source→cible. */
export const CHOICE_LABEL_T_BIAS_STEP = 0.06
export const CHOICE_LABEL_T_BIAS_MIN = 0.34
export const CHOICE_LABEL_T_BIAS_MAX = 0.66

/** Variation de stepPosition par index (réduit le segment horizontal commun). */
export const CHOICE_PATH_STEP_INCREMENT = 0.045

/** Plage sûre pour stepPosition (évite des tracés extrêmes). */
export const CHOICE_STEP_POSITION_MIN = 0.28
export const CHOICE_STEP_POSITION_MAX = 0.58

/** Offset de coudes : léger écart par branche. */
export const CHOICE_PATH_OFFSET_BASE = 22
export const CHOICE_PATH_OFFSET_PER_INDEX = 3
export const TEST_RESULT_LABEL_STAGGER_PX = 24

export interface ChoiceEdgeData {
  edgeType?: string
  choiceIndex?: number
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function getOrganicBand(choiceIndex: number): number {
  if (choiceIndex <= 0) return 0
  const magnitude = Math.ceil(choiceIndex / 2)
  const sign = choiceIndex % 2 === 0 ? 1 : -1
  return magnitude * sign
}

function getTestResultBand(edgeType: string | undefined): number | undefined {
  switch (edgeType) {
    case 'critical-failure':
      return -1.5
    case 'failure':
      return -0.5
    case 'success':
      return 0.5
    case 'critical-success':
      return 1.5
    default:
      return undefined
  }
}

/**
 * Position d’affichage du label : au milieu source↔cible pour les choix,
 * sinon point médian retourné par getSmoothStepPath.
 */
export function resolveSmoothStepLabelPosition(params: {
  edgeType?: string
  choiceIndex?: number
  sourceX: number
  sourceY: number
  targetX: number
  targetY: number
  pathLabelX: number
  pathLabelY: number
}): { x: number; y: number } {
  const {
    edgeType,
    choiceIndex,
    sourceX,
    sourceY,
    targetX,
    targetY,
    pathLabelX,
    pathLabelY,
  } = params
  if (edgeType !== 'choice') {
    const testBand = getTestResultBand(edgeType)
    if (testBand === undefined) {
      return { x: pathLabelX, y: pathLabelY }
    }
    const dx = targetX - sourceX
    const dy = targetY - sourceY
    const length = Math.hypot(dx, dy) || 1
    const normalX = -dy / length
    const normalY = dx / length
    const offset = testBand * TEST_RESULT_LABEL_STAGGER_PX
    return {
      x: pathLabelX + normalX * offset,
      y: pathLabelY + normalY * offset,
    }
  }

  const idx = typeof choiceIndex === 'number' && choiceIndex >= 0 ? choiceIndex : 0
  const band = getOrganicBand(idx)
  const t = clamp(
    0.5 + band * CHOICE_LABEL_T_BIAS_STEP,
    CHOICE_LABEL_T_BIAS_MIN,
    CHOICE_LABEL_T_BIAS_MAX
  )
  const x = sourceX + (targetX - sourceX) * t
  let y = sourceY + (targetY - sourceY) * t

  if (targetY >= sourceY) {
    y = clamp(
      y,
      sourceY + CHOICE_LABEL_NODE_CLEARANCE_PX,
      targetY - CHOICE_LABEL_NODE_CLEARANCE_PX
    )
  } else {
    y = clamp(
      y,
      targetY + CHOICE_LABEL_NODE_CLEARANCE_PX,
      sourceY - CHOICE_LABEL_NODE_CLEARANCE_PX
    )
  }

  return {
    x,
    y,
  }
}

/**
 * Options de path smoothstep pour disperser les coudes entre branches.
 */
export function getChoiceEdgePathOptions(
  choiceIndex: number | undefined
): { stepPosition: number; offset: number } | undefined {
  if (choiceIndex === undefined || choiceIndex < 0) {
    return undefined
  }
  const raw =
    CHOICE_STEP_POSITION_MIN + Math.abs(getOrganicBand(choiceIndex)) * CHOICE_PATH_STEP_INCREMENT
  const stepPosition = Math.min(
    CHOICE_STEP_POSITION_MAX,
    Math.max(CHOICE_STEP_POSITION_MIN, raw)
  )
  return {
    stepPosition,
    offset:
      CHOICE_PATH_OFFSET_BASE +
      Math.abs(getOrganicBand(choiceIndex)) * CHOICE_PATH_OFFSET_PER_INDEX,
  }
}
