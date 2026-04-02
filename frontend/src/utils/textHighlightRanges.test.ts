import { describe, expect, it } from 'vitest'
import { buildHighlightRanges } from './textHighlightRanges'

describe('buildHighlightRanges', () => {
  it('surligne les mots longs communs au contexte', () => {
    const gen = 'Le héros TokenLongAlpha parle au TokenLongBeta.'
    const ctx = 'TokenLongAlpha et TokenLongBeta sont liés.'
    const r = buildHighlightRanges(gen, ctx)
    expect(r.length).toBeGreaterThanOrEqual(1)
    const text = gen.slice(r[0].start, r[0].end).toLowerCase()
    expect(text).toContain('tokenlongalpha')
  })

  it('fusionne les plages qui se chevauchent quand elles se recoupent', () => {
    const gen = 'aaaaxxxxbbbb'
    const r = buildHighlightRanges(gen, 'aaaaxxxx xxxxbbbb')
    expect(r.length).toBe(1)
    expect(r[0].start).toBe(0)
    expect(r[0].end).toBe(gen.length)
  })

  it('retourne vide si pas de mots assez longs', () => {
    expect(buildHighlightRanges('abc def', 'a b')).toEqual([])
  })
})
