import { describe, expect, it } from 'vitest'
import {
  DEFAULT_CONTEXT_DROPPING_RULES,
  buildAntiDropPromptClause,
  rulesToDetectOptions,
  withAntiDropClause,
} from './contextDroppingOverlay'

describe('contextDroppingOverlay', () => {
  it('convertit une copie 4.10 en options detect', () => {
    expect(
      rulesToDetectOptions({
        ...DEFAULT_CONTEXT_DROPPING_RULES,
        rules_profile: 'light',
        mandatory_info: ['fait-a'],
      }),
    ).toEqual({
      rules_profile: 'light',
      tolerance: undefined,
      mandatory_info: ['fait-a'],
      dialogue_type_overrides: {},
    })
  })

  it('withAntiDropClause laisse le textarea inchangé si pas d’overlay', () => {
    expect(withAntiDropClause('Brief joueur', null)).toBe('Brief joueur')
    expect(withAntiDropClause('Brief joueur', undefined)).toBe('Brief joueur')
  })

  it('enrichit les instructions à l’envoi sans remplacer un brief vide par rien', () => {
    const clause = buildAntiDropPromptClause(DEFAULT_CONTEXT_DROPPING_RULES)
    expect(clause).toMatch(/EXPLICITES/)
    expect(withAntiDropClause('Brief joueur', DEFAULT_CONTEXT_DROPPING_RULES)).toBe(
      `Brief joueur\n\n${clause}`,
    )
    expect(withAntiDropClause('  ', DEFAULT_CONTEXT_DROPPING_RULES)).toBe(clause)
    expect(buildAntiDropPromptClause({ ...DEFAULT_CONTEXT_DROPPING_RULES, rules_profile: 'light' })).toMatch(
      /SUBTILES/,
    )
  })
})
