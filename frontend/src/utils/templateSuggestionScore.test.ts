import { describe, it, expect } from 'vitest'
import {
  REASON_GDD,
  REASON_KW,
  REASON_PERSO,
  REASON_RENCONTRE,
  REASON_CONTEXT,
  extractRencontreInitiale,
  gddScore,
  hasFirstMeetingFlag,
  hasRencontreInitialeText,
  isFirstMeeting,
  keywordScore,
  normalizeTokens,
  rankScored,
  rencontreInitialeBySelectedCharacters,
  scoreCandidate,
  type SuggestionCandidateFeatures,
  type SuggestionQuery,
} from './templateSuggestionScore'

function features(overrides: Partial<SuggestionCandidateFeatures> = {}): SuggestionCandidateFeatures {
  return {
    name: 'Confrontation',
    description: 'Conflit tendu',
    category: 'Confrontation',
    sceneTypeHint: 'confrontation',
    sceneType: 'Generic',
    instructions: 'Brief tension',
    characters: ['char-alpha'],
    locations: ['loc-alpha'],
    useCount: 0,
    ...overrides,
  }
}

describe('templateSuggestionScore', () => {
  it('golden: brief confrontation bat cutscene (kw seul)', () => {
    const query: SuggestionQuery = {
      instructions: 'confrontation au port',
      sceneType: '',
      characters: [],
      locations: [],
      hasRencontreInitiale: false,
    }
    const confrontation = scoreCandidate(features(), query)
    const cutscene = scoreCandidate(
      features({
        name: 'Cut-scene',
        category: 'Cut-scene',
        sceneTypeHint: 'cutscene',
        instructions: 'Cinématique',
        characters: [],
        locations: [],
      }),
      query,
    )
    expect(confrontation.score).toBeGreaterThan(cutscene.score)
    expect(confrontation.score).toBe(13)
    expect(confrontation.reasons).toContain(REASON_KW)
    expect(cutscene.score).toBe(0)
  })

  it('boost GDD si perso/lieu du POST = snapshot', () => {
    const query: SuggestionQuery = {
      instructions: '',
      sceneType: '',
      characters: ['char-alpha'],
      locations: ['loc-alpha'],
      hasRencontreInitiale: false,
    }
    const matched = scoreCandidate(
      features({ sceneTypeHint: '', name: 'Autre', category: 'Autre' }),
      query,
    )
    const other = scoreCandidate(
      features({
        name: 'Autre',
        category: 'Autre',
        sceneTypeHint: '',
        characters: ['char-beta'],
        locations: ['loc-beta'],
      }),
      query,
    )
    expect(matched.score).toBeGreaterThan(other.score)
    expect(matched.reasons).toContain(REASON_GDD)
    expect(other.score).toBe(0)
  })

  it('boost rencontre initiale sur Salutation', () => {
    const query: SuggestionQuery = {
      instructions: '',
      sceneType: '',
      characters: [],
      locations: [],
      hasRencontreInitiale: true,
    }
    const greeting = scoreCandidate(
      features({
        name: 'Salutation / première rencontre',
        category: 'Salutation',
        sceneTypeHint: 'rencontre_initiale',
        characters: [],
        locations: [],
      }),
      query,
    )
    const other = scoreCandidate(
      features({
        name: 'Négociation',
        category: 'Négociation',
        sceneTypeHint: 'negociation',
      }),
      query,
    )
    expect(greeting.score).toBe(20)
    expect(greeting.reasons).toContain(REASON_RENCONTRE)
    expect(other.score).toBe(0)
    expect(hasRencontreInitialeText({ npc: '  ' })).toBe(false)
    expect(hasRencontreInitialeText({ npc: 'Bonjour.' })).toBe(true)
    expect(isFirstMeeting('rencontre_initiale', 'X', 'Y')).toBe(true)
    expect(extractRencontreInitiale({ sections: { rencontre_initiale: 'Hi' } })).toBe('Hi')
    expect(
      rencontreInitialeBySelectedCharacters(
        ['npc-alpha'],
        [
          { name: 'npc-alpha', data: { sections: { rencontre_initiale: 'Hi' } } },
          { name: 'npc-beta', data: { sections: { rencontre_initiale: 'Nope' } } },
        ],
      ),
    ).toEqual({ 'npc-alpha': 'Hi' })
  })

  it('usage perso et usage contextuel élèvent le score', () => {
    const query: SuggestionQuery = {
      instructions: 'confrontation',
      sceneType: '',
      characters: [],
      locations: [],
      hasRencontreInitiale: false,
    }
    const unused = scoreCandidate(features({ characters: [], locations: [] }), query)
    const used = scoreCandidate(features({ characters: [], locations: [], useCount: 5 }), query)
    expect(used.score).toBeGreaterThan(unused.score)
    expect(used.reasons).toContain(REASON_PERSO)
    const contextual = scoreCandidate(
      features({ characters: [], locations: [], contextUseCount: 3 }),
      query,
    )
    expect(contextual.score).toBeGreaterThan(unused.score)
    expect(contextual.reasons).toContain(REASON_CONTEXT)
  })

  it('drop score 0 et plafonne à 10', () => {
    const zero = scoreCandidate(
      features({
        name: 'Z',
        category: 'Z',
        sceneTypeHint: 'cutscene',
        characters: [],
        locations: [],
      }),
      {
        instructions: '',
        sceneType: '',
        characters: [],
        locations: [],
        hasRencontreInitiale: false,
      },
    )
    expect(rankScored([{ score: zero, name: 'Z' }])).toEqual([])
    const items = Array.from({ length: 12 }, (_, index) => ({
      score: scoreCandidate(
        features({ name: `Confrontation ${index}`, characters: [], locations: [] }),
        {
          instructions: 'confrontation',
          sceneType: '',
          characters: [],
          locations: [],
          hasRencontreInitiale: false,
        },
      ),
      name: `Confrontation ${index}`,
    }))
    expect(rankScored(items)).toHaveLength(10)
  })

  it('normalise les tokens accentués', () => {
    expect(normalizeTokens('Révélation').has('revelation')).toBe(true)
    expect(keywordScore(new Set(), new Set(['a']))).toBe(0)
    expect(gddScore([], [], ['a'], ['b'])).toBe(0)
  })

  it('matche un flag rencontre_initiale sur le token perso, pas npc générique', () => {
    expect(
      hasFirstMeetingFlag(
        ['npc-alpha'],
        ['Flag_perso_npc_alpha_rencontre_initiale'],
      ),
    ).toBe(true)
    expect(
      hasFirstMeetingFlag(
        ['npc-alpha'],
        ['Flag_perso_npc_beta_rencontre_initiale'],
      ),
    ).toBe(false)
  })
})
