/**
 * Principe produit : tout est sauvegardé automatiquement, il n'existe pas de sauvegarde
 * manuelle — ni bouton, ni Ctrl+S dans le graphe.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useGraphToolbar } from '../hooks/useGraphToolbar'
import { getAllShortcuts } from '../hooks/useKeyboardShortcuts'
import { useGraphStore } from '../store/graphStore'

vi.mock('../api/graph', () => ({
  loadGraph: vi.fn(),
  saveGraph: vi.fn(),
  saveGraphAndWrite: vi.fn(),
  generateNode: vi.fn(),
  validateGraph: vi.fn(),
  calculateLayout: vi.fn(),
}))

describe('useGraphToolbar — pas de sauvegarde manuelle', () => {
  beforeEach(() => {
    useGraphStore.getState().resetGraph()
  })

  it("n'enregistre aucun raccourci Ctrl+S", () => {
    const { unmount } = renderHook(() => useGraphToolbar(vi.fn(), 'dialogue.json', false))
    expect(getAllShortcuts().map((s) => s.key)).not.toContain('ctrl+s')
    unmount()
  })
})
