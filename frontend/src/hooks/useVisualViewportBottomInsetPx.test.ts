import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { computeVisualViewportBottomInsetPx, useVisualViewportBottomInsetPx } from './useVisualViewportBottomInsetPx'

describe('computeVisualViewportBottomInsetPx', () => {
  it('retourne 0 quand le bas du visual viewport coïncide avec innerHeight', () => {
    const vv = {
      offsetTop: 0,
      height: 640,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }
    Object.defineProperty(window, 'visualViewport', { value: vv, configurable: true })
    Object.defineProperty(window, 'innerHeight', { value: 640, configurable: true })
    expect(computeVisualViewportBottomInsetPx()).toBe(0)
  })

  it('retourne la zone masquée quand le visual viewport est plus court (clavier)', () => {
    const vv = {
      offsetTop: 0,
      height: 340,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }
    Object.defineProperty(window, 'visualViewport', { value: vv, configurable: true })
    Object.defineProperty(window, 'innerHeight', { value: 640, configurable: true })
    expect(computeVisualViewportBottomInsetPx()).toBe(300)
  })
})

describe('useVisualViewportBottomInsetPx', () => {
  const listeners = { resize: new Set<EventListener>(), scroll: new Set<EventListener>() }

  beforeEach(() => {
    vi.clearAllMocks()
    listeners.resize.clear()
    listeners.scroll.clear()
    const vv = {
      offsetTop: 0,
      height: 400,
      width: 375,
      addEventListener: vi.fn((ev: string, fn: EventListener) => {
        if (ev === 'resize') listeners.resize.add(fn)
        if (ev === 'scroll') listeners.scroll.add(fn)
      }),
      removeEventListener: vi.fn((ev: string, fn: EventListener) => {
        if (ev === 'resize') listeners.resize.delete(fn)
        if (ev === 'scroll') listeners.scroll.delete(fn)
      }),
    }
    Object.defineProperty(window, 'visualViewport', { value: vv, configurable: true, writable: true })
    Object.defineProperty(window, 'innerHeight', { value: 800, configurable: true, writable: true })
  })

  afterEach(() => {
    Reflect.deleteProperty(window, 'visualViewport')
  })

  it('met à jour le padding quand visualViewport resize (enabled)', async () => {
    const { result } = renderHook(() => useVisualViewportBottomInsetPx(true))
    await waitFor(() => expect(result.current).toBe(400))

    act(() => {
      Object.assign(window.visualViewport as { height: number }, { height: 700 })
      listeners.resize.forEach((fn) => (fn as () => void)())
    })
    await waitFor(() => expect(result.current).toBe(100))
  })

  it('reste à 0 quand disabled', () => {
    const { result } = renderHook(() => useVisualViewportBottomInsetPx(false))
    expect(result.current).toBe(0)
  })
})
