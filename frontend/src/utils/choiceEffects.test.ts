import { describe, expect, it } from 'vitest'

import type { ChoiceEffect } from '../types/choiceEffects'
import type { FlagDefinition } from '../types/flags'
import {
  applyChoiceEffectsToEvalState,
  formatChoiceEffectsSummary,
  reputationDeltaBounds,
} from './choiceEffects'

describe('choiceEffects utils', () => {
  it('formatChoiceEffectsSummary concatenates ordered effects', () => {
    const fx: ChoiceEffect[] = [
      { kind: 'set_bool', flagId: 'F', value: true },
      { kind: 'reputation_delta', axisId: 'Prestige', factionId: 'X', delta: -3 },
    ]
    expect(formatChoiceEffectsSummary(fx)).toContain('F = true')
    expect(formatChoiceEffectsSummary(fx)).toContain('Prestige')
  })

  it('applyChoiceEffectsToEvalState respects order and clamps counter', () => {
    const catalog: Record<string, FlagDefinition> = {
      CNT: {
        id: 'CNT',
        type: 'int',
        semanticType: 'compteur',
        category: 's',
        label: 'l',
        defaultValue: '0',
        tags: [],
        isFavorite: false,
        minValue: 0,
        maxValue: 10,
      },
    }
    const prev = { flags: { CNT: 8 }, reputation: {} }
    const fx: ChoiceEffect[] = [{ kind: 'adjust_counter', flagId: 'CNT', operator: '+=', value: 5 }]
    const next = applyChoiceEffectsToEvalState(prev, fx, catalog)
    expect(next.flags.CNT).toBe(10)
  })

  it('reputationDeltaBounds limits Prestige axis', () => {
    const b = reputationDeltaBounds('Prestige')
    expect(b.max).toBe(15)
    expect(b.min).toBe(-15)
  })
})
