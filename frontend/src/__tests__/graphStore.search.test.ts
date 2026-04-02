/**
 * Tests unitaires pour searchNodes et getUniqueSpeakers (Story 2.7 - FR28).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useGraphStore } from '@/store/graphStore'
import type { Node } from 'reactflow'

vi.mock('@/api/graph', () => ({
  acceptNode: vi.fn(),
  rejectNode: vi.fn(),
  regenerateNode: vi.fn(),
  saveGraph: vi.fn(),
  saveGraphAndWrite: vi.fn(),
  generateNode: vi.fn(),
  loadGraph: vi.fn(),
  validateGraph: vi.fn(),
  calculateLayout: vi.fn(),
}))

function makeDialogueNode(
  id: string,
  line: string,
  speaker: string
): Node {
  return {
    id,
    type: 'dialogueNode',
    position: { x: 0, y: 0 },
    data: { id, line, speaker },
  }
}

describe('graphStore - searchNodes & getUniqueSpeakers (Story 2.7)', () => {
  beforeEach(() => {
    useGraphStore.getState().resetGraph()
  })

  describe('searchNodes', () => {
    it('returns empty array when no nodes', () => {
      const ids = useGraphStore.getState().searchNodes('bonjour')
      expect(ids).toEqual([])
    })

    it('filters by text (data.line) case-insensitive', () => {
      useGraphStore.getState().addNode(makeDialogueNode('n1', 'Bonjour le monde', 'Alice'))
      useGraphStore.getState().addNode(makeDialogueNode('n2', 'Au revoir', 'Bob'))
      useGraphStore.getState().addNode(makeDialogueNode('n3', 'BONJOUR encore', 'Alice'))

      expect(useGraphStore.getState().searchNodes('bonjour')).toEqual(['n1', 'n3'])
      expect(useGraphStore.getState().searchNodes('BONJOUR')).toEqual(['n1', 'n3'])
      expect(useGraphStore.getState().searchNodes('au revoir')).toEqual(['n2'])
    })

    it('trims query', () => {
      useGraphStore.getState().addNode(makeDialogueNode('n1', 'Bonjour', 'Alice'))
      expect(useGraphStore.getState().searchNodes('  bonjour  ')).toEqual(['n1'])
    })

    it('filters by speaker (data.speaker) when filters.speaker provided', () => {
      useGraphStore.getState().addNode(makeDialogueNode('n1', 'Line A', 'Akthar'))
      useGraphStore.getState().addNode(makeDialogueNode('n2', 'Line B', 'Bob'))
      useGraphStore.getState().addNode(makeDialogueNode('n3', 'Line C', 'Akthar'))

      expect(useGraphStore.getState().searchNodes('', { speaker: 'Akthar' })).toEqual(['n1', 'n3'])
      expect(useGraphStore.getState().searchNodes('', { speaker: 'Bob' })).toEqual(['n2'])
    })

    it('combines text and speaker filters', () => {
      useGraphStore.getState().addNode(makeDialogueNode('n1', 'bonjour', 'Akthar'))
      useGraphStore.getState().addNode(makeDialogueNode('n2', 'bonjour', 'Bob'))
      useGraphStore.getState().addNode(makeDialogueNode('n3', 'salut', 'Akthar'))

      const ids = useGraphStore.getState().searchNodes('bonjour', { speaker: 'Akthar' })
      expect(ids).toEqual(['n1'])
    })

    it('speaker filter is case-insensitive', () => {
      useGraphStore.getState().addNode(makeDialogueNode('n1', 'Line', 'Akthar'))
      expect(useGraphStore.getState().searchNodes('', { speaker: 'akthar' })).toEqual(['n1'])
    })

    it('ignores nodes without data.line / data.speaker (undefined treated as empty string)', () => {
      useGraphStore.getState().addNode({
        id: 'no-line',
        type: 'dialogueNode',
        position: { x: 0, y: 0 },
        data: { id: 'no-line', speaker: 'X' },
      })
      useGraphStore.getState().addNode(makeDialogueNode('with-line', 'hello', 'Y'))
      expect(useGraphStore.getState().searchNodes('hello')).toEqual(['with-line'])
      expect(useGraphStore.getState().searchNodes('', { speaker: 'X' })).toEqual(['no-line'])
    })
  })

  describe('getUniqueSpeakers', () => {
    it('returns empty array when no nodes', () => {
      expect(useGraphStore.getState().getUniqueSpeakers()).toEqual([])
    })

    it('returns unique speaker names sorted', () => {
      useGraphStore.getState().addNode(makeDialogueNode('n1', 'L1', 'Alice'))
      useGraphStore.getState().addNode(makeDialogueNode('n2', 'L2', 'Bob'))
      useGraphStore.getState().addNode(makeDialogueNode('n3', 'L3', 'Alice'))
      expect(useGraphStore.getState().getUniqueSpeakers()).toEqual(['Alice', 'Bob'])
    })

    it('excludes empty/undefined speaker', () => {
      useGraphStore.getState().addNode({
        id: 'n1',
        type: 'dialogueNode',
        position: { x: 0, y: 0 },
        data: { id: 'n1', line: 'L', speaker: '' },
      })
      useGraphStore.getState().addNode(makeDialogueNode('n2', 'L2', 'Bob'))
      const speakers = useGraphStore.getState().getUniqueSpeakers()
      expect(speakers).toContain('Bob')
      expect(speakers.filter((s) => s === '')).toHaveLength(0)
    })
  })
})
