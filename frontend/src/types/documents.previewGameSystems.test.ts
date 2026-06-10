import { describe, expect, it } from 'vitest'

import type {
  DialoguePreviewRequest,
  DialoguePreviewResponse,
  PreviewGameSystemsState,
} from './documents'

function gameSystemsPreviewState(): PreviewGameSystemsState {
  return {
    attributes: { sociabilite: 4 },
    skills: { tromperie: 3 },
    effort_pool: 10,
    reputation_values: {
      'fr94::HEROINE_A::community::garde::Admiration::community_calculated': 35,
    },
    faction_titles: { garde: 'garde_capitaine' },
  }
}

describe('documents preview game systems contract', () => {
  it('type le payload stats FR94 et la réponse de limites de simulation', () => {
    const gameSystemsState = gameSystemsPreviewState()

    const request: DialoguePreviewRequest = {
      revision: 3,
      flag_states: {},
      reputation_states: {},
      game_systems_state: gameSystemsState,
    }
    const response: DialoguePreviewResponse = {
      revision: 3,
      nodes_total: 1,
      nodes_masked: 0,
      choices_total: 0,
      choices_masked: 0,
      masked_node_ids: [],
      masked_choice_refs: [],
      game_systems_state: gameSystemsState,
      simulation_limits: [
        'Agrégat communautaire simulé localement : témoins, propagation et poids PNJ restent responsabilité runtime.',
      ],
    }

    expect(response.game_systems_state).toEqual(request.game_systems_state)
    expect(response.simulation_limits).toHaveLength(1)
  })
})
