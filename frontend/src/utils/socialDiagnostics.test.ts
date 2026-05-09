import { describe, expect, it } from 'vitest'

import {
  diagnoseReputationAxisConfusion,
  validateFactionTitleCondition,
} from './socialDiagnostics'

describe('socialDiagnostics', () => {
  it('accepte un titre de faction via flag one-way', () => {
    expect(validateFactionTitleCondition({ flagId: 'Flag_faction_titre_garde' })).toEqual({
      valid: true,
      source: 'one_way_flag',
    })
  })

  it('accepte un titre de faction via catalogue titres', () => {
    expect(
      validateFactionTitleCondition(
        { titleId: 'garde_capitaine' },
        new Set(['garde_capitaine']),
      ),
    ).toEqual({
      valid: true,
      source: 'title_catalog',
    })
  })

  it.each(['Influence', 'Respect'])(
    'diagnostique %s comme Influence & Respect, pas Réputation',
    (axisId) => {
      expect(diagnoseReputationAxisConfusion(axisId)).toEqual({
        code: 'social_system_confusion',
        message: `${axisId} appartient au système Influence & Respect (PJ possédés), pas à la Réputation.`,
      })
    },
  )
})
