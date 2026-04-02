import { describe, expect, it } from 'vitest'
import { formatContextScorePercent, LOW_CONTEXT_THRESHOLD_PERCENT } from './contextRelevanceFormat'

describe('contextRelevanceFormat', () => {
  it('formats score with percent and nbsp-like spacing', () => {
    expect(formatContextScorePercent(72.4)).toBe('72 %')
  })

  it('exposes threshold constant', () => {
    expect(LOW_CONTEXT_THRESHOLD_PERCENT).toBe(30)
  })

  it('handles NaN', () => {
    expect(formatContextScorePercent(Number.NaN)).toBe('—')
  })
})
