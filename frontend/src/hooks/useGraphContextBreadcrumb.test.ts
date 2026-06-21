/**
 * Fil d'Ariane graphe — segments contexte › dialogue › nœud.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useGraphContextBreadcrumb } from './useGraphContextBreadcrumb'
import { useContextStore } from '../store/contextStore'
import { useGraphStore } from '../store/graphStore'

describe('useGraphContextBreadcrumb', () => {
  beforeEach(() => {
    useContextStore.setState({
      selections: {
        characters_full: ['Akthar-Neth Amatru'],
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
        narrative_structures: [],
        chapters: [],
        scenes: [],
      },
    })
    useGraphStore.setState({
      dialogueMetadata: {
        title: 'Révision imprévue auprès de la seigneurie',
        node_count: 3,
        edge_count: 2,
        filename: 'dialogue_unity.json',
      },
      selectedNodeId: 'START',
      nodes: [
        {
          id: 'START',
          type: 'dialogueNode',
          position: { x: 0, y: 0 },
          data: { title: 'Entrée', speaker: 'Avili', line: 'Bonjour' },
        },
      ],
    })
  })

  it('compose les trois segments du fil d’Ariane', () => {
    const { result } = renderHook(() => useGraphContextBreadcrumb())
    expect(result.current.contextLabel).toBe('Akthar-Neth Amatru')
    expect(result.current.dialogueLabel).toBe('Révision imprévue auprès de la seigneurie')
    expect(result.current.nodeLabel).toBe('Entrée')
  })

  it('affiche (+N) quand plusieurs personnages sont sélectionnés', () => {
    useContextStore.setState((s) => ({
      selections: {
        ...s.selections,
        characters_full: ['Alice', 'Bob', 'Charlie'],
      },
    }))
    const { result } = renderHook(() => useGraphContextBreadcrumb())
    expect(result.current.contextLabel).toBe('Alice (+2)')
  })
})
