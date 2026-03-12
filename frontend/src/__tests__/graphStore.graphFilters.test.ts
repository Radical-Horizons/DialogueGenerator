/**
 * Story 2.9 FR30: tests store graphFilters (setFilters, resetFilters).
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { useGraphStore } from '../store/graphStore'

describe('graphStore graphFilters', () => {
  beforeEach(() => {
    useGraphStore.setState({
      nodes: [],
      edges: [],
      graphFilters: {},
    })
  })

  it('setFilters({ hiddenTypes: ["test"] }) updates graphFilters', () => {
    useGraphStore.getState().setFilters({ hiddenTypes: ['test'] })
    expect(useGraphStore.getState().graphFilters).toEqual({ hiddenTypes: ['test'] })
  })

  it('setFilters({}) makes all nodes visible (empty filters)', () => {
    useGraphStore.getState().setFilters({ hiddenTypes: ['test'] })
    useGraphStore.getState().setFilters({})
    expect(useGraphStore.getState().graphFilters).toEqual({})
  })

  it('resetFilters() sets graphFilters to {}', () => {
    useGraphStore.getState().setFilters({ hiddenTypes: ['end'], allowedSpeakers: ['A'] })
    useGraphStore.getState().resetFilters()
    expect(useGraphStore.getState().graphFilters).toEqual({})
  })

  it('setFilters with hiddenTypes + allowedSpeakers stores intersection', () => {
    useGraphStore.getState().setFilters({
      hiddenTypes: ['test'],
      allowedSpeakers: ['Akthar'],
    })
    expect(useGraphStore.getState().graphFilters).toEqual({
      hiddenTypes: ['test'],
      allowedSpeakers: ['Akthar'],
    })
  })
})
