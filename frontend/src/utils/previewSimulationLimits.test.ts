import { describe, expect, it } from 'vitest'

import { collectPreviewSimulationLimits } from './previewSimulationLimits'

function communityAggregatePreviewState() {
  return {
    reputation_values: {
      'fr94::HEROINE_A::community::garde::Admiration::community_calculated': 35,
    },
  }
}

describe('previewSimulationLimits', () => {
  it('signale les limites d’agrégat communautaire quand les témoins/poids PNJ manquent', () => {
    expect(
      collectPreviewSimulationLimits(communityAggregatePreviewState()),
    ).toEqual([
      'Agrégat communautaire simulé localement : témoins, propagation et poids PNJ restent responsabilité runtime.',
    ])
  })
})
