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

vi.mock('../store/contextConfigStore', () => ({
  useContextConfigStore: {
    getState: () => ({
      fieldConfigs: {},
      essentialFields: {},
      organization: 'narrative' as const,
    }),
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
    await waitFor(() => expect(result.current.checking).toBe(false))
    expect(result.current.stale).toBe(true)
    expect(apiPost).toHaveBeenCalled()
  })
})
