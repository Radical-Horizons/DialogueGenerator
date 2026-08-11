/**
 * Tests utilitaires client collections (Story 8.5 / FR84).
 */
import { describe, it, expect } from 'vitest'
import {
  buildDocumentCollectionMap,
  type DialogueCollection,
} from './collections'

const C1: DialogueCollection = {
  id: 'c1',
  name: 'A',
  description: null,
  icon: null,
  owner_id: 'u1',
  created_at: 't',
  updated_at: 't',
  dialogue_ids: ['doc-a', 'doc-b'],
}

const C2: DialogueCollection = {
  ...C1,
  id: 'c2',
  name: 'B',
  dialogue_ids: ['doc-a'],
}

describe('buildDocumentCollectionMap', () => {
  it('mappe un document vers plusieurs collections', () => {
    const map = buildDocumentCollectionMap([C1, C2])
    expect(map.get('doc-a')?.map((c) => c.id)).toEqual(['c1', 'c2'])
    expect(map.get('doc-b')?.map((c) => c.id)).toEqual(['c1'])
  })
})
