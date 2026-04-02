import { describe, expect, it } from 'vitest'
import {
  CHOICE_LABEL_NODE_CLEARANCE_PX,
  CHOICE_LABEL_T_BIAS_MAX,
  CHOICE_LABEL_T_BIAS_MIN,
  TEST_RESULT_LABEL_STAGGER_PX,
  getChoiceEdgePathOptions,
  resolveSmoothStepLabelPosition,
} from '../utils/choiceEdgeGeometry'

describe('resolveSmoothStepLabelPosition', () => {
  it('garde le point médian du path pour les arêtes non-choice', () => {
    const r = resolveSmoothStepLabelPosition({
      edgeType: 'test_result',
      choiceIndex: 0,
      sourceX: 10,
      sourceY: 20,
      targetX: 30,
      targetY: 80,
      pathLabelX: 100,
      pathLabelY: 200,
    })
    expect(r).toEqual({ x: 100, y: 200 })
  })

  it('applique un quinconce pour les labels des résultats de test', () => {
    const success = resolveSmoothStepLabelPosition({
      edgeType: 'success',
      sourceX: 100,
      sourceY: 100,
      targetX: 300,
      targetY: 300,
      pathLabelX: 200,
      pathLabelY: 200,
    })
    const criticalSuccess = resolveSmoothStepLabelPosition({
      edgeType: 'critical-success',
      sourceX: 100,
      sourceY: 100,
      targetX: 300,
      targetY: 300,
      pathLabelX: 200,
      pathLabelY: 200,
    })

    expect(success).not.toEqual(criticalSuccess)
    expect(Math.abs(criticalSuccess.x - success.x)).toBeGreaterThan(0)
    expect(Math.abs(criticalSuccess.y - success.y)).toBeGreaterThan(0)
    expect(Math.hypot(
      criticalSuccess.x - success.x,
      criticalSuccess.y - success.y
    )).toBeGreaterThanOrEqual(TEST_RESULT_LABEL_STAGGER_PX - 0.001)
  })

  it('place le label choice sur le segment source→cible avec biais réparti', () => {
    const pathCenter = { x: 500, y: 500 }
    const r0 = resolveSmoothStepLabelPosition({
      edgeType: 'choice',
      choiceIndex: 0,
      sourceX: 80,
      sourceY: 100,
      targetX: 280,
      targetY: 300,
      pathLabelX: pathCenter.x,
      pathLabelY: pathCenter.y,
    })
    expect(r0.x).toBe(180)
    expect(r0.y).toBe(200)

    const r2 = resolveSmoothStepLabelPosition({
      edgeType: 'choice',
      choiceIndex: 2,
      sourceX: 80,
      sourceY: 100,
      targetX: 280,
      targetY: 300,
      pathLabelX: pathCenter.x,
      pathLabelY: pathCenter.y,
    })
    expect(r2.x).not.toBe(r0.x)
    // colinéaire au segment (x et y évoluent proportionnellement)
    const t2x = (r2.x - 80) / (280 - 80)
    const t2y = (r2.y - 100) / (300 - 100)
    expect(Math.abs(t2x - t2y)).toBeLessThan(0.0001)
    expect(t2x).toBeGreaterThanOrEqual(CHOICE_LABEL_T_BIAS_MIN)
    expect(t2x).toBeLessThanOrEqual(CHOICE_LABEL_T_BIAS_MAX)
    expect(r2.y).toBeGreaterThanOrEqual(100 + CHOICE_LABEL_NODE_CLEARANCE_PX)
    expect(r2.y).toBeLessThanOrEqual(300 - CHOICE_LABEL_NODE_CLEARANCE_PX)

    expect(r0).not.toEqual({ x: pathCenter.x, y: pathCenter.y })
  })
})

describe('getChoiceEdgePathOptions', () => {
  it('retourne undefined si pas d’index valide', () => {
    expect(getChoiceEdgePathOptions(undefined)).toBeUndefined()
    expect(getChoiceEdgePathOptions(-1)).toBeUndefined()
  })

  it('varie stepPosition et offset par index', () => {
    const a = getChoiceEdgePathOptions(0)
    const b = getChoiceEdgePathOptions(3)
    expect(a).toBeDefined()
    expect(b).toBeDefined()
    expect(a!.stepPosition).toBeLessThan(b!.stepPosition)
    expect(a!.offset).not.toBe(b!.offset)
  })
})
