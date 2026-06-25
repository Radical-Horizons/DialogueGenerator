import { describe, expect, it } from 'vitest'
import { normalizeForSearch, rankFuzzyOptions } from './fuzzyMatch'

describe('fuzzyMatch', () => {
  it('normalise accents', () => {
    expect(normalizeForSearch('Rhétorique')).toBe('rhetorique')
  })

  it('classe par proximité sur id et label', () => {
    const options = [
      { id: 'Rhétorique', label: 'Rhétorique' },
      { id: 'Architecture', label: 'Architecture' },
      { id: 'ArmesdePoing', label: 'Armes de Poing' },
    ]
    const ranked = rankFuzzyOptions(options, 'rhet')
    expect(ranked[0]?.id).toBe('Rhétorique')
  })

  it('trouve une compétence via le libellé avec espaces', () => {
    const options = [{ id: 'ArmesdePoing', label: 'Armes de Poing' }]
    const ranked = rankFuzzyOptions(options, 'armes poing')
    expect(ranked[0]?.id).toBe('ArmesdePoing')
  })
})
