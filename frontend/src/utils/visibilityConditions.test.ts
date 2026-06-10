import { describe, expect, it } from 'vitest'
import {
  evaluateVisibilityConditions,
  formatConditionSummary,
  formatReputationRequirement,
} from './visibilityConditions'
import type { VisibilityConditionsBlock } from '../types/visibilityConditions'

describe('visibilityConditions utils', () => {
  it('formats reputation line (AC5)', () => {
    const line = formatReputationRequirement('Prestige', 'Guild', '>=', 30, 12)
    expect(line).toContain('Prestige')
    expect(line).toContain('Guild')
    expect(line).toContain('30')
    expect(line).toContain('12')
  })

  it('evaluates AND block', () => {
    const block: VisibilityConditionsBlock = {
      combinator: 'AND',
      items: [
        { kind: 'flag_bool', flagId: 'A', equals: true },
        { kind: 'flag_counter', flagId: 'B', operator: '>=', value: 3 },
      ],
    }
    const st = {
      flags: { A: true, B: 5 },
      reputation: {},
    }
    expect(evaluateVisibilityConditions(block, st).satisfied).toBe(true)
    expect(
      evaluateVisibilityConditions(block, { flags: { A: false, B: 5 }, reputation: {} }).satisfied,
    ).toBe(false)
  })

  it('formatConditionSummary renders atom text', () => {
    const block: VisibilityConditionsBlock = {
      combinator: 'AND',
      items: [{ kind: 'flag_bool', flagId: 'X', equals: true }],
    }
    expect(formatConditionSummary(block)).toContain('X')
    expect(formatConditionSummary(block)).toContain('true')
  })
})
