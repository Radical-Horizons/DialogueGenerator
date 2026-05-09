import { describe, expect, it } from 'vitest'

import {
  evaluateSkillCheck,
  formatSkillCheckSummary,
  getChoiceSkillCheckPreview,
} from './skillChecks'

describe('skillChecks', () => {
  const skillCheck = {
    attributeId: 'sociabilite',
    attributeLabel: 'Sociabilité',
    skillId: 'tromperie',
    skillLabel: 'Tromperie',
    dc: 7,
    branches: {
      succès_critique: 'CRIT_SUCCESS',
      succès: 'SUCCESS',
      échec: 'FAILURE',
      échec_critique: 'CRIT_FAILURE',
    },
  } as const

  it('formate un test tentable avec score et DD lisibles', () => {
    const result = evaluateSkillCheck(skillCheck, {
      attributes: { sociabilite: 4 },
      skills: { tromperie: 3 },
    })

    expect(formatSkillCheckSummary(skillCheck, result)).toBe(
      'Sociabilité + Tromperie vs DD 7 : score 7, succès',
    )
  })

  it('garde le choix visible et expose la branche correspondant à l’issue preview', () => {
    const preview = getChoiceSkillCheckPreview(
      { text: 'Mentir', skillCheck },
      { attributes: { sociabilite: 0 }, skills: { tromperie: 1 } },
    )

    expect(preview.visible).toBe(true)
    expect(preview.issue).toBe('échec_critique')
    expect(preview.targetNode).toBe('CRIT_FAILURE')
  })
})
