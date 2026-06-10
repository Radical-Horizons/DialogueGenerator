import { describe, it, expect } from 'vitest'
import type { Node } from 'reactflow'
import { computeDialoguePreviewCounts } from './dialoguePreviewStats'

describe('computeDialoguePreviewCounts', () => {
  const nodes: Node[] = [
    {
      id: 'n1',
      position: { x: 0, y: 0 },
      data: {
        visibilityConditions: {
          combinator: 'AND',
          items: [{ kind: 'flag_bool', flagId: 'X', equals: true }],
        },
        choices: [
          {
            choiceId: 'c1',
            visibilityConditions: {
              combinator: 'AND',
              items: [{ kind: 'flag_bool', flagId: 'Y', equals: true }],
            },
          },
        ],
      },
    },
  ]

  it('retourne zéros si preview inactif', () => {
    expect(
      computeDialoguePreviewCounts(
        nodes,
        { flags: { X: true, Y: true }, reputation: {} },
        false,
      ),
    ).toEqual({
      nodesAccessible: 0,
      nodesMasked: 0,
      choicesAccessible: 0,
      choicesMasked: 0,
    })
  })

  it('compte masqués vs accessibles avec preview actif', () => {
    const st = { flags: { X: true, Y: false }, reputation: {} }
    expect(computeDialoguePreviewCounts(nodes, st, true)).toEqual({
      nodesAccessible: 1,
      nodesMasked: 0,
      choicesAccessible: 0,
      choicesMasked: 1,
    })
  })
})
