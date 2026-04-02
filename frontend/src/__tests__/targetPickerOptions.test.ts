import { describe, it, expect } from 'vitest'
import type { Node } from 'reactflow'
import { listTargetPickerOptions } from '../utils/targetPickerOptions'

describe('listTargetPickerOptions', () => {
  const nodes: Node[] = [
    { id: 'A', type: 'dialogueNode', position: { x: 0, y: 0 }, data: { line: 'Alpha' } },
    { id: 'test-node-X-choice-0', type: 'testNode', position: { x: 0, y: 0 }, data: {} },
    { id: 'END', type: 'endNode', position: { x: 0, y: 0 }, data: { id: 'END' } },
  ]

  it('exclut les TestNodes et peut exclure des ids', () => {
    const opts = listTargetPickerOptions(nodes, { excludeIds: ['A'], includeEnd: true })
    const values = opts.map((o) => o.value)
    expect(values).not.toContain('test-node-X-choice-0')
    expect(values).not.toContain('A')
    expect(values).toContain('END')
  })

  it('inclut Fin (END) en tête quand includeEnd', () => {
    const opts = listTargetPickerOptions(
      [{ id: 'B', type: 'dialogueNode', position: { x: 0, y: 0 }, data: {} }],
      { includeEnd: true }
    )
    expect(opts[0]?.value).toBe('END')
    expect(opts[0]?.label).toMatch(/Fin/)
  })
})
