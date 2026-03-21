import { describe, it, expect } from 'vitest'
import { collectOutgoingDescendantIds } from '../collectOutgoingDescendantIds'

describe('collectOutgoingDescendantIds', () => {
  it('returns targets in BFS order and excludes the root', () => {
    const edges = [
      { source: 'a', target: 'b' },
      { source: 'a', target: 'c' },
      { source: 'b', target: 'd' },
    ]
    expect(collectOutgoingDescendantIds('a', edges)).toEqual(['b', 'c', 'd'])
  })

  it('ignores cycles', () => {
    const edges = [
      { source: 'a', target: 'b' },
      { source: 'b', target: 'a' },
    ]
    expect(collectOutgoingDescendantIds('a', edges)).toEqual(['b'])
  })

  it('returns an empty array when there are no outgoing edges', () => {
    expect(collectOutgoingDescendantIds('x', [{ source: 'y', target: 'z' }])).toEqual([])
  })
})
