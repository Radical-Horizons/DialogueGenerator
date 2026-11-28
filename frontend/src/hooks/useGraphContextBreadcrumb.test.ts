/**
 * Fil d'Ariane graphe — segments PNJ de la scène › dialogue › nœud.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useGraphContextBreadcrumb } from './useGraphContextBreadcrumb'
import { useContextStore } from '../store/contextStore'
import { useGraphStore } from '../store/graphStore'

describe('useGraphContextBreadcrumb', () => {
  beforeEach(() => {
    useGraphStore.getState().resetGraph()
    useContextStore.setState((s) => ({
      selections: { ...s.selections, characters_full: ['Personnage de la colonne'] },
    }))
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

  it('montre le PNJ du dialogue, jamais les personnages de la colonne', () => {
    const { result } = renderHook(() => useGraphContextBreadcrumb())
    expect(result.current.contextLabel).toBe('Avili')
    expect(result.current.dialogueLabel).toBe('Révision imprévue auprès de la seigneurie')
    expect(result.current.nodeLabel).toBe('Entrée')
  })

  it('suit la fiche enregistrée, avec (+N) pour les autres PNJ', () => {
    useGraphStore.setState({
      scene: {
        npcs: ['Alice', 'Bob', 'Charlie'].map((name) => ({ name, entryId: null })),
        pc: null,
        place: null,
        brief: '',
        linkedEntries: [],
      },
    })
    const { result } = renderHook(() => useGraphContextBreadcrumb())
    expect(result.current.contextLabel).toBe('Alice (+2)')
  })
})
