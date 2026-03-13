/**
 * Story 2.12 (FR33): Actions contextuelles sur nœuds — menu clic droit.
 * Task 1.1 + Task 4.1 : Tests unitaires NodeContextMenu.
 * AC #1 : bouton "Éditer" présent en première position avant "Générer".
 * AC #2 : clic "Éditer" appelle setSelectedNode(id) et onClose().
 * AC #4.4 : non-régression — options existantes toujours présentes.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { ReactFlowProvider } from 'reactflow'
import { NodeContextMenu } from '../components/graph/NodeContextMenu'

const mockSetSelectedNode = vi.fn()
const mockDuplicateNode = vi.fn()
const mockSetShowDeleteNodeConfirm = vi.fn()

vi.mock('../store/graphStore', () => ({
  useGraphStore: () => ({
    setSelectedNode: mockSetSelectedNode,
    duplicateNode: mockDuplicateNode,
    setShowDeleteNodeConfirm: mockSetShowDeleteNodeConfirm,
  }),
}))

const mockGetNode = vi.fn()

vi.mock('reactflow', async (importOriginal) => {
  const mod = await importOriginal<typeof import('reactflow')>()
  return {
    ...mod,
    useReactFlow: () => ({
      getNode: mockGetNode,
    }),
  }
})

function renderMenu(id = 'node-abc', onClose = vi.fn()) {
  return render(
    React.createElement(
      ReactFlowProvider,
      null,
      React.createElement(NodeContextMenu, { id, top: 100, left: 100, onClose })
    )
  )
}

describe('NodeContextMenu — Story 2.12', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetNode.mockReturnValue({ type: 'dialogueNode' })
  })

  it('AC #1 : affiche le bouton "Éditer"', () => {
    renderMenu()
    expect(screen.getByText('Éditer')).toBeTruthy()
  })

  it('AC #2 : clic "Éditer" appelle setSelectedNode(id) puis onClose()', () => {
    const onClose = vi.fn()
    renderMenu('node-xyz', onClose)

    const editBtn = screen.getByText('Éditer').closest('button')!
    fireEvent.click(editBtn)

    expect(mockSetSelectedNode).toHaveBeenCalledWith('node-xyz')
    expect(onClose).toHaveBeenCalled()
  })

  it('AC #1 : "Éditer" apparaît avant "Générer" dans le DOM', () => {
    renderMenu()
    const buttons = screen.getAllByRole('menuitem')
    const editIdx = buttons.findIndex((b) => b.textContent?.includes('Éditer'))
    const genIdx = buttons.findIndex((b) => b.textContent?.includes('Générer'))
    expect(editIdx).toBeGreaterThanOrEqual(0)
    expect(genIdx).toBeGreaterThanOrEqual(0)
    expect(editIdx).toBeLessThan(genIdx)
  })

  it('AC #4.4 (non-régression) : options existantes toujours présentes', () => {
    renderMenu()
    expect(screen.getByText('Générer')).toBeTruthy()
    expect(screen.getByText('Voir le prompt')).toBeTruthy()
    expect(screen.getByText('Dupliquer')).toBeTruthy()
    expect(screen.getByText('Supprimer')).toBeTruthy()
  })
})
