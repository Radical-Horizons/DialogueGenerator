/**
 * Choix du coude d'un fil smoothstep (poignée basse → poignée haute) pour qu'il ne passe
 * pas sous un autre nœud.
 *
 * React Flow trace ce fil en trois tronçons : un fil qui descend tourne à `centerY`, un fil
 * qui remonte (renvoi, boucle) longe un couloir vertical à `centerX`. Par défaut ces coudes
 * sont au milieu des deux poignées, c'est-à-dire souvent en plein sur un nœud intermédiaire.
 * On garde le tracé par défaut quand il est libre ; sinon on prend le coude libre le plus
 * proche, ou à défaut celui qui traverse le moins de nœuds.
 */

export interface RoutingBox {
  x: number
  y: number
  width: number
  height: number
}

type Segment = readonly [x1: number, y1: number, x2: number, y2: number]

/** Écart laissé entre un couloir et le bord d'un nœud. */
export const EDGE_ROUTING_CLEARANCE_PX = 24
/** Tolérance : un fil qui frôle le bord d'un nœud ne compte pas comme une traversée. */
const EDGE_ROUTING_TOUCH_TOLERANCE_PX = 2

export interface SmoothStepRouteParams {
  sourceX: number
  sourceY: number
  targetX: number
  targetY: number
  /** Longueur du premier et du dernier tronçon (option `offset` de React Flow). */
  offset: number
  obstacles: readonly RoutingBox[]
}

export type SmoothStepCenter = { centerX?: number; centerY?: number }

function segmentCrossesBox(segment: Segment, box: RoutingBox): boolean {
  const [x1, y1, x2, y2] = segment
  const pad = EDGE_ROUTING_TOUCH_TOLERANCE_PX
  return (
    Math.max(x1, x2) > box.x + pad &&
    Math.min(x1, x2) < box.x + box.width - pad &&
    Math.max(y1, y2) > box.y + pad &&
    Math.min(y1, y2) < box.y + box.height - pad
  )
}

function countCrossedBoxes(segments: readonly Segment[], obstacles: readonly RoutingBox[]): number {
  let crossed = 0
  for (const box of obstacles) {
    if (segments.some((segment) => segmentCrossesBox(segment, box))) crossed++
  }
  return crossed
}

/** Tronçons du tracé React Flow (`getPoints`, cas Bottom → Top) pour un coude donné. */
export function smoothStepSegments(
  params: Omit<SmoothStepRouteParams, 'obstacles'>,
  center: SmoothStepCenter
): Segment[] {
  const { sourceX, sourceY, targetX, targetY, offset } = params
  const sourceGapY = sourceY + offset
  const targetGapY = targetY - offset
  if (sourceGapY < targetGapY) {
    const centerY = center.centerY ?? (sourceY + targetY) / 2
    return [
      [sourceX, sourceY, sourceX, centerY],
      [sourceX, centerY, targetX, centerY],
      [targetX, centerY, targetX, targetY],
    ]
  }
  const centerX = center.centerX ?? (sourceX + targetX) / 2
  return [
    [sourceX, sourceY, sourceX, sourceGapY],
    [sourceX, sourceGapY, centerX, sourceGapY],
    [centerX, sourceGapY, centerX, targetGapY],
    [centerX, targetGapY, targetX, targetGapY],
    [targetX, targetGapY, targetX, targetY],
  ]
}

function pickBest(
  params: SmoothStepRouteParams,
  candidates: number[],
  toCenter: (value: number) => SmoothStepCenter,
  preferred: number
): SmoothStepCenter {
  const sorted = [...new Set(candidates.map((value) => Math.round(value)))].sort(
    (left, right) => Math.abs(left - preferred) - Math.abs(right - preferred)
  )
  let best: { center: SmoothStepCenter; crossed: number } | null = null
  for (const value of sorted) {
    const center = toCenter(value)
    const crossed = countCrossedBoxes(smoothStepSegments(params, center), params.obstacles)
    if (crossed === 0) return center
    if (best == null || crossed < best.crossed) best = { center, crossed }
  }
  return best?.center ?? {}
}

/**
 * Coude à passer à `getSmoothStepPath` ; `{}` quand le tracé par défaut est déjà libre.
 */
export function routeSmoothStepEdge(params: SmoothStepRouteParams): SmoothStepCenter {
  const { sourceX, sourceY, targetX, targetY, offset, obstacles } = params
  if (obstacles.length === 0) return {}
  const defaultCrossed = countCrossedBoxes(smoothStepSegments(params, {}), obstacles)
  if (defaultCrossed === 0) return {}

  const clearance = EDGE_ROUTING_CLEARANCE_PX
  const sourceGapY = sourceY + offset
  const targetGapY = targetY - offset

  if (sourceGapY < targetGapY) {
    // Fil descendant : le coude horizontal se loge dans une bande libre entre deux rangées.
    const low = sourceGapY
    const high = targetGapY
    const candidates = [(sourceY + targetY) / 2, low, high]
    for (const box of obstacles) {
      candidates.push(box.y - clearance, box.y + box.height + clearance)
    }
    const inRange = candidates.filter((value) => value >= low && value <= high)
    const preferred = (sourceY + targetY) / 2
    const centerFor = (value: number): SmoothStepCenter => ({ centerY: value })
    const best = pickBest(params, inRange, centerFor, preferred)
    const bestCrossed = countCrossedBoxes(smoothStepSegments(params, best), obstacles)
    return bestCrossed < defaultCrossed ? best : {}
  }

  // Fil remontant : le couloir vertical passe entre deux colonnes de nœuds.
  const top = Math.min(sourceGapY, targetGapY)
  const bottom = Math.max(sourceGapY, targetGapY)
  const preferred = (sourceX + targetX) / 2
  const candidates = [preferred]
  for (const box of obstacles) {
    if (box.y + box.height < top || box.y > bottom) continue
    candidates.push(box.x - clearance, box.x + box.width + clearance)
  }
  const best = pickBest(params, candidates, (value) => ({ centerX: value }), preferred)
  const bestCrossed = countCrossedBoxes(smoothStepSegments(params, best), obstacles)
  return bestCrossed < defaultCrossed ? best : {}
}
