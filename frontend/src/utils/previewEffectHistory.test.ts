import { describe, it, expect } from 'vitest'
import { linesForAppliedChoiceEffects } from './previewEffectHistory'

describe('linesForAppliedChoiceEffects', () => {
  it('émet une ligne par effet avec transitions', () => {
    const prev = { flags: { C: 1 }, reputation: {} }
    const lines = linesForAppliedChoiceEffects(
      prev,
      [
        { kind: 'adjust_counter', flagId: 'C', operator: '+=', value: 2 },
        { kind: 'set_bool', flagId: 'B', value: true },
      ],
      undefined,
    )
    expect(lines.length).toBe(2)
    expect(lines[0]).toContain('C')
    expect(lines[1]).toContain('B')
  })
})
