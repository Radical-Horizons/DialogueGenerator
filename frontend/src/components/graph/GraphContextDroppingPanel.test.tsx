/**
 * FR44 : chargement, résumé, détail, erreur API — états distincts du slop / juge LLM.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { GraphContextDroppingPanel } from './GraphContextDroppingPanel'
import { useGraphStore } from '../../store/graphStore'
import type { DetectContextDroppingResponse } from '../../types/graph'

vi.mock('../../api/graph', () => ({
  detectContextDropping: vi.fn(),
}))

vi.mock('../../store/contextStore', () => ({
  useContextStore: (selector: (s: { selections: Record<string, unknown> }) => unknown) =>
    selector({
      selections: {
        characters_full: ['Entité Synthétique Quarante'],
        characters_excerpt: [],
        locations_full: [],
        locations_excerpt: [],
        items_full: [],
        items_excerpt: [],
        species_full: [],
        species_excerpt: [],
        communities_full: [],
        communities_excerpt: [],
        dialogues_examples: [],
      },
    }),
}))

import * as graphAPI from '../../api/graph'

function makeResponse(): DetectContextDroppingResponse {
  return {
    summary: '1 cas de context dropping détectés',
    case_count: 1,
    rules_profile_effective: 'strict',
    message: null,
    cases: [
      {
        kind: 'context_dropping',
        node_id: 'N1',
        node_display_id: 'st-1',
        context_label: 'Entité Synthétique Quarante',
        message: 'Context dropping : test',
        suggestion: 'Ajoutez la référence',
        severity: 'warning',
      },
    ],
  }
}

function seedStoreOneDialogueNode() {
  useGraphStore.setState({
    nodes: [
      {
        id: 'N1',
        type: 'dialogueNode',
        position: { x: 0, y: 0 },
        data: { id: 'N1', speaker: 'PNJ', line: 'Ligne sans entité.' },
      },
    ],
    edges: [],
  })
}

describe('GraphContextDroppingPanel', () => {
  beforeEach(() => {
    vi.mocked(graphAPI.detectContextDropping).mockReset()
    useGraphStore.setState({ nodes: [], edges: [] })
  })

  it('affiche l’encadré entrant (sélections contexte) et le rapport après succès API', async () => {
    seedStoreOneDialogueNode()
    vi.mocked(graphAPI.detectContextDropping).mockImplementation(
      () =>
        new Promise((resolve) => {
          setTimeout(() => resolve(makeResponse()), 20)
        })
    )
    const user = userEvent.setup()
    render(<GraphContextDroppingPanel onClose={() => undefined} />)
    expect(screen.getByTestId('graph-context-dropping-input')).toHaveTextContent('Entrant analysé')
    expect(screen.getByTestId('graph-context-dropping-input')).toHaveTextContent('Personnages')
    await user.click(screen.getByTestId('graph-context-dropping-detect'))
    expect(screen.getByRole('button', { name: /Analyse/i })).toBeDisabled()
    expect(await screen.findByTestId('graph-context-dropping-summary')).toBeInTheDocument()
    expect(screen.getByTestId('graph-context-dropping-cases')).toBeInTheDocument()
  })

  it('affiche erreur API', async () => {
    seedStoreOneDialogueNode()
    vi.mocked(graphAPI.detectContextDropping).mockRejectedValue(new Error('API down'))
    const user = userEvent.setup()
    render(<GraphContextDroppingPanel onClose={() => undefined} />)
    await user.click(screen.getByTestId('graph-context-dropping-detect'))
    expect(await screen.findByTestId('graph-context-dropping-error')).toHaveTextContent('API down')
  })
})
