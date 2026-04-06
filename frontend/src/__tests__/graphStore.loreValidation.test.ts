/**
 * Store graphe — validation lore explicite (FR38) : fusion avec validation structurelle.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useGraphStore } from '../store/graphStore'
import * as graphAPI from '../api/graph'

vi.mock('../api/graph')

const minimalNode = {
  id: 'A',
  type: 'dialogueNode' as const,
  position: { x: 0, y: 0 },
  data: { id: 'A', displayName: 'A', line: 'Hello' },
}

describe('graphStore — validateLoreExplicit / validateGraph + lore', () => {
  beforeEach(() => {
    localStorage.clear()
    useGraphStore.getState().resetGraph()
    vi.clearAllMocks()
  })

  it('validateLoreExplicit fusionne les erreurs lore et enregistre le résumé', async () => {
    useGraphStore.setState({
      nodes: [minimalNode],
      edges: [],
      validationErrors: [],
    })
    vi.mocked(graphAPI.validateLoreExplicit).mockResolvedValue({
      valid: false,
      errors: [
        {
          type: 'lore_contradiction_explicit',
          node_id: 'A',
          message: 'Contradiction test',
          severity: 'error',
        },
      ],
      warnings: [],
      contradiction_count: 1,
      nodes_with_contradictions_count: 1,
      potential_warnings_count: 0,
      nodes_with_potential_warnings_count: 0,
      summary: '1 contradiction explicite dans 1 nœud',
      summary_explicit_only: '1 contradiction explicite dans 1 nœud',
    })
    await useGraphStore.getState().validateLoreExplicit({})
    const s = useGraphStore.getState()
    expect(s.loreExplicitValidationSummary).toBe('1 contradiction explicite dans 1 nœud')
    expect(s.validationErrors.some((e) => e.type === 'lore_contradiction_explicit')).toBe(true)
    expect(s.loreExplicitValidationLoading).toBe(false)
  })

  it('validateGraph conserve les erreurs lore existantes', async () => {
    useGraphStore.setState({
      nodes: [minimalNode],
      edges: [],
      validationErrors: [
        {
          type: 'lore_contradiction_explicit',
          node_id: 'A',
          message: 'Lore',
          severity: 'error',
        },
      ],
    })
    vi.mocked(graphAPI.validateGraph).mockResolvedValue({
      valid: true,
      errors: [],
      warnings: [],
    })
    await useGraphStore.getState().validateGraph()
    expect(
      useGraphStore.getState().validationErrors.some((e) => e.type === 'lore_contradiction_explicit')
    ).toBe(true)
  })
})
