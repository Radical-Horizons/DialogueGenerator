import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useAuthStore } from './authStore'

vi.mock('../api/auth')

describe('authStore admin identity', () => {
  beforeEach(() => {
    localStorage.clear()
    useAuthStore.setState({
      user: null,
      isAuthenticated: false,
      isLoading: false,
    })
  })

  it('conserve le rôle admin dans le bypass de développement', async () => {
    await useAuthStore.getState().initialize()

    expect(useAuthStore.getState().user).toMatchObject({
      username: 'admin',
      role: 'admin',
      is_active: true,
    })
    expect(useAuthStore.getState().isAuthenticated).toBe(true)
  })
})
