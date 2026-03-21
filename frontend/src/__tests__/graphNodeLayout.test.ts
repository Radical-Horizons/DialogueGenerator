import { describe, expect, it } from 'vitest'
import {
  childNodeTopLeftX,
  GRAPH_DIALOGUE_NODE_WIDTH,
  GRAPH_SIBLING_COLUMN_STEP,
  GRAPH_TEST_NODE_WIDTH,
} from '../utils/graphNodeLayout'

describe('graphNodeLayout', () => {
  it('centre un enfant unique sous le parent (même largeur)', () => {
    const x = childNodeTopLeftX({
      parentX: 100,
      parentWidth: GRAPH_DIALOGUE_NODE_WIDTH,
      childWidth: GRAPH_DIALOGUE_NODE_WIDTH,
      siblingIndex: 0,
      siblingCount: 1,
    })
    expect(x).toBe(100)
  })

  it('répartit deux frères avec un pas >= largeur dialogue + marge', () => {
    const x0 = childNodeTopLeftX({
      parentX: 0,
      parentWidth: GRAPH_DIALOGUE_NODE_WIDTH,
      childWidth: GRAPH_DIALOGUE_NODE_WIDTH,
      siblingIndex: 0,
      siblingCount: 2,
    })
    const x1 = childNodeTopLeftX({
      parentX: 0,
      parentWidth: GRAPH_DIALOGUE_NODE_WIDTH,
      childWidth: GRAPH_DIALOGUE_NODE_WIDTH,
      siblingIndex: 1,
      siblingCount: 2,
    })
    expect(x1 - x0).toBe(GRAPH_SIBLING_COLUMN_STEP)
  })

  it('centre un TestNode (200px) sous un dialogue (280px)', () => {
    const x = childNodeTopLeftX({
      parentX: 0,
      parentWidth: GRAPH_DIALOGUE_NODE_WIDTH,
      childWidth: GRAPH_TEST_NODE_WIDTH,
      siblingIndex: 0,
      siblingCount: 1,
    })
    const parentCenter = GRAPH_DIALOGUE_NODE_WIDTH / 2
    expect(x + GRAPH_TEST_NODE_WIDTH / 2).toBeCloseTo(parentCenter, 5)
  })
})
