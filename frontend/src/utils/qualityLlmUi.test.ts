import { describe, it, expect } from 'vitest'
import {
  QUALITY_HIGH_THRESHOLD,
  QUALITY_LOW_THRESHOLD,
  mergeHighScoreStrengths,
  mergeLowScoreSuggestions,
  qualityBandForOverallScore,
} from './qualityLlmUi'

describe('qualityLlmUi', () => {
  it('seuils AC #3 / #4 documentés', () => {
    expect(QUALITY_LOW_THRESHOLD).toBe(5)
    expect(QUALITY_HIGH_THRESHOLD).toBe(8)
  })

  it('score 4 → bande low', () => {
    expect(qualityBandForOverallScore(4)).toBe('low')
  })

  it('score 9 → bande high', () => {
    expect(qualityBandForOverallScore(9)).toBe('high')
  })

  it('score 6 → bande mid', () => {
    expect(qualityBandForOverallScore(6)).toBe('mid')
  })

  it('mergeLowScoreSuggestions dérive depuis les commentaires si API vide', () => {
    const out = mergeLowScoreSuggestions([], [
      { label: 'Style', score: 3, comment: '  Trop plat.  ' },
    ])
    expect(out).toEqual(['Style: Trop plat.'])
  })

  it('mergeLowScoreSuggestions garde les suggestions API si présentes', () => {
    expect(mergeLowScoreSuggestions(['  A  ', ''], [{ label: 'X', score: 1, comment: 'y' }])).toEqual([
      'A',
    ])
  })

  it('mergeHighScoreStrengths dérive depuis critères si strengths API vides', () => {
    const out = mergeHighScoreStrengths(
      [],
      [
        { label: 'A', score: 6, comment: 'moyen' },
        { label: 'B', score: 9, comment: 'fort' },
      ],
    )
    expect(out[0]).toContain('B')
    expect(out[0]).toContain('fort')
  })
})
