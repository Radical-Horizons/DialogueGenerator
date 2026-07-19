import { beforeEach, describe, expect, it, vi } from 'vitest'

import * as authAPI from '../api/auth'
import { resetAuthInitializeLock, useAuthStore } from './authStore'

vi.mock('../api/auth')
vi.mock('../hooks/useUserSettingsSync', () => ({
  resetUserSettingsSync: vi.fn(),
  synchronizeUserSettings: vi.fn().mockResolvedValue(undefined),
}))

const mockedAuth = vi.mocked(authAPI)

const guestUser = {
  id: 'guest-id',
  username: 'guest',
  email: '',
  role: 'guest' as const,
  is_active: true,
}

const writerUser = {
  id: 'writer-id',
  username: 'writer',
  email: 'w@example.com',
  role: 'writer' as const,
  is_active: true,
}

/** JWT non expiré (exp lointain) pour les tests de session. */
function makeValidToken(): string {
  const header = btoa(JSON.stringify({ alg: 'none' }))
  const payload = btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 }))
  return `${header}.${payload}.sig`
}

describe('authStore guest-first', () => {
  beforeEach(() => {
    localStorage.clear()
    resetAuthInitializeLock()
    vi.clearAllMocks()
    useAuthStore.setState({
      user: null,
      isAuthenticated: false,
      isLoading: false,
      bootError: null,
    })
    mockedAuth.loginAsGuest.mockResolvedValue({
      access_token: 'guest-token',
      token_type: 'bearer',
    })
    mockedAuth.getCurrentUser.mockResolvedValue(guestUser)
    mockedAuth.logout.mockResolvedValue(undefined)
  })

  it('initialize sans token établit une session guest', async () => {
    await useAuthStore.getState().initialize()

    expect(mockedAuth.loginAsGuest).toHaveBeenCalledOnce()
    expect(useAuthStore.getState().user).toMatchObject({ role: 'guest' })
    expect(useAuthStore.getState().isAuthenticated).toBe(true)
  })

  it('initialize avec token valide restaure le user sans guest', async () => {
    localStorage.setItem('access_token', makeValidToken())
    mockedAuth.getCurrentUser.mockResolvedValue(writerUser)

    await useAuthStore.getState().initialize()

    expect(mockedAuth.loginAsGuest).not.toHaveBeenCalled()
    expect(useAuthStore.getState().user).toMatchObject({ role: 'writer', username: 'writer' })
  })

  it('initialize avec token 401 bascule en guest', async () => {
    localStorage.setItem('access_token', makeValidToken())
    mockedAuth.getCurrentUser
      .mockRejectedValueOnce({ response: { status: 401 } })
      .mockResolvedValueOnce(guestUser)

    await useAuthStore.getState().initialize()

    expect(mockedAuth.loginAsGuest).toHaveBeenCalledOnce()
    expect(useAuthStore.getState().user).toMatchObject({ role: 'guest' })
  })

  it('logout clear puis re-guest', async () => {
    useAuthStore.setState({ user: writerUser, isAuthenticated: true })
    localStorage.setItem('access_token', 'old')

    await useAuthStore.getState().logout()

    expect(mockedAuth.logout).toHaveBeenCalled()
    expect(mockedAuth.loginAsGuest).toHaveBeenCalledOnce()
    expect(useAuthStore.getState().user).toMatchObject({ role: 'guest' })
    expect(useAuthStore.getState().isAuthenticated).toBe(true)
  })

  it('initialize concurrent partage la même promesse', async () => {
    const first = useAuthStore.getState().initialize()
    const second = useAuthStore.getState().initialize()
    await Promise.all([first, second])

    expect(mockedAuth.loginAsGuest).toHaveBeenCalledOnce()
  })

  it('échec guest laisse bootError et permet un retry initialize', async () => {
    mockedAuth.loginAsGuest.mockRejectedValueOnce(new Error('network'))

    await useAuthStore.getState().initialize()

    expect(useAuthStore.getState().isAuthenticated).toBe(false)
    expect(useAuthStore.getState().bootError).toMatch(/invité/i)

    mockedAuth.loginAsGuest.mockResolvedValueOnce({
      access_token: 'guest-token',
      token_type: 'bearer',
    })
    await useAuthStore.getState().initialize()

    expect(useAuthStore.getState().user).toMatchObject({ role: 'guest' })
    expect(useAuthStore.getState().bootError).toBeNull()
  })
})
