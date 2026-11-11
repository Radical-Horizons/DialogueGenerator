import { renderHook, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

const apiPost = vi.fn()

vi.mock('../api/client', () => ({
  default: {
    post: (...args: unknown[]) => apiPost(...args),
    get: vi.fn(),
    interceptors: {
      request: { use: vi.fn(), eject: vi.fn(), clear: vi.fn() },
      response: { use: vi.fn(), eject: vi.fn(), clear: vi.fn() },
    },
  },
}))

import { useGddStaleIndicator } from './useGddStaleIndicator'

describe('useGddStaleIndicator', () => {
  beforeEach(() => {
    apiPost.mockReset()
  })

  it('ne marque pas stale sans empreinte ou snapshot', async () => {
    const emptySnapshot: Record<string, unknown> = {}
    const { result } = renderHook(() =>
      useGddStaleIndicator({
        id: 'n1',
        contextGddContentFingerprint: '',
        gddContextSelectionsSnapshot: emptySnapshot,
      }),
    )
    await waitFor(() => expect(result.current.checking).toBe(false))
    expect(result.current.stale).toBe(false)
    expect(apiPost).not.toHaveBeenCalled()
  })

  it('marque stale quand l’API retourne une empreinte différente', async () => {
    const snapshot = { characters: ['X'] }
    apiPost.mockResolvedValue({ data: { fingerprint: 'bbbb' } })
    const { result } = renderHook(() =>
      useGddStaleIndicator({
        id: 'n1',
        contextGddContentFingerprint: 'aaaa',
        gddContextSelectionsSnapshot: snapshot,
      }),
    )
    await waitFor(() => expect(result.current.checking).toBe(false), { timeout: 4000 })
    expect(result.current.stale).toBe(true)
    expect(apiPost).toHaveBeenCalled()
  })

  it('n’envoie que le snapshot : l’empreinte ignore les réglages d’affichage du contexte', async () => {
    const snapshot = { characters_full: ['X'] }
    apiPost.mockResolvedValue({ data: { fingerprint: 'v2:aaaa' } })
    const { result } = renderHook(() =>
      useGddStaleIndicator({
        id: 'n1',
        contextGddContentFingerprint: 'v2:aaaa',
        gddContextSelectionsSnapshot: snapshot,
      }),
    )
    await waitFor(() => expect(result.current.checking).toBe(false), { timeout: 4000 })
    expect(result.current.stale).toBe(false)
    expect(apiPost).toHaveBeenCalledWith('/api/v1/context/gdd-content-fingerprint', {
      context_selections: snapshot,
    })
  })

  it('ne compare pas une empreinte de l’ancien calcul à une empreinte versionnée', async () => {
    const snapshot = { characters_full: ['X'] }
    apiPost.mockResolvedValue({ data: { fingerprint: 'v2:bbbb' } })
    const { result } = renderHook(() =>
      useGddStaleIndicator({
        id: 'n1',
        contextGddContentFingerprint: 'a'.repeat(64),
        gddContextSelectionsSnapshot: snapshot,
      }),
    )
    await waitFor(() => expect(result.current.checking).toBe(false), { timeout: 4000 })
    expect(result.current.stale).toBe(false)
  })
})
