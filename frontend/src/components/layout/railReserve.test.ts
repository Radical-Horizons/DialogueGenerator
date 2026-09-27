import { describe, it, expect } from 'vitest'
import {
  RAIL_GUTTER_PX,
  WRITING_MODE_RAIL_WIDTH_PX,
  centerColumnRailPadding,
} from './railReserve'

const base = { collapsed: true, writingMode: false, comparisonActive: false, narrowOrGraph: false }

describe('centerColumnRailPadding', () => {
  it('ne réserve rien quand le panneau est ouvert', () => {
    expect(centerColumnRailPadding('left', { ...base, collapsed: false, comparisonActive: true })).toBeUndefined()
  })

  it('réserve la largeur du rail riche pendant une comparaison (régression : rail posé sur les options)', () => {
    expect(centerColumnRailPadding('left', { ...base, comparisonActive: true })).toBe(WRITING_MODE_RAIL_WIDTH_PX)
  })

  it('réserve la largeur du rail riche des deux côtés en mode écriture', () => {
    expect(centerColumnRailPadding('left', { ...base, writingMode: true })).toBe(WRITING_MODE_RAIL_WIDTH_PX)
    expect(centerColumnRailPadding('right', { ...base, writingMode: true })).toBe(WRITING_MODE_RAIL_WIDTH_PX)
  })

  it('à droite, la comparaison garde la pilule mais lui réserve sa place (régression : pilule sur la 4e colonne à 1024 px)', () => {
    expect(centerColumnRailPadding('right', { ...base, comparisonActive: true })).toBe(RAIL_GUTTER_PX)
    expect(centerColumnRailPadding('right', { ...base, comparisonActive: true, narrowOrGraph: true })).toBe(
      RAIL_GUTTER_PX
    )
  })

  it('la pilule seule ne demande une réserve qu’en étroit ou sur le graphe', () => {
    expect(centerColumnRailPadding('left', base)).toBeUndefined()
    expect(centerColumnRailPadding('left', { ...base, narrowOrGraph: true })).toBe(RAIL_GUTTER_PX)
  })

  it('le rail riche prime sur la pilule même en étroit', () => {
    expect(centerColumnRailPadding('left', { ...base, comparisonActive: true, narrowOrGraph: true })).toBe(
      WRITING_MODE_RAIL_WIDTH_PX
    )
  })
})
