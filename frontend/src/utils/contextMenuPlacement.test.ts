import { describe, it, expect, beforeEach } from 'vitest'
import { clampContextMenuToViewport } from './contextMenuPlacement'

describe('clampContextMenuToViewport', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 800 })
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 600 })
  })

  it('clamp à droite et en bas si le menu dépasse', () => {
    const { left, top } = clampContextMenuToViewport(790, 590, 200, 220, 8)
    expect(left + 200).toBeLessThanOrEqual(800 - 8)
    expect(top + 220).toBeLessThanOrEqual(600 - 8)
  })
})
