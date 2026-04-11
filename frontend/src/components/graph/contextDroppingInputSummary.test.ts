import { describe, it, expect } from 'vitest'
import { buildContextDroppingInputLines } from './contextDroppingInputSummary'

describe('buildContextDroppingInputLines', () => {
  it('liste les catégories non vides avec leurs effectifs', () => {
    const lines = buildContextDroppingInputLines({
      characters_full: ['A', 'B'],
      locations_full: ['Lieu X'],
      items_full: [],
    })
    expect(lines.some((l) => l.includes('Personnages') && l.includes('2'))).toBe(true)
    expect(lines.some((l) => l.includes('Lieux') && l.includes('1 entrée'))).toBe(true)
  })

  it('signale l’absence de sélections listées', () => {
    const lines = buildContextDroppingInputLines({
      characters_full: [],
      locations_full: [],
    })
    expect(lines).toHaveLength(1)
    expect(lines[0]).toMatch(/Aucune entrée listée/i)
  })
})
