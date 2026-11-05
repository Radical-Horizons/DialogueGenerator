import { describe, it, expect, vi } from 'vitest'
import { fireEvent, renderHook } from '@testing-library/react'
import { useKeyboardShortcuts } from './useKeyboardShortcuts'

function press(key: string, modifiers: KeyboardEventInit = {}): void {
  fireEvent.keyDown(window, { key, ...modifiers })
}

describe('useKeyboardShortcuts', () => {
  it('déclenche une seule fois quand plusieurs instances sont montées', () => {
    const handler = vi.fn()
    renderHook(() => useKeyboardShortcuts([{ key: 'ctrl+z', handler, description: 'annuler' }]))
    renderHook(() => useKeyboardShortcuts([{ key: 'ctrl+y', handler: vi.fn(), description: 'rétablir' }]))

    press('z', { ctrlKey: true })

    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('appelle le handler du dernier rendu, pas celui du montage', () => {
    const first = vi.fn()
    const second = vi.fn()
    const { rerender } = renderHook(
      ({ handler }) => useKeyboardShortcuts([{ key: 'ctrl+g', handler, description: 'générer' }]),
      { initialProps: { handler: first } },
    )

    rerender({ handler: second })
    press('g', { ctrlKey: true })

    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledTimes(1)
  })

  it('lit `enabled` sur le dernier rendu', () => {
    const handler = vi.fn()
    const { rerender } = renderHook(
      ({ enabled }) => useKeyboardShortcuts([{ key: 'ctrl+g', handler, description: 'générer', enabled }]),
      { initialProps: { enabled: false } },
    )

    press('g', { ctrlKey: true })
    expect(handler).not.toHaveBeenCalled()

    rerender({ enabled: true })
    press('g', { ctrlKey: true })
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('ne confond pas ctrl+shift+z avec ctrl+z', () => {
    const undo = vi.fn()
    const redo = vi.fn()
    renderHook(() =>
      useKeyboardShortcuts([
        { key: 'ctrl+z', handler: undo, description: 'annuler' },
        { key: 'ctrl+shift+z', handler: redo, description: 'rétablir' },
      ]),
    )

    press('Z', { ctrlKey: true, shiftKey: true })

    expect(undo).not.toHaveBeenCalled()
    expect(redo).toHaveBeenCalledTimes(1)
  })

  it('une touche seule ne répond pas à sa combinaison avec Ctrl', () => {
    const pan = vi.fn()
    renderHook(() => useKeyboardShortcuts([{ key: 's', handler: pan, description: 'descendre' }]))

    press('s', { ctrlKey: true })
    expect(pan).not.toHaveBeenCalled()

    press('s')
    expect(pan).toHaveBeenCalledTimes(1)
  })

  it('accepte Maj sur un chiffre : AZERTY en a besoin pour produire la touche', () => {
    const handler = vi.fn()
    renderHook(() => useKeyboardShortcuts([{ key: 'ctrl+1', handler, description: 'section' }]))

    press('1', { ctrlKey: true, shiftKey: true })

    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('retire l’écouteur quand la dernière instance se démonte', () => {
    const handler = vi.fn()
    const { unmount } = renderHook(() =>
      useKeyboardShortcuts([{ key: 'ctrl+g', handler, description: 'générer' }]),
    )

    unmount()
    press('g', { ctrlKey: true })

    expect(handler).not.toHaveBeenCalled()
  })
})
