/**
 * Story 9.5 — validateGraph envoie le document canonique pour les références flags.
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

describe('validateGraph — payload document FR93', () => {
  beforeEach(() => {
    useGraphStore.getState().resetGraph()
    vi.clearAllMocks()
  })

  it('inclut document dans la requête lorsque le store en a un', async () => {
    const doc = { schemaVersion: '1.2.0' as const, nodes: [] as unknown[] }
    useGraphStore.setState({
      nodes: [minimalNode],
      edges: [],
      document: doc as Record<string, unknown>,
    })
    vi.mocked(graphAPI.validateGraph).mockResolvedValue({
      valid: true,
      errors: [],
      warnings: [],
    })
    await useGraphStore.getState().validateGraph()
    expect(graphAPI.validateGraph).toHaveBeenCalledWith(
      expect.objectContaining({
        document: doc,
      })
    )
  })
})
