import { describe, expect, it } from 'vitest'

import {
  calculateRepPalier,
  evaluateReputationCondition,
  legacyReputationStateKey,
  reputationStateKey,
} from './reputationFr94'

describe('reputationFr94', () => {
  it('évalue une condition avec héroïne, cible, axe et mode de lecture explicites', () => {
    const condition = {
      heroineId: 'HEROINE_A',
      target: { kind: 'npc', id: 'PNJ_A' },
      axis: 'Admiration',
      readMode: 'final_npc',
      operator: '>=',
      threshold: 30,
    } as const

    const result = evaluateReputationCondition(condition, {
      values: { [reputationStateKey(condition)]: 35 },
    })

    expect(result.satisfied).toBe(true)
    expect(result.currentValue).toBe(35)
    expect(result.currentPalier).toBe('Faveur')
    expect(reputationStateKey(condition)).not.toBe(legacyReputationStateKey('Admiration', 'PNJ_A'))
  })

  it('calcule les paliers depuis la valeur numérique', () => {
    expect(calculateRepPalier(-80)).toBe('Hostilité')
    expect(calculateRepPalier(-45)).toBe('Rejet')
    expect(calculateRepPalier(-20)).toBe('Méfiance')
    expect(calculateRepPalier(-5)).toBe('Distance')
    expect(calculateRepPalier(0)).toBe('Neutre')
    expect(calculateRepPalier(15)).toBe('Sympathie')
    expect(calculateRepPalier(35)).toBe('Faveur')
    expect(calculateRepPalier(65)).toBe('Dévotion')
    expect(calculateRepPalier(95)).toBe('Icône')
  })
})
