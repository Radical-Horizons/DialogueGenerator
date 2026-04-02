import { describe, expect, it } from 'vitest'
import {
  childNodeTopLeftX,
  GRAPH_DIALOGUE_NODE_WIDTH,
  GRAPH_SIBLING_COLUMN_STEP,
  GRAPH_TEST_NODE_WIDTH,
  siblingBranchOffset,
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

  it('applique un éventail léger pour 3 frères en TB', () => {
    const first = siblingBranchOffset({
      siblingIndex: 0,
      siblingCount: 3,
      spacingMode: 'normal',
      direction: 'TB',
    })
    const middle = siblingBranchOffset({
      siblingIndex: 1,
      siblingCount: 3,
      spacingMode: 'normal',
      direction: 'TB',
    })
    const last = siblingBranchOffset({
      siblingIndex: 2,
      siblingCount: 3,
      spacingMode: 'normal',
      direction: 'TB',
    })

    expect(first.dy).toBeLessThan(0)
    expect(middle).toEqual({ dx: 0, dy: 0 })
    expect(last.dy).toBeGreaterThan(0)
    expect(first.dx).toBe(-last.dx)
    expect(first.dy).toBe(-44)
    expect(last.dy).toBe(44)
    expect(first.dx).toBe(-18)
    expect(last.dx).toBe(18)
  })

  it('répartit 5 frères sur deux sous-rangs en TB', () => {
    const offsets = Array.from({ length: 5 }, (_, siblingIndex) =>
      siblingBranchOffset({
        siblingIndex,
        siblingCount: 5,
        spacingMode: 'normal',
        direction: 'TB',
      })
    )

    expect(new Set(offsets.map((offset) => offset.dy)).size).toBe(2)
    expect(Math.min(...offsets.map((offset) => offset.dy))).toBeLessThan(0)
    expect(Math.max(...offsets.map((offset) => offset.dy))).toBeGreaterThan(0)
    expect(new Set(offsets.map((offset) => offset.dx)).size).toBeGreaterThan(1)
    expect(Math.max(...offsets.map((offset) => Math.abs(offset.dy)))).toBeGreaterThan(44)
  })

  it('renforce aussi le quinconce à partir de 4 frères en TB', () => {
    const offsets = Array.from({ length: 4 }, (_, siblingIndex) =>
      siblingBranchOffset({
        siblingIndex,
        siblingCount: 4,
        spacingMode: 'normal',
        direction: 'TB',
      })
    )

    expect(new Set(offsets.map((offset) => offset.dy)).size).toBe(2)
    expect(Math.max(...offsets.map((offset) => Math.abs(offset.dy)))).toBeGreaterThan(44)
  })

  it('transpose le quinconce sur l’axe horizontal en LR', () => {
    const offsets = Array.from({ length: 6 }, (_, siblingIndex) =>
      siblingBranchOffset({
        siblingIndex,
        siblingCount: 6,
        spacingMode: 'normal',
        direction: 'LR',
      })
    )

    expect(new Set(offsets.map((offset) => offset.dx)).size).toBe(2)
    expect(new Set(offsets.map((offset) => offset.dy)).size).toBeGreaterThan(1)
  })
})
