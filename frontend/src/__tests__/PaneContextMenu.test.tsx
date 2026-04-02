/**
 * Story 2.12 (FR33): Actions contextuelles — menu clic droit sur fond du graphe.
 * Task 2.1 + Task 4.2 : Tests unitaires PaneContextMenu.
 * AC #3 : affiche "Nouveau nœud" et "Auto-layout".
 * AC #4 : clic "Nouveau nœud" appelle onCreateNode() puis onClose().
 * AC #5 : clic "Auto-layout" appelle onAutoLayout() puis onClose().
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { PaneContextMenu } from '../components/graph/PaneContextMenu'

function renderPaneMenu(overrides?: {
  onCreateNode?: () => void
  onAutoLayout?: () => void
  onClose?: () => void
}) {
  const onCreateNode = overrides?.onCreateNode ?? vi.fn()
  const onAutoLayout = overrides?.onAutoLayout ?? vi.fn()
  const onClose = overrides?.onClose ?? vi.fn()
  render(
    React.createElement(PaneContextMenu, {
      top: 200,
      left: 150,
      onCreateNode,
      onAutoLayout,
      onClose,
    })
  )
  return { onCreateNode, onAutoLayout, onClose }
}

describe('PaneContextMenu — Story 2.12', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('AC #3 : affiche "Nouveau nœud" et "Auto-layout"', () => {
    renderPaneMenu()
    expect(screen.getByText('Nouveau nœud')).toBeTruthy()
    expect(screen.getByText('Auto-layout')).toBeTruthy()
  })

  it('AC #4 : clic "Nouveau nœud" appelle onCreateNode() puis onClose()', () => {
    const onCreateNode = vi.fn()
    const onClose = vi.fn()
    renderPaneMenu({ onCreateNode, onClose })

    const btn = screen.getByText('Nouveau nœud').closest('button')!
    fireEvent.click(btn)

    expect(onCreateNode).toHaveBeenCalledOnce()
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('AC #5 : clic "Auto-layout" appelle onAutoLayout() puis onClose()', () => {
    const onAutoLayout = vi.fn()
    const onClose = vi.fn()
    renderPaneMenu({ onAutoLayout, onClose })

    const btn = screen.getByText('Auto-layout').closest('button')!
    fireEvent.click(btn)

    expect(onAutoLayout).toHaveBeenCalledOnce()
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('AC #3 : positionné via les props top/left (position fixed)', () => {
    const { container } = render(
      React.createElement(PaneContextMenu, {
        top: 99,
        left: 77,
        onCreateNode: vi.fn(),
        onAutoLayout: vi.fn(),
        onClose: vi.fn(),
      })
    )
    const menu = container.firstChild as HTMLElement
    expect(menu.style.top).toBe('99px')
    expect(menu.style.left).toBe('77px')
  })
})
